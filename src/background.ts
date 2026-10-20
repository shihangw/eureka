/**
 * Background service worker for Eureka.
 *
 * Keeps an in-memory cache of every bookmark URL in the browser and answers
 * lookup requests from content scripts and extension pages. The cache is
 * refreshed when the service worker starts and whenever bookmarks change;
 * there is no polling.
 */

import {
  isCountRequest,
  isLookupRequest,
  type CountResponse,
  type ErrorResponse,
  type LookupResponse,
} from './shared';

/**
 * URL of every bookmark in the browser, from the newest successful load.
 * `null` until a load has succeeded, so a failed load is never mistaken for
 * an empty bookmark collection.
 */
let bookmarkUrls: Set<string> | null = null;

/** Number of the most recently started refresh. */
let latestGeneration = 0;

/** Number of the refresh whose result `bookmarkUrls` holds. */
let appliedGeneration = 0;

/** Number of refreshes that have started but not finished. */
let refreshesInFlight = 0;

/** The most recently started refresh. Never rejects. */
let latestRefresh: Promise<void> = Promise.resolve();

void refreshBookmarkCache();

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
function refreshBookmarkCache(): Promise<void> {
  const generation = ++latestGeneration;
  refreshesInFlight += 1;

  latestRefresh = (async () => {
    try {
      const [root] = await chrome.bookmarks.getTree();
      // Reads can finish out of order; never let an older read replace a newer one.
      if (generation < appliedGeneration) return;

      const urls = new Set<string>();
      collectBookmarkUrls(urls, root);
      bookmarkUrls = urls;
      appliedGeneration = generation;
      console.log(`Eureka: loaded ${urls.size} bookmark URLs`);
    } catch (error) {
      console.error('Eureka: failed to load bookmarks:', error);
    } finally {
      refreshesInFlight -= 1;
    }
  })();
  return latestRefresh;
}

/**
 * Resolves with the newest bookmark URLs once every started refresh has
 * settled, or `null` when no load has succeeded yet.
 */
async function currentBookmarkUrls(): Promise<Set<string> | null> {
  // With no usable snapshot and nothing loading, retry so a failed load recovers.
  if (bookmarkUrls === null && refreshesInFlight === 0) {
    void refreshBookmarkCache();
  }

  let awaited: Promise<void>;
  do {
    awaited = latestRefresh;
    await awaited;
  } while (awaited !== latestRefresh);

  return bookmarkUrls;
}

const UNAVAILABLE: ErrorResponse = { error: 'Bookmarks are unavailable' };

chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    `Eureka: extension ${details.reason} (previous version: ${details.previousVersion ?? 'none'})`
  );
  void refreshBookmarkCache();
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
    void refreshBookmarkCache();
  });
}

/**
 * Answers messages from content scripts and extension pages.
 * Returns `true` for handled requests to keep the message channel open for
 * the asynchronous response.
 */
chrome.runtime.onMessage.addListener(
  (
    request: unknown,
    _sender,
    sendResponse: (response: LookupResponse | CountResponse | ErrorResponse) => void
  ) => {
    if (isLookupRequest(request)) {
      void currentBookmarkUrls().then((urls) => {
        if (!urls) {
          sendResponse(UNAVAILABLE);
          return;
        }
        const bookmarkedUrls = request.urls.filter((url) => urls.has(url));
        console.log(`Eureka: ${bookmarkedUrls.length}/${request.urls.length} links are bookmarked`);
        sendResponse({ bookmarkedUrls });
      });
      return true;
    }

    if (isCountRequest(request)) {
      void currentBookmarkUrls().then((urls) => {
        sendResponse(urls ? { count: urls.size } : UNAVAILABLE);
      });
      return true;
    }

    return undefined;
  }
);
