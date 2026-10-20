/**
 * Options page logic for Eureka.
 * Stores the highlight style preference in sync storage so it follows the
 * user across devices.
 */

import { HIGHLIGHT_STYLE_KEY, readHighlightStyle } from './shared';

async function initOptions(): Promise<void> {
  const radios = document.querySelectorAll<HTMLInputElement>('input[name="highlight-style"]');
  const status = document.getElementById('save-status')!;

  const highlightStyle = await readHighlightStyle();
  const selected = document.querySelector<HTMLInputElement>(
    `input[name="highlight-style"][value="${highlightStyle}"]`
  );
  if (selected) {
    selected.checked = true;
  }

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      chrome.storage.sync
        .set({ [HIGHLIGHT_STYLE_KEY]: radio.value })
        .then(() => {
          status.textContent = 'Saved';
        })
        .catch((error: unknown) => {
          status.textContent = 'Could not save preference';
          console.error('Eureka: failed to save highlight style:', error);
        });
    });
  }
}

void initOptions();
