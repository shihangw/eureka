import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, createPageDocument, createRadio } from './helpers/fakes.js';
import { loadScript } from './helpers/load-script.js';

/** Lets pending microtasks settle so async work completes. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Copies a value out of the script realm so strict deep equality works. */
const plain = (value) => JSON.parse(JSON.stringify(value));

const STYLES = ['yellow', 'underline', 'glow'];

/**
 * Loads the options script against a fake options page and sync storage.
 * Radios start as options.html declares them: yellow checked.
 * @param {object} [options]
 * @param {Record<string, unknown>} [options.stored] Initial sync storage contents.
 * @param {Error} [options.setError] Makes storage.sync.set reject.
 */
function loadOptions({ stored = {}, setError } = {}) {
  const state = { storageGets: [], storageSets: [], stored: { ...stored } };
  const radios = STYLES.map((style) => createRadio(style, style === 'yellow'));
  const status = createElement('p', { props: { textContent: '' } });

  const chrome = {
    storage: {
      sync: {
        get: async (keys) => {
          state.storageGets.push(keys);
          return keys in state.stored ? { [keys]: state.stored[keys] } : {};
        },
        set: async (items) => {
          state.storageSets.push(items);
          if (setError) {
            throw setError;
          }
          Object.assign(state.stored, items);
        },
      },
    },
  };

  const document = createPageDocument({
    elementsById: { 'save-status': status },
    radios,
  });
  const context = loadScript('../../dist/scripts/options.js', { chrome, document });
  const radio = (style) => radios.find((candidate) => candidate.value === style);
  return { state, radios, radio, status, context };
}

const checkedStyles = (radios) => radios.filter((r) => r.checked).map((r) => r.value);

test('reads the highlight style from sync storage on load', async () => {
  const { state } = loadOptions();
  await settle();

  assert.deepEqual(plain(state.storageGets), ['highlightStyle']);
});

test('selects the yellow default when no style is stored', async () => {
  const { radios } = loadOptions();
  await settle();

  assert.deepEqual(checkedStyles(radios), ['yellow']);
});

for (const style of STYLES) {
  test(`selects the stored ${style} style on load`, async () => {
    const { radio } = loadOptions({ stored: { highlightStyle: style } });
    await settle();

    assert.equal(radio(style).checked, true);
  });
}

test('leaves the page default selected when the stored style is unknown', async () => {
  const { radios } = loadOptions({ stored: { highlightStyle: 'sparkle' } });
  await settle();

  assert.deepEqual(checkedStyles(radios), ['yellow']);
});

test('does not write storage or show a status until a choice changes', async () => {
  const { state, status } = loadOptions({ stored: { highlightStyle: 'glow' } });
  await settle();

  assert.deepEqual(state.storageSets, []);
  assert.equal(status.textContent, '');
});

for (const style of STYLES) {
  test(`saves the ${style} style and reports Saved when chosen`, async () => {
    const { state, radio, status } = loadOptions();
    await settle();

    radio(style).dispatch('change');
    await settle();

    assert.deepEqual(plain(state.storageSets), [{ highlightStyle: style }]);
    assert.equal(state.stored.highlightStyle, style);
    assert.equal(status.textContent, 'Saved');
  });
}

test('a saved style is selected when the options page opens again', async () => {
  const first = loadOptions();
  await settle();
  first.radio('underline').dispatch('change');
  await settle();

  const reopened = loadOptions({ stored: first.state.stored });
  await settle();

  assert.equal(reopened.radio('underline').checked, true);
});

test('reports a failed save and logs the error', async () => {
  const { radio, status, context } = loadOptions({ setError: new Error('QUOTA_BYTES') });
  await settle();

  radio('glow').dispatch('change');
  await settle();

  assert.equal(status.textContent, 'Could not save preference');
  assert.ok(context.console.entries.some(([level]) => level === 'error'));
});
