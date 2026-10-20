/**
 * Popup page logic for Eureka.
 * Shows how many bookmarks the background worker has loaded.
 */

import type { CountRequest, CountResponse } from './shared';

async function initPopup(): Promise<void> {
  const countElement = document.getElementById('bookmark-count')!;
  const optionsButton = document.getElementById('open-options')!;

  try {
    const request: CountRequest = { type: 'getBookmarkCount' };
    const response = (await chrome.runtime.sendMessage(request)) as
      Partial<CountResponse> | undefined;
    countElement.textContent = String(response?.count ?? 0);
  } catch (error) {
    console.error('Eureka: failed to load bookmark count:', error);
    countElement.textContent = '?';
  }

  optionsButton.addEventListener('click', () => {
    void chrome.runtime.openOptionsPage();
  });
}

void initPopup();
