'use strict';

chrome.runtime.onInstalled.addListener(function (details) {
  console.log('previousVersion', details.previousVersion);
});

chrome.tabs.onUpdated.addListener(function (tabId) {
  chrome.pageAction.show(tabId);
});

/* exported requestHandlingStream */
var requestHandlingStream = (function () {

  /**
  Callback is of the same signature as the original event callback.
  'this' will be the observer inside callback.
  */
  function observableFromEvent(event, callback) {
    return Rx.Observable.create(function (observer) {
      event.addListener(function () {
        callback.apply(observer, arguments);
      });
    });
  }

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

  var NAME_ALARM_RELOAD_BOOKMARK = 'NAME_ALARM_RELOAD_BOOKMARK';
  chrome.alarms.create(NAME_ALARM_RELOAD_BOOKMARK, {
    delayInMinutes: 1,
    periodInMinutes: 1
  });

  var reloadBookmarkAlarmStream =
  observableFromEvent(chrome.alarms.onAlarm, function (alarm) {
    if (alarm.name === NAME_ALARM_RELOAD_BOOKMARK) {
      this.onNext(Date.now());
    }
  }).startWith(Date.now())
  .publish().refCount();

  var bookmarkUrlMapStream =
  reloadBookmarkAlarmStream.flatMap(function () {
    return Rx.Observable.create(function (observer) {
      chrome.bookmarks.getTree(function (nodes) {
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
  observableFromEvent(chrome.runtime.onMessage, function (request, sender, sendResponse) {
    this.onNext({
      request: request,
      sender:sender,
      sendResponse:sendResponse
    });
  }).publish().refCount();

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

  return requestHandlingStream;
})();

requestHandlingStream.subscribe(function (logging) {
  console.log(logging);
});