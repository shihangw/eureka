/**
 * Launches the built dist/ extension in Playwright's bundled full Chromium
 * with a disposable persistent profile, and wraps the real extension APIs the
 * browser tests use.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test as base } from '@playwright/test';
import { FIXTURE_ANCHORS, FIXTURE_URL } from './server.mjs';

export const DIST_DIR = fileURLToPath(new URL('../../dist', import.meta.url));

const isExtensionWorker = (worker) => worker.url().startsWith('chrome-extension://');

/**
 * @param {{ args?: string[] }} [options] Extra Chromium switches.
 */
export async function launchExtension({ args = [] } = {}) {
  const profileDir = await mkdtemp(join(tmpdir(), 'eureka-profile-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${DIST_DIR}`, `--load-extension=${DIST_DIR}`, ...args],
    });
    const worker =
      context.serviceWorkers().find(isExtensionWorker) ??
      (await context.waitForEvent('serviceworker', { predicate: isExtensionWorker }));
    const extensionId = new URL(worker.url()).hostname;
    return {
      context,
      worker,
      extensionId,
      profileDir,
      extensionUrl: (path) => `chrome-extension://${extensionId}/${path}`,
      async close() {
        await context.close();
        await rm(profileDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await context?.close();
    await rm(profileDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Opens an extension page whose real `chrome.*` APIs the test drives.
 * Messages sent from it reach the background worker, exactly as popup requests do.
 */
export async function openExtensionApi(extension, path = 'popup.html') {
  const page = await extension.context.newPage();
  await page.goto(extension.extensionUrl(path));
  return {
    page,
    lookup: (urls) => page.evaluate((list) => chrome.runtime.sendMessage({ urls: list }), urls),
    count: () => page.evaluate(() => chrome.runtime.sendMessage({ type: 'getBookmarkCount' })),
    createBookmark: (details) => page.evaluate((d) => chrome.bookmarks.create(d), details),
    updateBookmark: (id, changes) =>
      page.evaluate(([i, c]) => chrome.bookmarks.update(i, c), [id, changes]),
    moveBookmark: (id, destination) =>
      page.evaluate(([i, d]) => chrome.bookmarks.move(i, d), [id, destination]),
    removeBookmark: (id) => page.evaluate((i) => chrome.bookmarks.remove(i), id),
    removeTree: (id) => page.evaluate((i) => chrome.bookmarks.removeTree(i), id),
    getBookmarks: (ids) => page.evaluate((list) => chrome.bookmarks.get(list), ids),
    getChildren: (id) => page.evaluate((i) => chrome.bookmarks.getChildren(i), id),
    setStyle: (style) =>
      page.evaluate((s) => chrome.storage.sync.set({ highlightStyle: s }), style),
    getStyle: () =>
      page.evaluate(async () => (await chrome.storage.sync.get('highlightStyle')).highlightStyle),
  };
}

/**
 * Waits until the background worker's lookup and count replies match the
 * expected bookmarked URLs. Bookmark events refresh the cache asynchronously,
 * so the newest state is asserted only once it has settled.
 */
export async function expectBookmarkState(api, { candidates, bookmarked, count }) {
  await expect
    .poll(async () => {
      const [lookup, countReply] = await Promise.all([api.lookup(candidates), api.count()]);
      return { bookmarkedUrls: [...(lookup.bookmarkedUrls ?? [])].sort(), count: countReply.count };
    })
    .toEqual({ bookmarkedUrls: [...bookmarked].sort(), count });
}

/**
 * Loads a fixture page in a fresh navigation and waits for the content script
 * to finish. Returns its console summary and the highlight span classes inside
 * each anchor of the integration fixture (or of `ids` for another page).
 */
export async function loadFixture(
  page,
  { url = FIXTURE_URL, ids = [...Object.keys(FIXTURE_ANCHORS), 'fragment'] } = {}
) {
  const finished = page.waitForEvent('console', (message) =>
    /^Eureka: (highlighting \d+ of \d+ links|failed to highlight)/.test(message.text())
  );
  await page.goto(url);
  const message = await finished;
  const anchors = await page.evaluate(
    (ids) =>
      Object.fromEntries(
        ids.map((id) => [
          id,
          [...document.getElementById(id).querySelectorAll('span[class^="eureka-highlight-"]')].map(
            (span) => span.className
          ),
        ])
      ),
    ids
  );
  return { message: message.text(), anchors };
}

/**
 * Opens a fresh popup document and waits until it has replaced the pending
 * count placeholder with the worker's reply.
 */
export async function openPopup(extension) {
  const popup = await extension.context.newPage();
  await popup.goto(extension.extensionUrl('popup.html'));
  await expect(popup.locator('#bookmark-count')).not.toHaveText('…');
  return popup;
}

/**
 * Reopens the popup until it shows the expected count. Bookmark events refresh
 * the worker's cache asynchronously, so each attempt is a new popup document.
 */
export async function expectPopupCount(extension, expected) {
  await expect
    .poll(async () => {
      const popup = await openPopup(extension);
      try {
        return await popup.locator('#bookmark-count').textContent();
      } finally {
        await popup.close();
      }
    })
    .toBe(String(expected));
}

/**
 * Opens the popup, clicks its real "Highlight style…" button and returns the
 * options page that `chrome.runtime.openOptionsPage()` opened.
 */
export async function openOptionsFromPopup(extension) {
  const popup = await openPopup(extension);
  const optionsUrl = extension.extensionUrl('options.html');
  const opened = extension.context.waitForEvent('page', {
    predicate: (page) => page !== popup,
  });
  await popup.locator('#open-options').click();
  const options = await opened;
  await options.waitForURL(optionsUrl);
  await options.waitForLoadState('load');
  return { popup, options };
}

/**
 * Records page errors, failed requests and console errors from every current
 * and future page of the context.
 */
export function collectProblems(context) {
  const problems = [];
  const track = (page) => {
    page.on('pageerror', (error) => problems.push(`${page.url()} pageerror: ${error.message}`));
    page.on('requestfailed', (request) => problems.push(`request failed: ${request.url()}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`${page.url()} console: ${message.text()}`);
    });
  };
  context.on('page', track);
  context.pages().forEach(track);
  return problems;
}
/** Returns the anchor IDs whose text was wrapped in highlight spans. */
export function highlightedIds(anchors) {
  return Object.keys(anchors)
    .filter((id) => anchors[id].length > 0)
    .sort();
}

/**
 * Records the extension worker's running status as reported by the
 * ServiceWorker domain of an extension page, so stop/start transitions are
 * observed as they happen instead of being sampled late.
 */
export async function observeWorkerStatus(apiPage) {
  const session = await apiPage.context().newCDPSession(apiPage);
  const statuses = [];
  session.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    for (const version of versions) {
      if (version.status === 'activated') statuses.push(version.runningStatus);
    }
  });
  await session.send('ServiceWorker.enable');
  return {
    statuses,
    waitFor: (status, from = 0) =>
      expect.poll(() => statuses.slice(from).includes(status)).toBe(true),
    detach: () => session.detach(),
  };
}

/** Returns the browser-level CDP targets of the extension's service worker. */
async function workerTargets(cdp, extensionId) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  return targetInfos.filter(
    (info) =>
      info.type === 'service_worker' && info.url.startsWith(`chrome-extension://${extensionId}/`)
  );
}

/**
 * Force-stops the extension service worker with browser-level CDP
 * `Target.closeTarget` and waits until its target is gone. Chromium may give
 * the restarted worker the same target ID, so callers must not rely on it changing.
 * @returns {Promise<string>} The stopped worker's target ID.
 */
export async function stopExtensionWorker(extension) {
  const cdp = await extension.context.browser().newBrowserCDPSession();
  try {
    const [target] = await workerTargets(cdp, extension.extensionId);
    if (!target) throw new Error('Extension service worker is not running');
    await cdp.send('Target.closeTarget', { targetId: target.targetId });
    await expect.poll(async () => (await workerTargets(cdp, extension.extensionId)).length).toBe(0);
    return target.targetId;
  } finally {
    await cdp.detach();
  }
}

/** Returns the browser-level CDP target IDs of the running extension worker. */
export async function runningWorkerTargetIds(extension) {
  const cdp = await extension.context.browser().newBrowserCDPSession();
  try {
    return (await workerTargets(cdp, extension.extensionId)).map((info) => info.targetId);
  } finally {
    await cdp.detach();
  }
}
/**
 * Playwright test with a fresh extension profile per test. Persistent contexts
 * are not covered by the `use.trace` option, so tracing and failure
 * screenshots are recorded here explicitly.
 */
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  extension: async ({}, use, testInfo) => {
    const extension = await launchExtension();
    await extension.context.tracing.start({ screenshots: true, snapshots: true });
    try {
      await use(extension);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        for (const [index, page] of extension.context.pages().entries()) {
          const path = testInfo.outputPath(`failure-page-${index}.png`);
          if (await page.screenshot({ path }).catch(() => null)) {
            await testInfo.attach(`page-${index}`, { path, contentType: 'image/png' });
          }
        }
        const tracePath = testInfo.outputPath('trace.zip');
        await extension.context.tracing.stop({ path: tracePath });
        await testInfo.attach('trace', { path: tracePath, contentType: 'application/zip' });
      } else {
        await extension.context.tracing.stop();
      }
      await extension.close();
    }
  },
});

export { expect };
