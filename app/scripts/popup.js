/**
 * Popup page logic for Eureka.
 * Shows how many bookmarks the background worker has loaded.
 */

(async () => {
  'use strict';

  const countElement = document.getElementById('bookmark-count');
  const optionsButton = document.getElementById('open-options');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'getBookmarkCount' });
    countElement.textContent = String(response?.count ?? 0);
  } catch (error) {
    console.error('Eureka: failed to load bookmark count:', error);
    countElement.textContent = '?';
  }

  optionsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
})();
