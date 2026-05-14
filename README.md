# Discord Friends Graph

Discord Friends Graph is a Chrome extension that scans your Discord friends list and visualizes mutual connections as an interactive network graph.

Everything runs locally in your browser. There is no backend and no build step.

## Features

- Scan your Discord friends list from your existing logged-in web session
- Choose a scan limit before starting (useful for large friend lists)
- Track scan progress and stop mid-scan if needed
- Explore connections in a graph view with avatars and node highlighting
- Capture per-server nicknames from mutual guild profile data (best effort)
- Export a self-contained shareable HTML you can embed anywhere
- Merge a Discord Friends Graph share page with your own scan, locally
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

## Sharing

Click **Export Shareable Page** in the popup to download a single
self-contained `.html` file of your graph. You choose the obfuscation
options before exporting:

- **Hide names** replaces real display names + usernames + tags with
  `Hidden User N` placeholders, baked into the file before download.
- **Hide avatars** replaces every Discord avatar URL with the default
  Discord avatar, baked into the file before download.
- **Omit specific friends** drops chosen friends entirely. Their user IDs,
  names, and any edges touching them are absent from the published file.

The downloaded file is a single self-contained HTML page with vis-network,
the viewer code, and your graph data inlined. Open it in any browser, host
it anywhere. Discord user IDs of included friends are always present in
the file — that's what makes merging possible.

## Embedding

The same shareable HTML works as an `<iframe>` source on any page you
control. See [EMBED.md](./EMBED.md) for the copy-paste snippet and hosting
options.

## Merging

If you have the extension installed and visit a Discord Friends Graph share page,
click **Merge with shared page** in the popup, then **Read active tab**.
The extension reads the share data, matches users by Discord user ID against
your own local scan, shows a match count, and lets you preview or publish a
new merged HTML.

You can also drop a downloaded `.html` share file into the merge dropzone.

Merged share files contain both data sets. Edges seen by both sides
(confirmed mutuals) render thicker and bluer; edges only one side saw
render in their respective single-side color. The merged file is normally
~1.5 MB plus growth proportional to the merged node count.

## Privacy

- No token pasting
- No external server operated by us
- The extension itself does not transmit your data
- Data is stored only in `chrome.storage.local` on your machine
- If you **choose** to publish a shareable page, that file contains the
  data you exported with the obfuscation choices you picked. Anyone who
  finds the URL can read it. There is no remote revocation — to take a
  share down, delete the file from your host.
- A visitor with the extension can produce a merged version of your
  published file combined with their own scan, and publish that merged
  file without notifying you. See the privacy policy for details.

You can remove local data anytime via **Clear Data** in the popup.

Full privacy policy: [PRIVACY_POLICY.md](./PRIVACY_POLICY.md)

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save scan results and progress locally |
| `scripting` | Execute token extraction logic in the Discord tab context |
| `downloads` | Export collected graph data as JSON / GML / shareable HTML |
| `activeTab` | When you click **Read active tab** during merge, read the Discord Friends Graph share data out of the current tab |
| `https://discord.com/*` | Access Discord pages and API endpoints |

## Project Structure

- `manifest.json`: MV3 extension configuration
- `background.js`: service worker for token extraction, API calls, scan orchestration
- `popup.html` / `popup.css` / `popup.js`: extension popup UI and scan / publish / merge controls
- `graph.html` / `graph.js`: graph page and rendering logic (used by the extension and inlined into share pages)
- `share/`: assets bundled into every published share file (`template.html`, `viewer.css`, `viewer.js`)
- `lib/vis-network.js`: graph visualization library
- `lib/share-builder.js`: pure helpers for building, validating, and merging share envelopes (loaded in popup, requireable from Node)
- `lib/share-envelope.md`: schema spec for `shareEnvelopeV1`
- `test/`: Node-runnable fixture tests (`node test/test-envelope.cjs`, `node test/test-merge.cjs`)
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
