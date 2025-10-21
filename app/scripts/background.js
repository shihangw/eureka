/**
 * Background service worker for Eureka extension
 * Manages bookmark synchronization and message handling
 */

// In-memory cache of bookmark URLs
let bookmarkUrlMap = {};

// Initialize extension
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed, previousVersion:', details.previousVersion);
  loadBookmarks();
});

// Show action icon on all tabs
chrome.tabs.onUpdated.addListener((tabId) => {
  chrome.action.show(tabId);
});

/**
 * Recursively collects all bookmark URLs from the bookmark tree
 * @param {Object} urlMap - Map to store URL -> bookmark ID
 * @param {Object} node - Current bookmark tree node
 */
function collectBookmarkUrl(urlMap, node) {
  if (!node) return;

  if (node.url) {
    urlMap[node.url] = node.id;
  }

  if (node.children) {
    for (const child of node.children) {
      collectBookmarkUrl(urlMap, child);
    }
  }
}

/**
 * Loads all bookmarks and caches them in memory
 */
async function loadBookmarks() {
  try {
    const nodes = await chrome.bookmarks.getTree();
    const urlMap = {};
    collectBookmarkUrl(urlMap, nodes[0]);
    bookmarkUrlMap = urlMap;
    console.log('Bookmark URL map reloaded:', Object.keys(bookmarkUrlMap).length, 'bookmarks');
  } catch (error) {
    console.error('Error loading bookmarks:', error);
  }
}

// Set up periodic bookmark reload (every minute)
const ALARM_NAME = 'reload-bookmarks';

chrome.alarms.create(ALARM_NAME, {
  delayInMinutes: 1,
  periodInMinutes: 1,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    loadBookmarks();
  }
});

/**
 * Handle messages from content scripts
 * Returns which URLs from the provided list are bookmarked
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.urls && Array.isArray(request.urls)) {
    const bookmarkedUrls = request.urls.filter((url) => bookmarkUrlMap[url]);

    const tabTitle = sender.tab?.title || 'Unknown';
    console.log(
      `Handling request from page [${tabTitle}]: ${bookmarkedUrls.length}/${request.urls.length} URLs are bookmarked`
    );

    sendResponse({ bookmarkedUrls });
  }

  // Return true to indicate async response (though we're responding synchronously here)
  return true;
});

// Initial bookmark load
loadBookmarks();
