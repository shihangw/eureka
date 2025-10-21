/**
 * Content script for Eureka extension
 * Highlights bookmarked links on the current page
 */

/**
 * Recursively finds all text nodes within a DOM element
 * @param {Node} dom - The DOM node to search
 * @returns {Text[]} Array of text nodes
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
 * Highlights a DOM element by wrapping its text nodes
 * @param {HTMLElement} element - The element to highlight
 */
function highlight(element) {
  const textNodes = getTextNodes(element);

  textNodes.forEach((textNode) => {
    const span = document.createElement('span');
    span.style.backgroundColor = 'yellow';

    // Insert the span before the text node
    textNode.parentNode.insertBefore(span, textNode);
    // Move the text node into the span
    span.appendChild(textNode);
  });

  console.log('Highlighted element with', textNodes.length, 'text nodes');
}

/**
 * Main function to find and highlight bookmarked links
 */
async function highlightBookmarks() {
  // Collect all links on the page (excluding anchor-only links)
  const links = document.querySelectorAll('a:not([href^="#"])');
  const urls = [];
  const urlElementMap = new Map();

  links.forEach((link) => {
    const url = link.getAttribute('data-href') || link.href;
    if (url) {
      urls.push(url);
      urlElementMap.set(url, link);
    }
  });

  if (urls.length === 0) {
    console.log('Eureka: No links found on page');
    return;
  }

  console.log(`Eureka: Found ${urls.length} links, checking bookmarks...`);

  // Send message to background script to check which URLs are bookmarked
  try {
    const response = await chrome.runtime.sendMessage({ urls });

    if (response && response.bookmarkedUrls) {
      const bookmarkedUrls = response.bookmarkedUrls;
      console.log(`Eureka: Highlighting ${bookmarkedUrls.length} bookmarked links`);

      bookmarkedUrls.forEach((url) => {
        const element = urlElementMap.get(url);
        if (element) {
          highlight(element);
        }
      });
    }
  } catch (error) {
    console.error('Eureka: Error communicating with background script:', error);
  }
}

// Run the highlighting when the script loads
highlightBookmarks();
