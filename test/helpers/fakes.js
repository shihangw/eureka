/**
 * Minimal stand-ins for the browser environment extension scripts run in:
 * a chrome.* API mock and a tiny DOM, so the real shipped scripts can be
 * exercised under the Node test runner with zero dependencies.
 */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * Creates an object shaped like a chrome event.
 * @returns {{ addListener: Function, removeListener: Function, emit: Function, listenerCount: Function }}
 */
export function createChromeEvent() {
  const listeners = new Set();
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    emit: (...args) => [...listeners].map((listener) => listener(...args)),
    listenerCount: () => listeners.size,
  };
}

/**
 * Creates a chrome.* mock with bookmark, alarm and action APIs plus a call log.
 * The alarm and action mocks exist so tests can prove the modernized service
 * worker no longer touches them.
 * @param {object} options
 * @param {Array} options.bookmarkTree Value returned from bookmarks.getTree().
 * @returns {{ chrome: object, state: object }}
 */
export function createChrome({ bookmarkTree = [] } = {}) {
  const state = {
    getTreeCalls: 0,
    alarmsCreated: [],
    actionShown: [],
  };

  const chrome = {
    runtime: {
      onInstalled: createChromeEvent(),
      onMessage: createChromeEvent(),
    },
    bookmarks: {
      onCreated: createChromeEvent(),
      onRemoved: createChromeEvent(),
      onChanged: createChromeEvent(),
      onMoved: createChromeEvent(),
      onChildrenReordered: createChromeEvent(),
      onImportEnded: createChromeEvent(),
      getTree: async () => {
        state.getTreeCalls += 1;
        return JSON.parse(JSON.stringify(bookmarkTree));
      },
    },
    alarms: {
      create: (name, info) => state.alarmsCreated.push({ name, info }),
    },
    action: {
      show: (tabId) => state.actionShown.push(tabId),
    },
  };

  return { chrome, state };
}

/**
 * Creates a fake DOM text node.
 * @param {string} value
 */
export function createTextNode(value) {
  return { nodeType: TEXT_NODE, nodeValue: value, childNodes: [], parentNode: null };
}

/**
 * Creates a fake DOM element with the APIs the content script touches.
 * @param {string} tag
 * @param {object} [options]
 * @param {Record<string, string|null>} [options.attributes]
 * @param {Array} [options.children]
 * @param {object} [options.props] Extra properties such as href.
 */
export function createElement(tag, { attributes = {}, children = [], props = {} } = {}) {
  const element = {
    nodeType: ELEMENT_NODE,
    tagName: tag,
    attributes,
    childNodes: [],
    parentNode: null,
    classes: [],
    listeners: [],
    ...props,
  };

  element.classList = {
    add: (...names) => element.classes.push(...names),
  };

  element.getAttribute = (name) => (name in attributes ? attributes[name] : null);

  element.addEventListener = (type, listener) => element.listeners.push({ type, listener });

  element.insertBefore = (newNode, referenceNode) => {
    const index = element.childNodes.indexOf(referenceNode);
    if (index === -1) {
      element.childNodes.push(newNode);
    } else {
      element.childNodes.splice(index, 0, newNode);
    }
    newNode.parentNode = element;
  };

  element.appendChild = (child) => {
    if (child.parentNode) {
      const index = child.parentNode.childNodes.indexOf(child);
      if (index !== -1) {
        child.parentNode.childNodes.splice(index, 1);
      }
    }
    element.childNodes.push(child);
    child.parentNode = element;
  };

  for (const child of children) {
    element.appendChild(child);
  }

  return element;
}

/**
 * Creates a fake link element carrying the given URL.
 * @param {string} href
 * @param {string} [text]
 * @param {string|null} [dataHref] Value for the data-href attribute.
 */
export function createLink(href, text = 'Example link', dataHref = null) {
  return createElement('a', {
    attributes: { 'data-href': dataHref },
    children: [createTextNode(text)],
    props: { href },
  });
}

/**
 * Creates a fake `document` with the APIs the content script touches.
 * @param {object} [options]
 * @param {Array} [options.links] Elements returned by querySelectorAll.
 * @returns {{ queries: string[], createdElements: object[] } & object}
 */
export function createDocument({ links = [] } = {}) {
  const queries = [];
  const createdElements = [];

  return {
    queries,
    createdElements,
    querySelectorAll: (selector) => {
      queries.push(selector);
      return links;
    },
    createElement: (tag) => {
      const element = createElement(tag);
      createdElements.push(element);
      return element;
    },
  };
}

/**
 * The Node global the content script reads text node types from.
 */
export const NodeConstants = { Node: { TEXT_NODE, ELEMENT_NODE } };

/**
 * Creates a fake radio input that records listeners and can fire them.
 * @param {string} value
 * @param {boolean} [checked]
 */
export function createRadio(value, checked = false) {
  const radio = createElement('input', {
    attributes: { type: 'radio', name: 'highlight-style', value },
    props: { value, checked },
  });
  radio.dispatch = (type) => {
    for (const entry of radio.listeners) {
      if (entry.type === type) {
        entry.listener({ type, target: radio });
      }
    }
  };
  return radio;
}

/**
 * Creates a fake `document` for the popup and options pages.
 * @param {object} [options]
 * @param {Record<string, object>} [options.elementsById] Elements for getElementById.
 * @param {Array} [options.radios] Highlight-style radios for the options page.
 */
export function createPageDocument({ elementsById = {}, radios = [] } = {}) {
  const radioSelector = 'input[name="highlight-style"]';
  return {
    getElementById: (id) => elementsById[id] ?? null,
    querySelectorAll: (selector) => (selector === radioSelector ? radios : []),
    querySelector: (selector) => {
      const match = /^input\[name="highlight-style"\]\[value="(.*)"\]$/.exec(selector);
      return match ? (radios.find((radio) => radio.value === match[1]) ?? null) : null;
    },
  };
}
