/** Shared steps for e2e tests that render the links fixture page. */
import { expect, loadFixture } from '../extension.mjs';
import {
  E2E_TARGET_PATHS,
  LINKS_CONTROLS,
  LINKS_MATCHED,
  LINKS_PATH,
  LINKS_SITE_STYLES,
  LINKS_UNMATCHED,
} from '../pages.mjs';
import { expectHighlighted, expectNotHighlighted, readElements } from '../rendering.mjs';
import { FIXTURE_ORIGIN } from '../server.mjs';

export const LINKS_URL = `${FIXTURE_ORIGIN}${LINKS_PATH}`;
export const ALPHA_URL = `${FIXTURE_ORIGIN}${E2E_TARGET_PATHS.alpha}`;
export const BETA_URL = `${FIXTURE_ORIGIN}${E2E_TARGET_PATHS.beta}`;

const ANCHOR_IDS = [...LINKS_MATCHED, ...LINKS_UNMATCHED];
const ELEMENT_IDS = [...new Set([...ANCHOR_IDS, ...LINKS_CONTROLS])];
const NOT_HIGHLIGHTED = ELEMENT_IDS.filter((id) => !LINKS_MATCHED.includes(id));

/** Seven unique URLs on the page; alpha and beta are the bookmarked ones. */
const SCANNED_URLS = 7;

/** Loads the links page in a fresh navigation and snapshots every named element. */
export async function loadLinks(page) {
  const { message } = await loadFixture(page, { url: LINKS_URL, ids: ANCHOR_IDS });
  return { message, elements: await readElements(page, ELEMENT_IDS) };
}

/**
 * Loads the links page while nothing on it is bookmarked, as the reference for
 * unhighlighted content. The extension's stylesheet is already injected here,
 * so the reference is also checked against the page's own CSS.
 */
export async function loadLinksBaseline(page) {
  const baseline = await loadLinks(page);
  expect(baseline.message).toBe(`Eureka: highlighting 0 of ${SCANNED_URLS} links`);
  expectNotHighlighted(baseline.elements, baseline.elements, ELEMENT_IDS);
  for (const id of ELEMENT_IDS) {
    expect(baseline.elements[id].style, `${id} site style`).toMatchObject(LINKS_SITE_STYLES[id]);
  }
  return baseline.elements;
}

/** Bookmarks alpha and beta in a fixture-owned folder and waits for the worker to see them. */
export async function bookmarkLinksTargets(api, title) {
  const folder = await api.createBookmark({ title });
  await api.createBookmark({ parentId: folder.id, title: 'Alpha', url: ALPHA_URL });
  await api.createBookmark({ parentId: folder.id, title: 'Beta', url: BETA_URL });
  await expect
    .poll(async () => (await api.lookup([ALPHA_URL, BETA_URL])).bookmarkedUrls)
    .toEqual([ALPHA_URL, BETA_URL]);
  return folder;
}

/**
 * Freshly loads the links page and asserts that exactly the matched anchors
 * render the computed `style` effect while everything else equals `baseline`.
 */
export async function expectLinksRendered(page, baseline, style) {
  const { message, elements } = await loadLinks(page);
  expect(message).toBe(`Eureka: highlighting 2 of ${SCANNED_URLS} links`);
  expectHighlighted(elements, baseline, LINKS_MATCHED, style);
  expectNotHighlighted(elements, baseline, NOT_HIGHLIGHTED);
  return elements;
}
