/**
 * Background service worker for Eureka.
 *
 * Keeps an in-memory cache of every bookmark URL in the browser and answers
 * lookup requests from content scripts and extension pages. The cache is
 * refreshed when the service worker starts and whenever bookmarks change;
 * there is no polling.
 */

/** @type {Set<string>} URL of every bookmark in the browser. */
let bookmarkUrls = new Set();

/**
 * Resolves once the current bookmark cache has finished loading. A freshly
 * woken service worker answers messages only after this resolves, so callers
 * never see a stale or empty cache.
 * @type {Promise<void>}
 */
let cacheLoaded = refreshBookmarkCache();

/**
 * Adds the URL of every bookmark in a bookmark subtree to the set.
 * @param {Set<string>} urls - Set that receives the bookmark URLs.
 * @param {chrome.bookmarks.BookmarkTreeNode} node - Current bookmark tree node.
 */
function collectBookmarkUrls(urls, node) {
  if (!node) return;

  if (node.url) {
    urls.add(node.url);
  }

  for (const child of node.children ?? []) {
    collectBookmarkUrls(urls, child);
  }
}

/**
 * Reloads the bookmark cache from the browser.
 * @returns {Promise<void>}
 */
async function refreshBookmarkCache() {
  try {
    const [root] = await chrome.bookmarks.getTree();
    const urls = new Set();
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
const bookmarkEvents = [
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
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (Array.isArray(request?.urls)) {
    cacheLoaded.then(() => {
      const bookmarkedUrls = request.urls.filter((url) => bookmarkUrls.has(url));
      console.log(`Eureka: ${bookmarkedUrls.length}/${request.urls.length} links are bookmarked`);
      sendResponse({ bookmarkedUrls });
    });
    return true;
  }

  if (request?.type === 'getBookmarkCount') {
    cacheLoaded.then(() => {
      sendResponse({ count: bookmarkUrls.size });
    });
    return true;
  }
});
