import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NodeConstants, createDocument, createLink } from './helpers/fakes.js';
import { loadScript } from './helpers/load-script.js';

/** Lets pending microtasks settle so async work completes. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Copies a value out of the script realm so strict deep equality works. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * Loads the content script against a fake page and chrome runtime.
 * @param {object} options
 * @param {Array} options.links Links on the fake page.
 * @param {string[]} [options.bookmarkedUrls] URLs the background reports.
 * @param {string} [options.highlightStyle] Style stored in sync storage.
 * @param {Error} [options.sendMessageError] Makes sendMessage reject.
 */
function loadContent({ links, bookmarkedUrls = [], highlightStyle, sendMessageError } = {}) {
  const state = {
    storageGets: [],
    sentMessages: [],
  };

  const chrome = {
    storage: {
      sync: {
        get: async (keys) => {
          state.storageGets.push(keys);
          return highlightStyle === undefined ? {} : { highlightStyle };
        },
      },
    },
    runtime: {
      sendMessage: async (message) => {
        state.sentMessages.push(message);
        if (sendMessageError) {
          throw sendMessageError;
        }
        return { bookmarkedUrls };
      },
    },
  };

  const document = createDocument({ links });
  const context = loadScript('../../dist/scripts/contentscript.js', {
    chrome,
    document,
    ...NodeConstants,
  });

  return { state, document, context };
}

test('sends each unique page URL to the background script once', async () => {
  const { state } = loadContent({
    links: [
      createLink('https://a.example/'),
      createLink('https://b.example/'),
      createLink('https://a.example/'),
    ],
  });
  await settle();

  assert.deepEqual(plain(state.sentMessages.map((message) => message.urls)), [
    ['https://a.example/', 'https://b.example/'],
  ]);
});

test('prefers a data-href attribute over the resolved href', async () => {
  const { state } = loadContent({
    links: [createLink('https://resolved.example/', 'Link', 'https://data.example/')],
  });
  await settle();

  assert.deepEqual(plain(state.sentMessages.map((message) => message.urls)), [
    ['https://data.example/'],
  ]);
});

test('does not message the background script when the page has no links', async () => {
  const { state } = loadContent({ links: [] });
  await settle();

  assert.deepEqual(state.sentMessages, []);
});

test('wraps bookmarked link text in a span with the stored highlight class', async () => {
  const link = createLink('https://github.com/', 'GitHub');
  const { document } = loadContent({
    links: [link],
    bookmarkedUrls: ['https://github.com/'],
    highlightStyle: 'underline',
  });
  await settle();

  assert.equal(document.createdElements.length, 1);
  const [span] = document.createdElements;
  assert.deepEqual(span.classes, ['eureka-highlight-underline']);
  assert.equal(span.childNodes.length, 1);
  assert.equal(span.childNodes[0].nodeValue, 'GitHub');
  assert.equal(span.parentNode, link);
  assert.equal(link.childNodes[0], span);
});

test('falls back to the yellow highlight class when no style is stored', async () => {
  const link = createLink('https://github.com/', 'GitHub');
  const { document } = loadContent({
    links: [link],
    bookmarkedUrls: ['https://github.com/'],
  });
  await settle();

  assert.deepEqual(document.createdElements[0].classes, ['eureka-highlight-yellow']);
});

test('highlights every element that shares a bookmarked URL', async () => {
  const first = createLink('https://github.com/', 'GitHub');
  const second = createLink('https://github.com/', 'GitHub again');
  const { document } = loadContent({
    links: [first, second],
    bookmarkedUrls: ['https://github.com/'],
  });
  await settle();

  assert.equal(document.createdElements.length, 2);
  assert.equal(first.childNodes[0], document.createdElements[0]);
  assert.equal(second.childNodes[0], document.createdElements[1]);
});

test('leaves unbookmarked links untouched', async () => {
  const link = createLink('https://plain.example/', 'Nothing to see');
  const { document } = loadContent({ links: [link], bookmarkedUrls: [] });
  await settle();

  assert.equal(document.createdElements.length, 0);
  assert.equal(link.childNodes.length, 1);
});

test('survives a messaging failure without breaking the page', async () => {
  const link = createLink('https://github.com/', 'GitHub');
  const { document, context } = loadContent({
    links: [link],
    sendMessageError: new Error('Extension context invalidated'),
  });
  await settle();

  assert.equal(document.createdElements.length, 0);
  assert.equal(link.childNodes.length, 1);
  assert.ok(context.console.entries.some(([level]) => level === 'error'));
});
