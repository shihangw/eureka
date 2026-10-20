/**
 * Options page logic for Eureka.
 * Stores the highlight style preference in sync storage so it follows the
 * user across devices.
 */

(async () => {
  'use strict';

  /** Highlight style used when the user has not picked one yet. */
  const DEFAULT_HIGHLIGHT_STYLE = 'yellow';

  const radios = document.querySelectorAll('input[name="highlight-style"]');
  const status = document.getElementById('save-status');

  const { highlightStyle = DEFAULT_HIGHLIGHT_STYLE } =
    await chrome.storage.sync.get('highlightStyle');
  const selected = document.querySelector(
    `input[name="highlight-style"][value="${highlightStyle}"]`
  );
  if (selected) {
    selected.checked = true;
  }

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      const saving = chrome.storage.sync.set({ highlightStyle: radio.value });
      saving
        .then(() => {
          status.textContent = 'Saved';
        })
        .catch((error) => {
          status.textContent = 'Could not save preference';
          console.error('Eureka: failed to save highlight style:', error);
        });
    });
  }
})();
