# Eureka - Highlight Your Bookmarks

A Chrome extension that highlights links you have already bookmarked. Very handy when you're searching for something you've saved!

## Features

- Highlights bookmarked links on HTTP and HTTPS pages when the page loads
- Matches links by exact URL: a link is highlighted only when its resolved `href`
  (or its `data-href` attribute, when present) is exactly a bookmarked URL.
  Links that point only to a fragment on the same page (`href="#..."`) are ignored
- Highlights every link on the page that points to a bookmarked URL, including repeats
- Pick your highlight style on the options page: yellow marker, underline, or glow
- The toolbar popup shows how many unique URLs you have bookmarked (two bookmarks of
  the same URL count once) and links to the options page
- Keeps its bookmark cache up to date when bookmarks are created, removed, edited,
  moved, reordered, or imported, without polling
- Zero runtime dependencies: the built extension is plain bundled JavaScript, HTML and CSS

### Current limits

- Pages are scanned once, when they finish loading. Pages that are already open are
  not re-highlighted when bookmarks or the highlight style change; reload the page or
  navigate to it again to apply the change.
- Content added to a page after it loads (for example by single-page apps) and links
  inside iframes are not highlighted.
- The highlight style is stored with `chrome.storage.sync`. Whether it reaches other
  devices depends on Chrome Sync; this project only tests local storage behavior.

## Stack

- **Manifest V3** with an event-driven service worker
- **Strict TypeScript** runtime sources, checked by `tsc` with Chrome API types
- **esbuild** bundles each entrypoint into a classic script (no ES modules, no shared
  chunks, no remote code)
- **ESLint** (with typescript-eslint) and **Prettier**
- **Node test runner** for unit tests against controlled Chrome and DOM fakes
- **Playwright** with its bundled Chromium for real-browser integration and end-to-end tests

## Development

### Prerequisites

- Node.js 22.13 or newer in the 22.x line, or Node.js 24 or newer
- npm 10 or newer

### Setup

```bash
# Install the exact locked development dependencies
npm ci

# Download the Chromium build used by the browser tests
npx playwright install chromium
# On a fresh Linux machine, also install its system libraries:
# npx playwright install --with-deps chromium
```

### Build

```bash
npm run build
```

The build deletes and recreates `dist/`: it copies the static files from `app/` and
bundles `src/*.ts` into `dist/scripts/`. `dist/` is generated output and is not
committed. esbuild does not typecheck, so run `npm run typecheck` as well.

### Loading the extension

1. Run `npm run build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `dist` directory from this project

After changing the source, rebuild and click the reload button for the extension on
`chrome://extensions/`, then reload any open pages.

### Checks

```bash
npm run typecheck     # Strict TypeScript check of src/
npm run lint          # ESLint (npm run lint:fix to auto-fix)
npm run format:check  # Prettier check (npm run format to rewrite)
```

### Tests

```bash
npm test                  # Build, then run unit, integration and e2e tests in order
npm run test:unit         # Build, then Node test runner unit tests (test/*.test.js)
npm run test:integration  # Build, then real Chromium integration tests
npm run test:e2e          # Build, then real Chromium end-to-end tests
```

`npm test` stops at the first failing layer and exits with a non-zero code.

- **Unit tests** load the built scripts from `dist/scripts/` into Node VM contexts with
  controlled `chrome.*` and DOM fakes. They cover bookmark caching, matching,
  highlighting, the popup, the options page, and failure handling.
- **Integration tests** load `dist/` into Playwright's bundled Chromium with a disposable
  profile. They use the real bookmarks, messaging and storage APIs, check the built
  artifact, and force-stop the service worker to verify it recovers.
- **End-to-end tests** open local fixture pages and check the rendered highlight styles,
  the popup count, the options page and saved preferences.

The browser tests start a fixture server on `127.0.0.1:4310` and run one at a time
(`workers: 1`) because they share that port. They run headless and never touch your
own Chrome profile. Failure screenshots and traces are written to `test-results/`.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and on pushes to `master`, on Node.js
22 and 24. Each run does `npm ci`, installs Playwright Chromium with its Linux
dependencies, then runs typecheck, lint, format check, build and `npm test`. The
built `dist/` is uploaded as an artifact, and when a step fails the Playwright
`test-results/` and `playwright-report/` directories are uploaded for diagnosis.

## How It Works

1. **Background service worker** (`src/background.ts`)
   - Loads the set of unique bookmarked URLs when the service worker starts
   - Refreshes it when bookmarks change; an older refresh never overwrites a newer one,
     and a failed refresh keeps the last good set
   - Answers lookup and count requests from content scripts and the popup. If no
     bookmark set has loaded yet, it replies with an error instead of an empty result
     and tries loading again on the next request

2. **Content script** (`src/contentscript.ts`)
   - Runs once on each HTTP/HTTPS page and collects its links
   - Asks the service worker which of those URLs are bookmarked
   - Wraps bookmarked link text in spans carrying a highlight class from `styles/content.css`
   - Reads your highlight style from `chrome.storage.sync`, falling back to yellow

3. **Popup and options** (`src/popup.ts`, `src/options.ts`)
   - The popup (`popup.html`) shows the unique bookmarked URL count and opens the options page
   - The options page (`options.html`) picks the highlight style and saves it

## File Structure

```
src/                        # TypeScript runtime sources
├── background.ts           # Service worker
├── contentscript.ts        # Content script for highlighting
├── popup.ts                # Popup logic
├── options.ts              # Options page logic
└── shared.ts               # Shared message and style helpers
app/                        # Static extension files, copied into dist/
├── manifest.json           # Extension configuration (Manifest V3)
├── _locales/               # Localised strings
├── images/                 # Extension icons
├── popup.html              # Toolbar popup
├── options.html            # Options page
└── styles/
    ├── main.css            # Styles for the extension's own pages
    └── content.css         # Highlight styles injected into web pages
dist/                       # Generated by npm run build; load this in Chrome
scripts/build.mjs           # Build script (copy app/, bundle src/ with esbuild)
test/
├── helpers/                # chrome.* fakes, a minimal DOM and the VM script loader
├── *.test.js               # Unit tests (Node test runner)
└── browser/
    ├── integration/        # Real Chromium integration tests
    ├── e2e/                # Real Chromium end-to-end tests
    ├── extension.mjs       # Launches dist/ in a disposable Chromium profile
    ├── server.mjs          # Local fixture server (127.0.0.1:4310)
    └── manual.mjs          # Launches the extension for manual inspection
playwright.config.mjs       # Browser test projects (integration, e2e)
tsconfig.json               # Strict TypeScript settings
.github/workflows/ci.yml    # CI: checks, build and all test layers
```

## Permissions

- `bookmarks` - read your bookmarks to know which links to highlight
- `storage` - remember your highlight style

No host permissions are requested: content scripts are declared in the
manifest, which is all this extension needs to see page links.

## License

Apache License 2.0. See [LICENSE.md](LICENSE.md).
