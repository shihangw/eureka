/**
 * Options page logic for Eureka.
 * Stores the highlight style preference in sync storage so it follows the
 * user across devices.
 */

import { HIGHLIGHT_STYLE_KEY, readHighlightStyle } from './shared';

async function initOptions(): Promise<void> {
  const radios = document.querySelectorAll<HTMLInputElement>('input[name="highlight-style"]');
  const status = document.getElementById('save-status')!;

  let changedByUser = false;

  // Register listeners before reading storage so a failed read cannot block saving.
  for (const radio of radios) {
    radio.addEventListener('change', () => {
      changedByUser = true;
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

  let highlightStyle: string;
  try {
    highlightStyle = await readHighlightStyle();
  } catch (error) {
    console.error('Eureka: failed to read highlight style:', error);
    return;
  }

  // A late read must not undo a choice the user already made.
  if (changedByUser) return;
  const selected = document.querySelector<HTMLInputElement>(
    `input[name="highlight-style"][value="${highlightStyle}"]`
  );
  if (selected) {
    selected.checked = true;
  }
}

void initOptions();
