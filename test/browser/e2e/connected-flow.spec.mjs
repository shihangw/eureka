import {
  collectProblems,
  expect,
  expectPopupCount,
  openExtensionApi,
  openOptionsFromPopup,
  test,
} from '../extension.mjs';
import { expectLinksRendered, loadLinksBaseline, bookmarkLinksTargets } from './links.mjs';

test('bookmark, popup, options and rendering work together in the built extension', async ({
  extension,
}) => {
  const problems = collectProblems(extension.context);
  const api = await openExtensionApi(extension);
  const page = await extension.context.newPage();
  const baseline = await loadLinksBaseline(page);

  const folder = await test.step('create real bookmarks', () =>
    bookmarkLinksTargets(api, 'Eureka e2e connected flow'));

  await test.step('fixture highlights repeated and nested matches in yellow', () =>
    expectLinksRendered(page, baseline, 'yellow'));

  await test.step('popup counts both URLs', () => expectPopupCount(extension, 2));

  await test.step('popup button opens options and glow is saved', async () => {
    const { popup, options } = await openOptionsFromPopup(extension);
    await expect(popup.locator('#bookmark-count')).toHaveText('2');
    await expect(options.locator('input[value="yellow"]')).toBeChecked();
    await options.locator('input[value="glow"]').check();
    await expect(options.locator('#save-status')).toHaveText('Saved');
    await Promise.all([options.close(), popup.close()]);
  });

  await test.step('reopened options keep glow', async () => {
    const { popup, options } = await openOptionsFromPopup(extension);
    await expect(options.locator('input[name="highlight-style"]:checked')).toHaveCount(1);
    await expect(options.locator('input[value="glow"]')).toBeChecked();
    await Promise.all([options.close(), popup.close()]);
  });

  await test.step('reloaded fixture renders glow with controls unchanged', () =>
    expectLinksRendered(page, baseline, 'glow'));

  await api.removeTree(folder.id);
  expect(problems).toEqual([]);
});
