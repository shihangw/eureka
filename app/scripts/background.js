'use strict';

chrome.runtime.onInstalled.addListener(function (details){
  console.log('previousVersion', details.previousVersion);
});

chrome.tabs.onUpdated.addListener(function (tabId){
  chrome.pageAction.show(tabId);
});

(function() {
  function collectBookmarkUrl(urlMap, node) {
    if (node) {
      if (node.url) {
        urlMap[node.url] = node.id;
      }
      var children = node.children;
      if (children) {
        for (var i = 0; i < children.length; i++) {
          collectBookmarkUrl(urlMap, children[i]);
        }
      }
    }
  }

  var urlMap = {};
  chrome.bookmarks.getTree(function (nodes){
    collectBookmarkUrl(urlMap, nodes[0]);
    console.log('Bookmarks loaded');

    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse){
      var bookmarkedUrls = request.urls.filter(function (url){
        return urlMap[url];
      });
      sendResponse({bookmarkedUrls: bookmarkedUrls});
    });
  });
})();
