# Permissions Justification

This document explains why each currently declared permission in [manifest.json](./manifest.json) is required by the extension as of May 12, 2026.

## Declared Permissions

### `storage`

Required to persist scan state and user data in `chrome.storage.local`.

Used for:

- Saving scan progress during a scan in [background.js](./background.js)
- Saving scanned connection data in [background.js](./background.js)
- Clearing stored data from the popup and background worker in [popup.js](./popup.js) and [background.js](./background.js)
- Restoring popup state and graph preferences in [popup.js](./popup.js) and [graph.js](./graph.js)
- Importing previously exported connection data in [popup.js](./popup.js)

Concrete call sites:

- `chrome.storage.local.set(...)` in `background.js`
- `chrome.storage.local.get(...)` in `background.js`, `popup.js`, and `graph.js`
- `chrome.storage.local.clear(...)` in `background.js` and `popup.js`

Why it is needed:

Without `storage`, the extension cannot keep scan results, track scan progress across popup reopen events, store imported data, or persist the graph's "hide names" preference.

## `scripting`

Required to execute code inside the active Discord tab with `chrome.scripting.executeScript(...)`.

Used for:

- Reading the Discord token from `localStorage`
- Inspecting Discord's webpack runtime for a token-bearing module
- Reading the Discord token from `sessionStorage`

Concrete call sites:

- `chrome.scripting.executeScript(...)` in `background.js`

Why it is needed:

The extension extracts the logged-in Discord token from the Discord page context before making API calls from the background worker. That flow depends on runtime script injection into the Discord tab.

## `downloads`

Required to export collected graph data and shareable HTML pages through Chrome's Downloads API.

Used for:

- Starting a user-visible JSON or GML download from the popup's Export button
- Starting a user-visible shareable HTML download from the popup's **Export Shareable Page** button
- Starting a merged shareable HTML download from the popup's merge flow

Concrete call sites:

- `chrome.downloads.download(...)` in `popup.js`

Why it is needed:

Without `downloads`, the export and share features cannot save the generated payload to disk.

## `activeTab`

Required to read the embedded share data from the user-selected tab during the merge flow.

Used for:

- Reading `#lattice-share-data` from the active tab via `chrome.scripting.executeScript(...)` when the user clicks **Read active tab** in the merge dialog

Concrete call sites:

- `chrome.scripting.executeScript({ target: { tabId } })` in `popup.js` against the tab returned by `chrome.tabs.query({ active: true, currentWindow: true })`

Why it is needed:

`activeTab` grants the extension temporary access to the user's active tab at the moment the user clicks the extension's UI. It does not grant broad host access; it is scoped to a single tab activation. Without `activeTab`, the merge flow could only ingest share files via the file dropzone, not from a tab the user is currently viewing.

## Host Permission: `https://discord.com/*`

Required host access for Discord pages and API endpoints.

Used for:

- Finding an open Discord tab with `chrome.tabs.query({ url: 'https://discord.com/*' })`
- Injecting token-extraction scripts into the Discord tab with `chrome.scripting.executeScript(...)`
- Fetching Discord API endpoints from the background worker, including:
  - `/api/v9/users/@me/relationships`
  - `/api/v9/users/{id}/relationships`
  - `/api/v9/users/{id}/profile?with_mutual_guilds=true`

Concrete call sites:

- Discord tab lookup in `background.js`
- Discord API fetches in `background.js`

Why it is needed:

This permission is what allows the extension to interact programmatically with Discord itself: locate the relevant tab, inject code into that page, and call Discord API endpoints from the extension context.

## Removed Permission

### `https://cdn.discordapp.com/*`

This host permission was removed because it was not required for the current implementation.

The extension still uses CDN avatar URLs as plain image sources in the UI, but it does not inject scripts into that host, query tabs on that host, or perform privileged extension `fetch()` requests against it. No declared host permission is needed for that usage pattern.
