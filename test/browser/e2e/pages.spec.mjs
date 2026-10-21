import {
  collectProblems,
  expect,
  expectBookmarkState,
  expectPopupCount,
  openExtensionApi,
  openOptionsFromPopup,
  test,
} from '../extension.mjs';
import { STYLES } from '../rendering.mjs';
import {
  ALPHA_URL,
  BETA_URL,
  bookmarkLinksTargets,
  expectLinksRendered,
  loadLinksBaseline,
} from './links.mjs';

const candidates = [ALPHA_URL, BETA_URL];

/** Asserts the options page shows the three existing choices with exactly `style` checked. */
async function expectChecked(options, style) {
  const radios = options.locator('input[name="highlight-style"]');
  await expect(radios).toHaveCount(3);
  expect(await radios.evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual(STYLES);
  await expect(options.locator('input[name="highlight-style"]:checked')).toHaveCount(1);
  await expect(options.locator(`input[name="highlight-style"][value="${style}"]`)).toBeChecked();
}

test('popup shows the unique bookmarked-URL count after each processed mutation', async ({
  extension,
}, testInfo) => {
  const problems = collectProblems(extension.context);
  const api = await openExtensionApi(extension);
  const note = (type, description) => testInfo.annotations.push({ type, description });

  // A fresh profile only has Chromium's empty default folders.
  expect(await api.count()).toEqual({ count: 0 });

  const root = await api.createBookmark({ title: 'Eureka e2e popup count' });
  const one = await api.createBookmark({ parentId: root.id, title: 'One' });
  const two = await api.createBookmark({ parentId: root.id, title: 'Two' });
  await test.step('only empty folders: 0', async () => {
    await expectBookmarkState(api, { candidates, bookmarked: [], count: 0 });
    await expectPopupCount(extension, 0);
  });

  const alphaOne = await api.createBookmark({ parentId: one.id, title: 'A', url: ALPHA_URL });
  const alphaTwo = await api.createBookmark({ parentId: two.id, title: 'A', url: ALPHA_URL });
  const beta = await api.createBookmark({ parentId: two.id, title: 'B', url: BETA_URL });
  note('nodes', [alphaOne, alphaTwo, beta].map((node) => `${node.id}=${node.url}`).join(' '));
  await test.step('three nodes, duplicate A across folders: 2', async () => {
    await expectBookmarkState(api, { candidates, bookmarked: candidates, count: 2 });
    await expectPopupCount(extension, 2);
  });

  await test.step('remove one duplicate A: still 2', async () => {
    await api.removeBookmark(alphaTwo.id);
    await expect.poll(async () => (await api.getChildren(two.id)).length).toBe(1);
    await expectPopupCount(extension, 2);
  });

  await test.step('remove B: 1', async () => {
    await api.removeBookmark(beta.id);
    await expectPopupCount(extension, 1);
  });

  await test.step('remove the fixture folders: 0', async () => {
    await api.removeTree(root.id);
    await expectPopupCount(extension, 0);
  });

  expect(problems).toEqual([]);
});

test('popup button opens options; each choice saves, survives reopening and renders', async ({
  extension,
}, testInfo) => {
  const problems = collectProblems(extension.context);
  const api = await openExtensionApi(extension);
  const page = await extension.context.newPage();
  const baseline = await loadLinksBaseline(page);
  const folder = await bookmarkLinksTargets(api, 'Eureka e2e options');

  await test.step('missing preference: yellow checked and rendered', async () => {
    const { popup, options } = await openOptionsFromPopup(extension);
    expect(options.url()).toBe(extension.extensionUrl('options.html'));
    expect(await api.getStyle()).toBeUndefined();
    await expectChecked(options, 'yellow');
    await expect(options.locator('#save-status')).toHaveText('');
    await Promise.all([options.close(), popup.close()]);
    await expectLinksRendered(page, baseline, 'yellow');
  });

  // Yellow is checked by default, so it is chosen last, after a different saved style.
  for (const style of ['underline', 'glow', 'yellow']) {
    await test.step(`choose ${style}`, async () => {
      const opened = await openOptionsFromPopup(extension);
      await opened.options.locator(`input[name="highlight-style"][value="${style}"]`).check();
      await expectChecked(opened.options, style);
      await expect(opened.options.locator('#save-status')).toHaveText('Saved');
      await expect.poll(() => api.getStyle()).toBe(style);
      await Promise.all([opened.options.close(), opened.popup.close()]);

      const reopened = await openOptionsFromPopup(extension);
      await expectChecked(reopened.options, style);
      await expect(reopened.options.locator('#save-status')).toHaveText('');
      await Promise.all([reopened.options.close(), reopened.popup.close()]);

      await expectLinksRendered(page, baseline, style);
      testInfo.annotations.push({ type: 'saved', description: `${style} restored and rendered` });
    });
  }

  await api.removeTree(folder.id);
  expect(problems).toEqual([]);
});
