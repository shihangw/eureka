import {
  expect,
  expectBookmarkState,
  highlightedIds,
  loadFixture,
  openExtensionApi,
  test,
} from '../extension.mjs';
import { FIXTURE_ANCHORS, TARGET_URLS } from '../server.mjs';

const { alpha, beta, gamma, control } = TARGET_URLS;
const candidates = [alpha, beta, gamma, control, FIXTURE_ANCHORS['alpha-query']];
const alphaAnchors = ['alpha-1', 'alpha-2', 'alpha-data-href'];

test('real bookmark mutations update lookups, unique counts and fresh pages', async ({
  extension,
}, testInfo) => {
  const api = await openExtensionApi(extension);
  const page = await extension.context.newPage();
  const note = (type, description) => testInfo.annotations.push({ type, description });

  const { count: start } = await api.count();
  expect(start).toEqual(expect.any(Number));
  note('starting count', String(start));
  await expectBookmarkState(api, { candidates, bookmarked: [], count: start });

  const root = await api.createBookmark({ title: 'Eureka integration fixture' });
  const folderOne = await api.createBookmark({ parentId: root.id, title: 'Folder one' });
  const folderTwo = await api.createBookmark({ parentId: root.id, title: 'Folder two' });
  const nested = await api.createBookmark({ parentId: folderOne.id, title: 'Nested' });
  note('folders', `root=${root.id} one=${folderOne.id} two=${folderTwo.id} nested=${nested.id}`);
  await expectBookmarkState(api, { candidates, bookmarked: [], count: start });

  let alphaNode;
  let nestedAlphaNode;
  let betaNode;

  await test.step('create A', async () => {
    alphaNode = await api.createBookmark({ parentId: folderOne.id, title: 'A', url: alpha });
    note('create A', `id=${alphaNode.id} expect {A} count +1`);
    await expectBookmarkState(api, { candidates, bookmarked: [alpha], count: start + 1 });
    const { anchors } = await loadFixture(page);
    expect(highlightedIds(anchors)).toEqual(alphaAnchors);
  });

  await test.step('create nested duplicate A', async () => {
    nestedAlphaNode = await api.createBookmark({
      parentId: nested.id,
      title: 'A again',
      url: alpha,
    });
    note('duplicate A', `id=${nestedAlphaNode.id} expect {A} count +1`);
    await expectBookmarkState(api, { candidates, bookmarked: [alpha], count: start + 1 });
  });

  await test.step('create B', async () => {
    betaNode = await api.createBookmark({ parentId: folderTwo.id, title: 'B', url: beta });
    note('create B', `id=${betaNode.id} expect {A,B} count +2`);
    await expectBookmarkState(api, { candidates, bookmarked: [alpha, beta], count: start + 2 });
  });

  await test.step('change B to C', async () => {
    const changed = await api.updateBookmark(betaNode.id, { url: gamma });
    expect(changed.url).toBe(gamma);
    note('change B->C', `id=${betaNode.id} expect {A,C} count +2`);
    await expectBookmarkState(api, { candidates, bookmarked: [alpha, gamma], count: start + 2 });
    const { anchors } = await loadFixture(page);
    expect(highlightedIds(anchors)).toEqual([...alphaAnchors, 'gamma'].sort());
  });

  await test.step('move C between fixture folders', async () => {
    await api.moveBookmark(betaNode.id, { parentId: folderOne.id });
    const [moved] = await api.getBookmarks([betaNode.id]);
    expect(moved.parentId).toBe(folderOne.id);
    expect(await api.getChildren(folderTwo.id)).toEqual([]);
    note('move C', `id=${betaNode.id} ${folderTwo.id}->${folderOne.id} expect {A,C} count +2`);
    await expectBookmarkState(api, { candidates, bookmarked: [alpha, gamma], count: start + 2 });
  });

  await test.step('remove one A node', async () => {
    await api.removeBookmark(nestedAlphaNode.id);
    note('remove one A', `id=${nestedAlphaNode.id} expect {A,C} count +2`);
    await expectBookmarkState(api, { candidates, bookmarked: [alpha, gamma], count: start + 2 });
    const { anchors } = await loadFixture(page);
    expect(highlightedIds(anchors)).toEqual([...alphaAnchors, 'gamma'].sort());
  });

  await test.step('remove the last A node', async () => {
    await api.removeBookmark(alphaNode.id);
    note('remove last A', `id=${alphaNode.id} expect {C} count +1`);
    await expectBookmarkState(api, { candidates, bookmarked: [gamma], count: start + 1 });
    const { anchors } = await loadFixture(page);
    expect(highlightedIds(anchors)).toEqual(['gamma']);
  });

  await test.step('remove the fixture folders', async () => {
    await api.removeTree(root.id);
    await expect(api.getBookmarks([root.id])).rejects.toThrow();
    note('remove folders', `id=${root.id} expect {} starting count`);
    await expectBookmarkState(api, { candidates, bookmarked: [], count: start });
    const { anchors } = await loadFixture(page);
    expect(highlightedIds(anchors)).toEqual([]);
  });
});
