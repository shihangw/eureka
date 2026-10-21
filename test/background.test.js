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
  const context = loadScript('../../dist/scripts/background.js', { chrome });
  return { chrome, state, context };
}

test('caches every URL in a bookmark tree, recursively', async () => {
  const { chrome } = loadBackground();
  await settle();

  let response;
  chrome.runtime.onMessage.emit(
    {
      urls: [
        'https://github.com/',
        'https://news.ycombinator.com/',
        'https://example.com/',
        'https://not-bookmarked.example/',
      ],
    },
    {},
    (payload) => {
      response = payload;
    }
  )[0];

  await settle();
  assert.deepEqual(plain(response), {
    bookmarkedUrls: [
      'https://github.com/',
      'https://news.ycombinator.com/',
      'https://example.com/',
    ],
  });
});

test('ignores folders without URLs', async () => {
  const { chrome } = loadBackground({
    bookmarkTree: [
      {
        id: '0',
        title: '',
        children: [{ id: '1', title: 'Empty folder', children: [] }],
      },
    ],
  });
  await settle();

  let response;
  chrome.runtime.onMessage.emit({ type: 'getBookmarkCount' }, {}, (payload) => {
    response = payload;
  })[0];

  await settle();
  assert.deepEqual(plain(response), { count: 0 });
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

test('counts a URL bookmarked more than once as a single bookmark', async () => {
  const { chrome } = loadBackground({
    bookmarkTree: [
      {
        id: '0',
        title: '',
        children: [
          { id: '1', title: 'GitHub', url: 'https://github.com/' },
          { id: '2', title: 'GitHub again', url: 'https://github.com/' },
          { id: '3', title: 'Example', url: 'https://example.com/' },
        ],
      },
    ],
  });
  await settle();

  let response;
  chrome.runtime.onMessage.emit({ type: 'getBookmarkCount' }, {}, (payload) => {
    response = payload;
  })[0];

  await settle();
  assert.deepEqual(plain(response), { count: 2 });
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

/** Creates a promise whose settlement the test controls. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Builds a flat bookmark tree holding the given URLs. */
const treeOf = (...urls) => [
  {
    id: '0',
    title: '',
    children: urls.map((url, index) => ({ id: String(index + 1), title: url, url })),
  },
];

/**
 * Loads the background script with a getTree whose every call is held until
 * the test settles it through `reads[n]`.
 */
function loadControlledBackground() {
  const reads = [];
  const { chrome, state } = createChrome({
    getTree: () => {
      const read = deferred();
      reads.push(read);
      return read.promise;
    },
  });
  const context = loadScript('../../dist/scripts/background.js', { chrome });
  return { chrome, state, context, reads };
}

/** Sends a message to the background script and records when and how it is answered. */
function send(chrome, message) {
  const result = { responded: false, response: undefined };
  result.returnValue = chrome.runtime.onMessage.emit(message, {}, (payload) => {
    result.responded = true;
    result.response = plain(payload);
  })[0];
  return result;
}

const lookup = (chrome) =>
  send(chrome, { urls: ['https://a.example/', 'https://b.example/', 'https://c.example/'] });
const count = (chrome) => send(chrome, { type: 'getBookmarkCount' });

/** Records unhandled rejections raised while a test runs. */
function trackUnhandledRejections(t) {
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  t.after(() => process.off('unhandledRejection', onRejection));
  return rejections;
}

const isHandledFailure = (response) =>
  typeof response?.error === 'string' && !('bookmarkedUrls' in response) && !('count' in response);

test('waits for the initial bookmark load before answering', async () => {
  const { chrome, reads } = loadControlledBackground();
  const pendingLookup = lookup(chrome);
  const pendingCount = count(chrome);

  await settle();
  assert.equal(pendingLookup.returnValue, true);
  assert.equal(pendingLookup.responded, false);
  assert.equal(pendingCount.responded, false);

  reads[0].resolve(treeOf('https://a.example/', 'https://a.example/'));
  await settle();
  assert.deepEqual(pendingLookup.response, { bookmarkedUrls: ['https://a.example/'] });
  assert.deepEqual(pendingCount.response, { count: 1 });
});

test('settles on the newest bookmark state when bookmarks change during a refresh', async () => {
  const { chrome, reads } = loadControlledBackground();
  reads[0].resolve(treeOf('https://a.example/'));
  await settle();

  chrome.bookmarks.onCreated.emit('b', {});
  const duringFirstRefresh = lookup(chrome);
  chrome.bookmarks.onChanged.emit('c', {});
  const duringSecondRefresh = count(chrome);
  await settle();

  // The read in flight predates the second change, so it must not be final.
  reads[1].resolve(treeOf('https://a.example/', 'https://b.example/'));
  await settle();
  assert.equal(duringFirstRefresh.responded, false);
  assert.equal(duringSecondRefresh.responded, false);
  assert.equal(reads.length, 3);

  reads[2].resolve(treeOf('https://a.example/', 'https://b.example/', 'https://c.example/'));
  await settle();

  const latest = {
    bookmarkedUrls: ['https://a.example/', 'https://b.example/', 'https://c.example/'],
  };
  assert.deepEqual(duringFirstRefresh.response, latest);
  assert.deepEqual(duringSecondRefresh.response, { count: 3 });
  const afterLookup = lookup(chrome);
  const afterCount = count(chrome);
  await settle();
  assert.deepEqual(afterLookup.response, latest);
  assert.deepEqual(afterCount.response, { count: 3 });
  assert.equal(reads.length, 3);
});

test('reports a handled failure, not empty results, when the initial load fails', async (t) => {
  const unhandled = trackUnhandledRejections(t);
  const { chrome, reads, context } = loadControlledBackground();
  const pendingLookup = lookup(chrome);
  const pendingCount = count(chrome);

  reads[0].reject(new Error('bookmarks unavailable'));
  await settle();

  assert.equal(pendingLookup.responded, true);
  assert.equal(pendingCount.responded, true);
  assert.ok(isHandledFailure(pendingLookup.response), JSON.stringify(pendingLookup.response));
  assert.ok(isHandledFailure(pendingCount.response), JSON.stringify(pendingCount.response));
  assert.ok(context.console.entries.some(([level]) => level === 'error'));
  assert.deepEqual(unhandled, []);
});

test('a later request recovers after the initial load fails', async (t) => {
  const unhandled = trackUnhandledRejections(t);
  const { chrome, reads } = loadControlledBackground();
  reads[0].reject(new Error('bookmarks unavailable'));
  await settle();

  const laterLookup = lookup(chrome);
  const laterCount = count(chrome);
  await settle();
  assert.equal(reads.length, 2);
  assert.equal(laterLookup.responded, false);

  reads[1].resolve(treeOf('https://a.example/', 'https://c.example/'));
  await settle();
  assert.deepEqual(laterLookup.response, {
    bookmarkedUrls: ['https://a.example/', 'https://c.example/'],
  });
  assert.deepEqual(laterCount.response, { count: 2 });
  assert.deepEqual(unhandled, []);
});

test('a later bookmark event recovers after the initial load fails', async (t) => {
  const unhandled = trackUnhandledRejections(t);
  const { chrome, reads } = loadControlledBackground();
  reads[0].reject(new Error('bookmarks unavailable'));
  await settle();

  chrome.bookmarks.onCreated.emit('b', {});
  reads[1].resolve(treeOf('https://b.example/'));
  await settle();

  const laterLookup = lookup(chrome);
  const laterCount = count(chrome);
  await settle();
  assert.equal(reads.length, 2);
  assert.deepEqual(laterLookup.response, { bookmarkedUrls: ['https://b.example/'] });
  assert.deepEqual(laterCount.response, { count: 1 });
  assert.deepEqual(unhandled, []);
});

test('a failed refresh keeps the last good snapshot until a later refresh succeeds', async (t) => {
  const unhandled = trackUnhandledRejections(t);
  const { chrome, reads } = loadControlledBackground();
  reads[0].resolve(treeOf('https://a.example/', 'https://b.example/'));
  await settle();

  chrome.bookmarks.onRemoved.emit('b', {});
  const duringFailedRefresh = lookup(chrome);
  reads[1].reject(new Error('bookmarks unavailable'));
  await settle();

  const afterFailureCount = count(chrome);
  await settle();
  assert.deepEqual(duringFailedRefresh.response, {
    bookmarkedUrls: ['https://a.example/', 'https://b.example/'],
  });
  assert.deepEqual(afterFailureCount.response, { count: 2 });
  assert.equal(reads.length, 2);

  chrome.bookmarks.onChanged.emit('c', {});
  reads[2].resolve(treeOf('https://c.example/'));
  await settle();

  const afterRecoveryLookup = lookup(chrome);
  const afterRecoveryCount = count(chrome);
  await settle();
  assert.deepEqual(afterRecoveryLookup.response, { bookmarkedUrls: ['https://c.example/'] });
  assert.deepEqual(afterRecoveryCount.response, { count: 1 });
  assert.deepEqual(unhandled, []);
});

test('waits for a pending initial load when a newer refresh fails first', async (t) => {
  const unhandled = trackUnhandledRejections(t);
  const { chrome, reads } = loadControlledBackground();
  chrome.bookmarks.onCreated.emit('b', {});
  const pendingLookup = lookup(chrome);
  const pendingCount = count(chrome);
  await settle();

  // Where the newer refresh is allowed to overlap the initial load, fail it first.
  reads[1]?.reject(new Error('bookmarks unavailable'));
  await settle();
  assert.equal(pendingLookup.responded, false, JSON.stringify(pendingLookup.response));
  assert.equal(pendingCount.responded, false, JSON.stringify(pendingCount.response));

  reads[0].resolve(treeOf('https://a.example/', 'https://b.example/', 'https://a.example/'));
  await settle();
  // A refresh serialized behind the initial load starts only now; fail it too.
  reads[1]?.reject(new Error('bookmarks unavailable'));
  await settle();

  assert.deepEqual(pendingLookup.response, {
    bookmarkedUrls: ['https://a.example/', 'https://b.example/'],
  });
  assert.deepEqual(pendingCount.response, { count: 2 });
  assert.equal(reads.length, 2);

  const laterCount = count(chrome);
  await settle();
  assert.deepEqual(laterCount.response, { count: 2 });
  assert.deepEqual(unhandled, []);
});

test('coalesces a burst of bookmark events into one follow-up read', async (t) => {
  const unhandled = trackUnhandledRejections(t);
  let inFlight = 0;
  let maxInFlight = 0;
  const reads = [];
  const { chrome } = createChrome({
    getTree: () => {
      const read = deferred();
      reads.push(read);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return read.promise.finally(() => {
        inFlight -= 1;
      });
    },
  });
  loadScript('../../dist/scripts/background.js', { chrome });

  const urls = [
    'https://a.example/',
    'https://b.example/',
    'https://c.example/',
    'https://d.example/',
  ];
  const duringBurst = send(chrome, { urls });
  chrome.bookmarks.onCreated.emit('c', {});
  chrome.bookmarks.onChanged.emit('a', {});
  chrome.bookmarks.onRemoved.emit('b', {});
  chrome.bookmarks.onCreated.emit('c', {});
  await settle();
  assert.equal(reads.length, 1);

  reads[0].resolve(treeOf('https://a.example/', 'https://b.example/'));
  await settle();
  assert.equal(duringBurst.responded, false);
  assert.equal(reads.length, 2);

  reads[1].resolve(treeOf('https://a.example/', 'https://c.example/'));
  await settle();

  const newest = { bookmarkedUrls: ['https://a.example/', 'https://c.example/'] };
  assert.deepEqual(duringBurst.response, newest);
  const afterLookup = send(chrome, { urls });
  const afterCount = count(chrome);
  await settle();
  assert.deepEqual(afterLookup.response, newest);
  assert.deepEqual(afterCount.response, { count: 2 });
  assert.equal(reads.length, 2);
  assert.equal(maxInFlight, 1);
  assert.equal(inFlight, 0);
  assert.deepEqual(unhandled, []);
});
