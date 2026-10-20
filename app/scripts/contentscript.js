/**
 * Content script for Eureka.
 * Highlights links on the current page that the user has bookmarked.
 */

(() => {
  'use strict';

  /** Highlight style used when the user has not picked one yet. */
  const DEFAULT_HIGHLIGHT_STYLE = 'yellow';

  /**
   * Recursively finds all non-whitespace text nodes within a DOM subtree.
   * @param {Node} dom - The DOM node to search.
   * @returns {Text[]} Array of text nodes.
   */
  function getTextNodes(dom) {
    const textNodes = [];
    const whitespace = /^\s*$/;

    function traverse(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!whitespace.test(node.nodeValue)) {
          textNodes.push(node);
        }
      } else {
        for (const child of node.childNodes) {
          traverse(child);
        }
      }
    }

    traverse(dom);
    return textNodes;
  }

  /**
   * Wraps every text node of an element in a span carrying the highlight style.
   * @param {HTMLElement} element - The element to highlight.
   * @param {string} style - Highlight style name, e.g. "yellow".
   */
  function highlight(element, style) {
    for (const textNode of getTextNodes(element)) {
      const span = document.createElement('span');
      span.classList.add(`eureka-highlight-${style}`);

      // Insert the span where the text node sits, then move the text into it.
      textNode.parentNode.insertBefore(span, textNode);
      span.appendChild(textNode);
    }
  }

  /**
   * Finds all links on the page and highlights the bookmarked ones.
   */
  async function highlightBookmarks() {
    const links = document.querySelectorAll('a:not([href^="#"])');
    const urlElements = new Map();

    for (const link of links) {
      const url = link.getAttribute('data-href') || link.href;
      if (!url) continue;

      const elements = urlElements.get(url);
      if (elements) {
        elements.push(link);
      } else {
        urlElements.set(url, [link]);
      }
    }

    if (urlElements.size === 0) {
      console.log('Eureka: no links found on page');
      return;
    }

    try {
      const { highlightStyle = DEFAULT_HIGHLIGHT_STYLE } =
        await chrome.storage.sync.get('highlightStyle');
      const response = await chrome.runtime.sendMessage({ urls: [...urlElements.keys()] });
      const bookmarkedUrls = response?.bookmarkedUrls ?? [];

      console.log(`Eureka: highlighting ${bookmarkedUrls.length} of ${urlElements.size} links`);

      for (const url of bookmarkedUrls) {
        for (const element of urlElements.get(url) ?? []) {
          highlight(element, highlightStyle);
        }
      }
    } catch (error) {
      console.error('Eureka: failed to highlight bookmarked links:', error);
    }
  }

  highlightBookmarks();
})();
