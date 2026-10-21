/**
 * Extra deterministic fixture documents for the end-to-end tests. The server
 * serves them next to the integration fixture; tests import the paths and the
 * expected anchor outcomes from here.
 */

/** Page with repeated, nested and near-miss links plus unrelated styled content. */
export const LINKS_PATH = '/pages/links.html';

/** Page whose six anchors cover the content script's URL selection rules. */
export const SELECTION_PATH = '/pages/selection.html';

/** Paths the e2e tests bookmark, relative to the fixture origin. */
export const E2E_TARGET_PATHS = Object.freeze({
  alpha: '/targets/alpha',
  beta: '/targets/beta',
  gamma: '/targets/gamma',
  deltaSection: '/targets/delta#section',
});

/** Links page anchors that highlight once alpha and beta are bookmarked. */
export const LINKS_MATCHED = Object.freeze(['nested', 'repeat-1', 'repeat-2']);

/**
 * Links page anchors that never highlight: an unbookmarked link and variants of
 * the bookmarked alpha URL that differ only by query, fragment, trailing slash
 * or a longer path sharing its prefix.
 */
export const LINKS_UNMATCHED = Object.freeze([
  'unmatched',
  'query',
  'fragment',
  'trailing-slash',
  'prefix',
]);

/** Page content outside any link that must keep the site's own styling. */
export const LINKS_CONTROLS = Object.freeze(['unmatched', 'plain', 'unrelated']);

const SITE_ANCHOR_STYLE = Object.freeze({
  backgroundColor: 'rgba(0, 0, 0, 0)',
  textDecorationLine: 'underline',
  textUnderlineOffset: 'auto',
  borderRadius: '0px',
  boxShadow: 'none',
});

/**
 * Computed styles the links page's own CSS gives each named element, which
 * the extension's injected stylesheet must not alter.
 */
export const LINKS_SITE_STYLES = Object.freeze({
  ...Object.fromEntries(
    [...LINKS_MATCHED, ...LINKS_UNMATCHED].map((id) => [id, SITE_ANCHOR_STYLE])
  ),
  plain: {
    backgroundColor: 'rgb(240, 240, 240)',
    textDecorationLine: 'none',
    borderRadius: '0px',
    boxShadow: 'none',
  },
  unrelated: {
    backgroundColor: 'rgb(220, 235, 255)',
    textDecorationLine: 'line-through',
    borderRadius: '6px',
    boxShadow: 'rgb(0, 0, 0) 0px 1px 2px 0px',
  },
});

function linksHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Eureka links fixture</title>
    <style>
      body { font: 16px/1.5 Georgia, serif; color: rgb(20, 20, 20); }
      a { color: rgb(0, 0, 238); }
      #nested strong { font-weight: 700; }
      .plain { background-color: rgb(240, 240, 240); }
      .badge {
        background-color: rgb(220, 235, 255);
        border-radius: 6px;
        box-shadow: rgb(0, 0, 0) 0px 1px 2px 0px;
        text-decoration: line-through;
      }
    </style>
  </head>
  <body>
    <h1>Eureka links fixture</h1>
    <ul>
      <li><a id="repeat-1" href="/targets/alpha">Alpha link</a></li>
      <li><a id="repeat-2" href="/targets/alpha">Alpha <em>repeated</em> link</a></li>
      <li>
        <a id="nested" href="/targets/beta"
          ><strong>Beta</strong> with <em>nested <code>text</code></em></a
        >
      </li>
      <li><a id="unmatched" href="/targets/control">Unbookmarked control</a></li>
      <li><a id="query" href="/targets/alpha?variant=1">Alpha with query</a></li>
      <li><a id="fragment" href="/targets/alpha#details">Alpha with fragment</a></li>
      <li><a id="trailing-slash" href="/targets/alpha/">Alpha with trailing slash</a></li>
      <li><a id="prefix" href="/targets/alphabet">Alphabet shares a prefix</a></li>
    </ul>
    <p id="plain" class="plain">Plain text that is not a link.</p>
    <p><span id="unrelated" class="badge">Unrelated styled span</span></p>
  </body>
</html>
`;
}

/**
 * The six selection-rule anchors, keyed by ID, with the raw attributes on the
 * page and the URL the content script must select (null when excluded).
 * @param {string} origin
 */
export function selectionAnchors(origin) {
  return {
    'data-href-bookmarked': {
      attributes: { href: '/targets/control', 'data-href': `${origin}/targets/alpha` },
      selected: `${origin}/targets/alpha`,
      highlighted: true,
    },
    'data-href-unbookmarked': {
      attributes: { href: '/targets/alpha', 'data-href': `${origin}/targets/unlisted` },
      selected: `${origin}/targets/unlisted`,
      highlighted: false,
    },
    'data-href-empty': {
      attributes: { href: '/targets/beta', 'data-href': '' },
      selected: `${origin}/targets/beta`,
      highlighted: true,
    },
    'relative-href': {
      attributes: { href: '../targets/gamma' },
      selected: `${origin}/targets/gamma`,
      highlighted: true,
    },
    'raw-fragment': {
      attributes: { href: '#section', 'data-href': `${origin}/targets/alpha` },
      selected: null,
      highlighted: false,
    },
    'absolute-fragment': {
      attributes: { href: `${origin}/targets/delta#section` },
      selected: `${origin}/targets/delta#section`,
      highlighted: true,
    },
  };
}

const escapeAttribute = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

function selectionHtml(origin) {
  const items = Object.entries(selectionAnchors(origin))
    .map(([id, { attributes }]) => {
      const attrs = Object.entries(attributes)
        .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
        .join('');
      return `      <li><a id="${id}"${attrs}>${id} link</a></li>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Eureka selection fixture</title>
  </head>
  <body>
    <h1>Eureka selection fixture</h1>
    <ul>
${items}
    </ul>
    <h2 id="section">Section</h2>
  </body>
</html>
`;
}

/**
 * Returns the HTML of an e2e fixture page, or undefined for other paths.
 * @param {string} pathname
 * @param {string} origin
 */
export function e2ePageHtml(pathname, origin) {
  if (pathname === LINKS_PATH) return linksHtml();
  if (pathname === SELECTION_PATH) return selectionHtml(origin);
  return undefined;
}
