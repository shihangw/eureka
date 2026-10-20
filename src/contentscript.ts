/**
 * Content script for Eureka.
 * Highlights links on the current page that the user has bookmarked.
 */

import { readHighlightStyle, type LookupRequest, type LookupResponse } from './shared';

/** Recursively finds all non-whitespace text nodes within a DOM subtree. */
function getTextNodes(dom: Node): Text[] {
  const textNodes: Text[] = [];
  const whitespace = /^\s*$/;

  function traverse(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!whitespace.test(node.nodeValue ?? '')) {
        textNodes.push(node as Text);
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

/** Wraps every text node of an element in a span carrying the highlight style. */
function highlight(element: Element, style: string): void {
  for (const textNode of getTextNodes(element)) {
    const span = document.createElement('span');
    span.classList.add(`eureka-highlight-${style}`);

    // Insert the span where the text node sits, then move the text into it.
    textNode.parentNode?.insertBefore(span, textNode);
    span.appendChild(textNode);
  }
}

/** Finds all links on the page and highlights the bookmarked ones. */
async function highlightBookmarks(): Promise<void> {
  const links = document.querySelectorAll<HTMLAnchorElement>('a:not([href^="#"])');
  const urlElements = new Map<string, HTMLAnchorElement[]>();

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
    const highlightStyle = await readHighlightStyle();
    const request: LookupRequest = { urls: [...urlElements.keys()] };
    const response = (await chrome.runtime.sendMessage(request)) as
      Partial<LookupResponse> | undefined;
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

void highlightBookmarks();
