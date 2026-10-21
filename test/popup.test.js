import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, createPageDocument } from './helpers/fakes.js';
import { loadScript } from './helpers/load-script.js';

/** Lets pending microtasks settle so async work completes. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Copies a value out of the script realm so strict deep equality works. */
const plain = (value) => JSON.parse(JSON.stringify(value));

/**
 * Loads the popup script against a fake popup page and chrome runtime.
 * @param {object} options
 * @param {() => Promise<unknown>} options.respond Produces the sendMessage result.
 */
function loadPopup({ respond }) {
  const state = { sentMessages: [], optionsPagesOpened: 0 };
  const countElement = createElement('strong', { props: { textContent: '…' } });
  const optionsButton = createElement('button');

  const chrome = {
    runtime: {
      sendMessage: async (message) => {
        state.sentMessages.push(message);
        return respond();
      },
      openOptionsPage: () => {
        state.optionsPagesOpened += 1;
      },
    },
  };

  const document = createPageDocument({
    elementsById: { 'bookmark-count': countElement, 'open-options': optionsButton },
  });
  const context = loadScript('../../dist/scripts/popup.js', { chrome, document });
  return { state, countElement, optionsButton, context };
}

const click = (element) => {
  for (const { type, listener } of element.listeners) {
    if (type === 'click') {
      listener({ type });
    }
  }
};

test('asks the background worker for the bookmark count', async () => {
  const { state } = loadPopup({ respond: async () => ({ count: 2 }) });
  await settle();

  assert.deepEqual(plain(state.sentMessages), [{ type: 'getBookmarkCount' }]);
});

test('displays the unique URL count reported by the background worker', async () => {
  const { countElement } = loadPopup({ respond: async () => ({ count: 3 }) });
  await settle();

  assert.equal(countElement.textContent, '3');
});

test('displays zero when the response carries no count', async () => {
  const { countElement } = loadPopup({ respond: async () => undefined });
  await settle();

  assert.equal(countElement.textContent, '0');
});

test('displays a question mark and logs when the count request fails', async () => {
  const { countElement, context } = loadPopup({
    respond: async () => {
      throw new Error('Could not establish connection');
    },
  });
  await settle();

  assert.equal(countElement.textContent, '?');
  assert.ok(context.console.entries.some(([level]) => level === 'error'));
});

test('opens the options page when the options button is clicked', async () => {
  const { state, optionsButton } = loadPopup({ respond: async () => ({ count: 1 }) });
  await settle();
  assert.equal(state.optionsPagesOpened, 0);

  click(optionsButton);
  assert.equal(state.optionsPagesOpened, 1);
});

test('displays a question mark when the background reports bookmarks are unavailable', async () => {
  const { countElement, context } = loadPopup({
    respond: async () => ({ error: 'Bookmarks are unavailable' }),
  });
  await settle();

  assert.equal(countElement.textContent, '?');
  assert.ok(context.console.entries.some(([level]) => level === 'error'));
});
