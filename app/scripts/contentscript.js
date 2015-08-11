'use strict';

(function (){
  // var MSG_KEY_SYNCBOOKMARK = 'eureka_bookmark_sync';

  function highlight(dom){
    var textDOMs = [], whitespace = /^\s*$/;
    (function getTextDOMs(dom){
      if (dom.nodeType === 3) {
        if (!whitespace.test(dom.nodeValue)) {
          textDOMs.push(dom);
        }
      } else {
        for (var i = 0, len = dom.childNodes.length; i < len; ++i) {
          getTextDOMs(dom.childNodes[i]);
        }
      }
    })(dom);
    console.log(textDOMs);
    textDOMs.forEach(function (dom){
      $(dom).wrap('<span style="background-color: yellow;">');
    });
  }

  var urls = [], urlDOMMap = {};
  $('a:not([href^="#"])').each(function (){
    var url = this.getAttribute('data-href') || this.href;
    if (url) {
      urls.push(url);
      urlDOMMap[url] = this;
    }
  });

  // var port = chrome.runtime.connect({name: MSG_KEY_SYNCBOOKMARK});

  chrome.runtime.sendMessage({urls: urls}, function (response){
    if (response && response.bookmarkedUrls) {
      var bookmarkedUrls = response.bookmarkedUrls;
      console.log(bookmarkedUrls);
      bookmarkedUrls.forEach(function (url){
        highlight(urlDOMMap[url]);
      });
    }
  });
})();
