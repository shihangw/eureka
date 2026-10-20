import { collectProblems, expect, loadFixture, openExtensionApi, test } from '../extension.mjs';
import {
  E2E_TARGET_PATHS,
  LINKS_MATCHED,
  LINKS_UNMATCHED,
  SELECTION_PATH,
  selectionAnchors,
} from '../pages.mjs';
import { STYLES, expectHighlighted, expectNotHighlighted, readElements } from '../rendering.mjs';
import { FIXTURE_ORIGIN } from '../server.mjs';
import {
  ALPHA_URL,
  bookmarkLinksTargets,
  expectLinksRendered,
  loadLinksBaseline,
} from './links.mjs';

test('exact URLs highlight repeated and nested links but no near-miss variants', async ({
  extension,
}, testInfo) => {
  const problems = collectProblems(extension.context);
  const api = await openExtensionApi(extension);
  const page = await extension.context.newPage();

  const baseline = await loadLinksBaseline(page);
  const folder = await bookmarkLinksTargets(api, 'Eureka e2e exact matching');

  const current = await expectLinksRendered(page, baseline, 'yellow');
  testInfo.annotations.push(
    ...LINKS_MATCHED.map((id) => ({
      type: 'highlighted',
      description: `${id} -> ${current[id].destination}`,
    })),
    ...LINKS_UNMATCHED.map((id) => ({
      type: 'not highlighted',
      description: `${id} -> ${current[id].destination}`,
    }))
  );

  expect(current['repeat-1'].destination).toBe(ALPHA_URL);
  expect(current['repeat-2'].destination).toBe(ALPHA_URL);
  expect(current['repeat-2'].html).toBe('Alpha <em>repeated</em> link');
  expect(current.nested.html).toBe('<strong>Beta</strong> with <em>nested <code>text</code></em>');
  expect(current.nested.texts.map((entry) => entry.text)).toEqual([
    'Beta',
    ' with ',
    'nested ',
    'text',
  ]);
  expect(current.query.destination).toBe(`${ALPHA_URL}?variant=1`);
  expect(current.fragment.destination).toBe(`${ALPHA_URL}#details`);
  expect(current['trailing-slash'].destination).toBe(`${ALPHA_URL}/`);
  expect(current.prefix.destination).toBe(`${ALPHA_URL}bet`);

  await api.removeTree(folder.id);
  expect(problems).toEqual([]);
});

test('data-href, relative and fragment selection rules keep their semantics', async ({
  extension,
}, testInfo) => {
  const problems = collectProblems(extension.context);
  const api = await openExtensionApi(extension);
  const page = await extension.context.newPage();
  const anchors = selectionAnchors(FIXTURE_ORIGIN);
  const ids = Object.keys(anchors);
  const url = `${FIXTURE_ORIGIN}${SELECTION_PATH}`;

  const before = await loadFixture(page, { url, ids });
  expect(before.message).toBe('Eureka: highlighting 0 of 5 links');
  const baseline = await readElements(page, ids);

  const folder = await api.createBookmark({ title: 'Eureka e2e selection rules' });
  const bookmarked = ['alpha', 'beta', 'gamma', 'deltaSection'].map(
    (key) => `${FIXTURE_ORIGIN}${E2E_TARGET_PATHS[key]}`
  );
  for (const target of bookmarked) {
    await api.createBookmark({ parentId: folder.id, title: target, url: target });
  }
  const selected = ids.map((id) => anchors[id].selected).filter(Boolean);
  // The unlisted data-href and the fragment-less delta URL stay unbookmarked.
  const lookupCandidates = [...selected, `${FIXTURE_ORIGIN}/targets/delta`];
  await expect
    .poll(async () => [...(await api.lookup(lookupCandidates)).bookmarkedUrls].sort())
    .toEqual([...bookmarked].sort());

  const after = await loadFixture(page, { url, ids });
  expect(after.message).toBe('Eureka: highlighting 4 of 5 links');
  const current = await readElements(page, ids);

  for (const [id, expected] of Object.entries(anchors)) {
    await test.step(`${id}: ${expected.selected ?? 'excluded'}`, async () => {
      testInfo.annotations.push({
        type: id,
        description: `selected=${expected.selected ?? 'excluded'} highlighted=${expected.highlighted}`,
      });
      expect(current[id].attributes).toEqual({ id, ...expected.attributes });
      if (expected.highlighted) {
        expect(bookmarked).toContain(expected.selected);
        expectHighlighted(current, baseline, [id], 'yellow');
      } else {
        expectNotHighlighted(current, baseline, [id]);
      }
    });
  }

  await api.removeTree(folder.id);
  expect(problems).toEqual([]);
});

test('default and each stored style render their computed effect without leaking', async ({
  extension,
}, testInfo) => {
  const problems = collectProblems(extension.context);
  const api = await openExtensionApi(extension);
  const page = await extension.context.newPage();

  const baseline = await loadLinksBaseline(page);
  const folder = await bookmarkLinksTargets(api, 'Eureka e2e styles');

  await test.step('missing preference renders yellow', async () => {
    expect(await api.getStyle()).toBeUndefined();
    await expectLinksRendered(page, baseline, 'yellow');
  });

  for (const style of STYLES) {
    await test.step(`stored ${style} renders ${style}`, async () => {
      await api.setStyle(style);
      expect(await api.getStyle()).toBe(style);
      const current = await expectLinksRendered(page, baseline, style);
      testInfo.annotations.push({
        type: style,
        description: JSON.stringify(current['repeat-1'].highlights[0].style),
      });
    });
  }

  await api.removeTree(folder.id);
  expect(problems).toEqual([]);
});
