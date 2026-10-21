import {
  expect,
  expectBookmarkState,
  highlightedIds,
  loadFixture,
  observeWorkerStatus,
  openExtensionApi,
  runningWorkerTargetIds,
  stopExtensionWorker,
  test,
} from '../extension.mjs';
import { FIXTURE_ANCHORS, TARGET_URLS } from '../server.mjs';

const { alpha, beta, gamma, control } = TARGET_URLS;
const candidates = [alpha, beta, gamma, control, FIXTURE_ANCHORS['alpha-query']];
const expectedHighlights = ['alpha-1', 'alpha-2', 'alpha-data-href', 'beta'];

/** Text decoration line of every highlight span inside each highlighted anchor. */
const decorations = (page) =>
  page.evaluate((ids) => {
    const result = {};
    for (const id of ids) {
      result[id] = [...document.querySelectorAll(`#${id} span[class^="eureka-highlight-"]`)].map(
        (span) => getComputedStyle(span).textDecorationLine
      );
    }
    return result;
  }, expectedHighlights);

const currentTimeOrigin = (extension) =>
  extension.context
    .serviceWorkers()
    .find((worker) => worker.url() === extension.extensionUrl('scripts/background.js'))
    .evaluate(() => performance.timeOrigin);

test('forced worker stop keeps real bookmarks, unique count, rendering and saved style', async ({
  extension,
}, testInfo) => {
  const note = (type, description) => testInfo.annotations.push({ type, description });
  const api = await openExtensionApi(extension);
  const page = await extension.context.newPage();
  const { count: start } = await api.count();

  const root = await api.createBookmark({ title: 'Eureka lifecycle fixture' });
  const nested = await api.createBookmark({ parentId: root.id, title: 'Nested' });
  const nodes = [
    await api.createBookmark({ parentId: root.id, title: 'A', url: alpha }),
    await api.createBookmark({ parentId: nested.id, title: 'A again', url: alpha }),
    await api.createBookmark({ parentId: root.id, title: 'B', url: beta }),
  ];
  await api.setStyle('underline');
  note('fixture bookmarks', nodes.map((node) => `${node.id}=${node.url}`).join(' '));

  await expectBookmarkState(api, { candidates, bookmarked: [alpha, beta], count: start + 2 });
  const before = await loadFixture(page);
  expect(highlightedIds(before.anchors)).toEqual(expectedHighlights);
  for (const id of expectedHighlights) {
    expect(new Set(before.anchors[id])).toEqual(new Set(['eureka-highlight-underline']));
  }
  const decorationsBefore = await decorations(page);
  expect(Object.values(decorationsBefore).flat()).toEqual(expect.arrayContaining(['underline']));
  expect(
    Object.values(decorationsBefore)
      .flat()
      .every((line) => line === 'underline')
  ).toBe(true);

  const timeOriginBefore = await currentTimeOrigin(extension);
  const status = await observeWorkerStatus(api.page);
  try {
    await status.waitFor('running');

    const stopMark = status.statuses.length;
    const stoppedTargetId = await stopExtensionWorker(extension);
    await status.waitFor('stopped', stopMark);
    expect(await runningWorkerTargetIds(extension)).toEqual([]);
    note('stopped target', stoppedTargetId);

    // Ordinary navigation: the content script's lookup message wakes the worker.
    const wakeMark = status.statuses.length;
    const after = await loadFixture(page);
    await status.waitFor('running', wakeMark);
    note('worker statuses', status.statuses.join(' -> '));

    expect(after.message).toBe(before.message);
    expect(after.anchors).toEqual(before.anchors);
    expect(await decorations(page)).toEqual(decorationsBefore);

    const restartedTargetIds = await runningWorkerTargetIds(extension);
    expect(restartedTargetIds).toHaveLength(1);
    note(
      'restarted target',
      `${restartedTargetIds[0]} (reused: ${restartedTargetIds[0] === stoppedTargetId})`
    );

    const timeOriginAfter = await currentTimeOrigin(extension);
    expect(timeOriginAfter).toBeGreaterThan(timeOriginBefore);
    note('timeOrigin', `${timeOriginBefore} -> ${timeOriginAfter}`);
  } finally {
    await status.detach();
  }

  expect(await api.lookup(candidates)).toEqual({ bookmarkedUrls: [alpha, beta] });
  expect(await api.count()).toEqual({ count: start + 2 });
  expect(await api.getStyle()).toBe('underline');
  const stored = await api.getBookmarks(nodes.map((node) => node.id));
  expect(stored.map((node) => [node.id, node.url])).toEqual(
    nodes.map((node) => [node.id, node.url])
  );
  expect(new URL(extension.worker.url()).hostname).toBe(extension.extensionId);

  await api.removeTree(root.id);
  await expectBookmarkState(api, { candidates, bookmarked: [], count: start });
});
