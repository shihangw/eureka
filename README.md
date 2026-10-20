# Eureka - Highlight Your Bookmarks

A modern Chrome extension that highlights links you have already bookmarked. Very handy when you're searching for something you've saved!

## Features

- Automatically highlights bookmarked links on any webpage
- Instantly reacts to bookmark changes, no polling
- Pick your highlight style: yellow marker, underline, or glow
- Shows your bookmark count from the toolbar popup
- Fast and lightweight, with zero runtime dependencies

## Modern Stack

- **Manifest V3** - latest Chrome extension standard
- **ES2022+ JavaScript** - modern async/await, const/let, optional chaining
- **Promise-based Chrome APIs** - no callbacks
- **Event-driven service worker** - syncs when bookmarks change instead of polling on a timer
- **chrome.storage.sync** - your highlight style follows your Chrome profile across devices
- **ESLint & Prettier** - code quality and formatting
- **Node test runner** - real tests with zero test-framework dependencies
- **Zero build dependencies** - the `app` directory loads directly into Chrome

## Development

### Prerequisites

- Node.js >= 20
- npm >= 10

### Setup

```bash
# Install dependencies
npm install

# Lint code
npm run lint

# Lint and auto-fix
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check

# Run the test suite (Node test runner)
npm test
```

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `app` directory from this project

### Development Tips

- Changes to content scripts require a page reload
- Changes to background scripts require an extension reload
- Check the browser console for debugging output

## How It Works

1. **Background service worker** (`scripts/background.js`)
   - Loads every bookmark URL into a cache when the service worker starts
   - Refreshes the cache the moment bookmarks change (created, removed, edited, or moved)
   - Answers queries from content scripts and the popup

2. **Content script** (`scripts/contentscript.js`)
   - Runs on every page and collects the links it finds
   - Asks the service worker which URLs are bookmarked
   - Wraps bookmarked link text in spans carrying a highlight class from `styles/content.css`
   - Reads your highlight style preference from `chrome.storage.sync`

3. **Popup and options**
   - The popup (`popup.html`) shows how many bookmarks are loaded
   - The options page (`options.html`) picks the highlight style, saved to sync storage

## File Structure

```
app/
├── manifest.json           # Extension configuration (Manifest V3)
├── _locales/               # Localised strings
├── images/                 # Extension icons
├── popup.html              # Toolbar popup
├── options.html            # Options page
├── scripts/
│   ├── background.js       # Service worker
│   ├── contentscript.js    # Content script for highlighting
│   ├── popup.js            # Popup logic
│   └── options.js          # Options page logic
└── styles/
    ├── main.css            # Styles for the extension's own pages
    └── content.css         # Highlight styles injected into web pages
test/
├── helpers/                # chrome.* mocks and a minimal DOM
├── background.test.js      # Service worker tests
└── contentscript.test.js    # Highlighting tests
.github/workflows/ci.yml    # Lint, format check, and tests on CI
```

## Permissions

- `bookmarks` - read your bookmarks to know which links to highlight
- `storage` - remember your highlight style and sync it across devices

No host permissions are requested: content scripts are declared in the
manifest, which is all this extension needs to see page links.

## License

MIT
