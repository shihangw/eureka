# Eureka - Highlight Your Bookmarks

A modern Chrome extension that highlights links you have bookmarked. Very handy when you're googling something you've already bookmarked!

## Features

- 🎯 Automatically highlights bookmarked links on any webpage
- 🔄 Syncs with Chrome bookmarks in real-time
- ⚡ Fast and lightweight - no external dependencies
- 🎨 Simple yellow highlight for easy visibility

## Modern Stack

This extension has been modernized with:

- ✅ **Manifest V3** - Latest Chrome extension standard
- ✅ **ES6+ JavaScript** - Modern async/await, arrow functions, const/let
- ✅ **Native DOM APIs** - No jQuery dependency
- ✅ **Promise-based Chrome APIs** - No callbacks
- ✅ **ESLint & Prettier** - Code quality and formatting
- ✅ **Zero build dependencies** - Works directly from source

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Setup

```bash
# Install dependencies
npm install

# Lint code
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check
```

### Loading the Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `app` directory from this project

### Development Tips

- Changes to content scripts require a page reload
- Changes to background scripts require extension reload
- Check the browser console for debugging output

## How It Works

1. **Background Service Worker** (`background.js`)
   - Loads all Chrome bookmarks on startup
   - Refreshes bookmark cache every minute
   - Responds to queries from content scripts

2. **Content Script** (`contentscript.js`)
   - Runs on every webpage
   - Collects all links on the page
   - Queries background script for bookmarked URLs
   - Highlights matching links with yellow background

## File Structure

```
app/
├── manifest.json           # Extension configuration (Manifest V3)
├── scripts/
│   ├── background.js       # Service worker
│   ├── contentscript.js    # Content script for highlighting
│   ├── popup.js            # Popup menu logic
│   └── options.js          # Options page logic
├── styles/
│   └── main.css           # Styles
├── images/                # Extension icons
├── popup.html            # Extension popup
└── options.html          # Options page
```

## Permissions

- `bookmarks` - Read Chrome bookmarks
- `alarms` - Schedule periodic bookmark refresh
- `host_permissions` - Access webpage content to highlight links

## License

MIT
