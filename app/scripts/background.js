'use strict';

chrome.runtime.onInstalled.addListener(function (details){
  console.log('previousVersion', details.previousVersion);
});

chrome.tabs.onUpdated.addListener(function (tabId){
  chrome.pageAction.show(tabId);
});

var requestHandlingStream = (function() {
  // var MSG_KEY_SYNCBOOKMARK = 'eureka_bookmark_sync';

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

  var reloadBookmarkAlarmStream =
  Rx.Observable.create(function (observer) { 
    var NAME_ALARM_RELOAD_BOOKMARK = 'NAME_ALARM_RELOAD_BOOKMARK';
    chrome.alarms.create(NAME_ALARM_RELOAD_BOOKMARK, {
      delayInMinutes: 1,
      periodInMinutes: 1
    });
    chrome.alarms.onAlarm.addListener(function (alarm){
      if (alarm.name === NAME_ALARM_RELOAD_BOOKMARK) {
        observer.onNext(Date.now());
      }
    });
  }).startWith(Date.now())
  .publish();

  var bookmarkUrlMapStream =
  reloadBookmarkAlarmStream.flatMap(function () {
    return Rx.Observable.create(function (observer) {
      chrome.bookmarks.getTree(function (nodes){
        var urlMap = {};
        collectBookmarkUrl(urlMap, nodes[0]);
        observer.onNext(urlMap);
        observer.onCompleted();
      });
    });
  }).do(function () {
    console.log('Bookmark url map reloaded');
  });

  var bookmarkedUrlsRequestStream =
  Rx.Observable.create(function (observer) {
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse){
      observer.onNext({
        request: request,
        sender:sender,
        sendResponse:sendResponse});
    });
  }).publish();

  var requestHandlingStream =
  bookmarkUrlMapStream.combineLatest(
    bookmarkedUrlsRequestStream,
    function (urlMap, requestBundle) {
      var bookmarkedUrls = requestBundle.request.urls.filter(function (url){
        return urlMap[url];
      });
      requestBundle.sendResponse({bookmarkedUrls: bookmarkedUrls});
      var logging = 'Handling request from page [' + requestBundle.sender.tab.title + ']';
      return logging;
    });

  requestHandlingStream.subscribe(function (logging) {
    console.log(logging);
  });

  reloadBookmarkAlarmStream.connect();
  bookmarkedUrlsRequestStream.connect();

  return requestHandlingStream;
})();
