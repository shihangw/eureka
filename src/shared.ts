/** Highlight style used when the user has not picked one yet. */
export const DEFAULT_HIGHLIGHT_STYLE = 'yellow';

/** Sync storage key holding the chosen highlight style. */
export const HIGHLIGHT_STYLE_KEY = 'highlightStyle';

/** Content script request for the subset of page URLs that are bookmarked. */
export interface LookupRequest {
  urls: string[];
}

export interface LookupResponse {
  bookmarkedUrls: string[];
}

/** Popup request for the number of unique bookmarked URLs. */
export interface CountRequest {
  type: 'getBookmarkCount';
}

export interface CountResponse {
  count: number;
}

export function isLookupRequest(message: unknown): message is LookupRequest {
  return Array.isArray((message as Partial<LookupRequest> | null | undefined)?.urls);
}

export function isCountRequest(message: unknown): message is CountRequest {
  return (message as Partial<CountRequest> | null | undefined)?.type === 'getBookmarkCount';
}

/**
 * Reads the stored highlight style, falling back to the default when none is saved.
 * The stored value is returned as-is so an unexpected value behaves as before.
 */
export async function readHighlightStyle(): Promise<string> {
  const items = await chrome.storage.sync.get(HIGHLIGHT_STYLE_KEY);
  const stored: unknown = items[HIGHLIGHT_STYLE_KEY];
  return stored === undefined ? DEFAULT_HIGHLIGHT_STYLE : String(stored);
}
