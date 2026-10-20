import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createChrome } from './helpers/fakes.js';
import { loadScript } from './helpers/load-script.js';

/** Lets pending microtasks settle so async work completes. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Copies a value out of the script realm so strict deep equality works. */
const plain = (value) => JSON.parse(JSON.stringify(value));

const BOOKMARK_TREE = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Bookmarks bar',
        children: [
          { id: '2', title: 'GitHub', url: 'https://github.com/' },
          { id: '3', title: 'Hacker News', url: 'https://news.ycombinator.com/' },
        ],
      },
      {
        id: '4',
        title: 'Other bookmarks',
        children: [
          {
            id: '5',
            title: 'Nested folder',
            children: [{ id: '6', title: 'Example', url: 'https://example.com/' }],
          },
        ],
      },
    ],
  },
];

function loadBackground({ bookmarkTree = BOOKMARK_TREE } = {}) {
  const { chrome, state } = createChrome({ bookmarkTree });
  const context = loadScript('../../app/scripts/background.js', { chrome });
  return { chrome, state, context };
}

test('collectBookmarkUrls gathers every URL in a bookmark tree, recursively', () => {
  const { context } = loadBackground();
  const urls = new Set();
  context.collectBookmarkUrls(urls, BOOKMARK_TREE[0]);
  assert.deepEqual([...urls].sort(), [
    'https://example.com/',
    'https://github.com/',
    'https://news.ycombinator.com/',
  ]);
});

test('collectBookmarkUrls ignores folders without URLs', () => {
  const { context } = loadBackground();
  const urls = new Set();
  context.collectBookmarkUrls(urls, { id: '1', title: 'Empty folder', children: [] });
  assert.equal(urls.size, 0);
});

test('loads the bookmark cache when the service worker starts', async () => {
  const { state } = loadBackground();
  await settle();
  assert.equal(state.getTreeCalls, 1);
});

test('responds with the subset of requested URLs that are bookmarked', async () => {
  const { chrome } = loadBackground();
  await settle();

  let response;
  const returnValue = chrome.runtime.onMessage.emit(
    { urls: ['https://github.com/', 'https://not-bookmarked.example/'] },
    { tab: { title: 'Example page' } },
    (payload) => {
      response = payload;
    }
  )[0];

  assert.equal(returnValue, true);
  await settle();
  assert.deepEqual(plain(response), { bookmarkedUrls: ['https://github.com/'] });
});

test('answers a request that races service worker startup', async () => {
  const { chrome } = loadBackground();
  // No settle() first: the message arrives while the initial load is in flight.

  let response;
  chrome.runtime.onMessage.emit({ urls: ['https://example.com/'] }, {}, (payload) => {
    response = payload;
  })[0];

  await settle();
  assert.deepEqual(plain(response), { bookmarkedUrls: ['https://example.com/'] });
});

test('responds with the number of cached bookmarks', async () => {
  const { chrome } = loadBackground();
  await settle();

  let response;
  chrome.runtime.onMessage.emit({ type: 'getBookmarkCount' }, {}, (payload) => {
    response = payload;
  })[0];

  await settle();
  assert.deepEqual(plain(response), { count: 3 });
});

test('reloads the cache when the extension is installed or updated', async () => {
  const { chrome, state } = loadBackground();
  await settle();
  assert.equal(state.getTreeCalls, 1);

  chrome.runtime.onInstalled.emit({ reason: 'update', previousVersion: '0.0.3' });
  await settle();
  assert.equal(state.getTreeCalls, 2);
});

test('reloads the cache whenever bookmarks change', async () => {
  const { chrome, state } = loadBackground();
  await settle();

  for (const bookmarkEvent of [
    chrome.bookmarks.onCreated,
    chrome.bookmarks.onRemoved,
    chrome.bookmarks.onChanged,
    chrome.bookmarks.onMoved,
    chrome.bookmarks.onChildrenReordered,
    chrome.bookmarks.onImportEnded,
  ]) {
    bookmarkEvent.emit({});
    await settle();
  }

  assert.equal(state.getTreeCalls, 7); // 1 on startup + 6 event-driven reloads
});

test('ignores messages it does not understand', async () => {
  const { chrome } = loadBackground();
  await settle();

  let responded = false;
  const returnValue = chrome.runtime.onMessage.emit({ type: 'unknown' }, {}, () => {
    responded = true;
  })[0];

  await settle();
  assert.equal(returnValue, undefined);
  assert.equal(responded, false);
});

test('does not poll on alarms or toggle the action icon', async () => {
  const { state } = loadBackground();
  await settle();
  assert.equal(state.alarmsCreated.length, 0);
  assert.equal(state.actionShown.length, 0);
});
