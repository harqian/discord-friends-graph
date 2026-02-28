# Discord Friend Graph

Discord Friend Graph is a Chrome extension that scans your Discord friends list and visualizes mutual connections as an interactive network graph.

Everything runs locally in your browser. There is no backend and no build step.

## Features

- Scan your Discord friends list from your existing logged-in web session
- Choose a scan limit before starting (useful for large friend lists)
- Track scan progress and stop mid-scan if needed
- Explore connections in a graph view with avatars and node highlighting
- Capture per-server nicknames from mutual guild profile data (best effort)
- Clear stored data at any time

## Quick Start

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repository folder
5. Open `https://discord.com` and make sure you are logged in
6. Click the extension icon:
   1. **Scan Friends**
   2. Pick how many friends to scan
   3. **Start Scan**
   4. **View Graph**

## How It Works

1. The popup asks the background service worker to start a scan.
2. The service worker extracts your Discord auth token from the Discord tab context.
3. It calls Discord API endpoints to fetch:
   - your friend relationships
   - each friend's relationships (for mutual edges)
4. Results are written to `chrome.storage.local`.
5. `graph.html` reads stored data and renders it with `vis-network`.

## Privacy

- No token pasting
- No external server
- No data upload by this extension
- Data is stored only in `chrome.storage.local` on your machine

You can remove data anytime via **Clear Data** in the popup.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save scan results and progress locally |
| `scripting` | Execute token extraction logic in the Discord tab context |
| `downloads` | Export collected graph data as a JSON file |
| `https://discord.com/*` | Access Discord pages and API endpoints |

## Project Structure

- `manifest.json`: MV3 extension configuration
- `background.js`: service worker for token extraction, API calls, scan orchestration
- `popup.html` / `popup.css` / `popup.js`: extension popup UI and scan controls
- `graph.html` / `graph.js`: graph page and rendering logic
- `lib/vis-network.min.js`: graph visualization library
- `icons/`: extension icons (`svg` source + generated `png`)

## Development Notes

- No package manager, no bundler, no transpiler
- What you see in the repo is what Chrome runs
- After code changes, click **Reload** on the extension in `chrome://extensions`

## Troubleshooting

- **"Open Discord first"**: Make sure a Discord tab is open at `https://discord.com/*`.
- **Token extraction error**: Refresh Discord and try again.
- **Graph missing data**: Run a new scan or clear old data and rescan.
- **Icon updates not showing**: Reload the unpacked extension to bust Chrome icon cache.

## Disclaimer

This project uses undocumented Discord API behavior and may stop working if Discord changes internal implementation or endpoints. Use at your own risk and review the source before using.
