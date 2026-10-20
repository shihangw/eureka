/**
 * Background service worker for Eureka.
 *
 * Keeps an in-memory cache of every bookmark URL in the browser and answers
 * lookup requests from content scripts and extension pages. The cache is
 * refreshed when the service worker starts and whenever bookmarks change;
 * there is no polling.
 */

import { isCountRequest, isLookupRequest, type CountResponse, type LookupResponse } from './shared';

/** URL of every bookmark in the browser. */
let bookmarkUrls = new Set<string>();

/**
 * Resolves once the current bookmark cache has finished loading. A freshly
 * woken service worker answers messages only after this resolves, so callers
 * never see a stale or empty cache.
 */
let cacheLoaded: Promise<void> = refreshBookmarkCache();

/** Adds the URL of every bookmark in a bookmark subtree to the set. */
function collectBookmarkUrls(
  urls: Set<string>,
  node: chrome.bookmarks.BookmarkTreeNode | undefined
): void {
  if (!node) return;

  if (node.url) {
    urls.add(node.url);
  }

  for (const child of node.children ?? []) {
    collectBookmarkUrls(urls, child);
  }
}

/** Reloads the bookmark cache from the browser. */
async function refreshBookmarkCache(): Promise<void> {
  try {
    const [root] = await chrome.bookmarks.getTree();
    const urls = new Set<string>();
    collectBookmarkUrls(urls, root);
    bookmarkUrls = urls;
    console.log(`Eureka: loaded ${bookmarkUrls.size} bookmark URLs`);
  } catch (error) {
    console.error('Eureka: failed to load bookmarks:', error);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    `Eureka: extension ${details.reason} (previous version: ${details.previousVersion ?? 'none'})`
  );
  cacheLoaded = refreshBookmarkCache();
});

// Refresh the cache when bookmarks change instead of polling on a timer.
const bookmarkEvents: Array<{ addListener(callback: () => void): void }> = [
  chrome.bookmarks.onCreated,
  chrome.bookmarks.onRemoved,
  chrome.bookmarks.onChanged,
  chrome.bookmarks.onMoved,
  chrome.bookmarks.onChildrenReordered,
  chrome.bookmarks.onImportEnded,
];

for (const bookmarkEvent of bookmarkEvents) {
  bookmarkEvent.addListener(() => {
    cacheLoaded = refreshBookmarkCache();
  });
}

/**
 * Answers messages from content scripts and extension pages.
 * Returns `true` for handled requests to keep the message channel open for
 * the asynchronous response.
 */
chrome.runtime.onMessage.addListener(
  (request: unknown, _sender, sendResponse: (response: LookupResponse | CountResponse) => void) => {
    if (isLookupRequest(request)) {
      void cacheLoaded.then(() => {
        const bookmarkedUrls = request.urls.filter((url) => bookmarkUrls.has(url));
        console.log(`Eureka: ${bookmarkedUrls.length}/${request.urls.length} links are bookmarked`);
        sendResponse({ bookmarkedUrls });
      });
      return true;
    }

    if (isCountRequest(request)) {
      void cacheLoaded.then(() => {
        sendResponse({ count: bookmarkUrls.size });
      });
      return true;
    }

    return undefined;
  }
);
