# Shareable, Embeddable, Mergeable Graphs — Implementation Plan

## Overview

Extend the client-only Chrome MV3 extension with three composable capabilities, with **zero new backend, no accounts, no central registry**:

1. **Share** — export your local graph as a single self-contained HTML file you can host anywhere (GitHub Pages, personal site, S3, etc.).
2. **Embed** — that same HTML file is iframe-friendly so you can drop it into another page on a site you control.
3. **Merge** — a visitor with the extension can read a Discord Lattice share page (from the active tab or a local file), match user IDs against their own scan, and publish a new combined HTML.

The defining constraint stays intact: data still never travels through any server we operate. Users choose where (or whether) to host the HTML.

## Current State Analysis

The repo is a vanilla-JS MV3 extension with no build step, no package manager, no backend. Storage is `chrome.storage.local` keyed by Discord snowflake user IDs; the per-user record shape is fixed across the codebase (see `popup.js:248–270` `normalizeImportedConnections`).

Key facts driving the design:

- **Export plumbing already exists.** `popup.js:137–235` builds JSON and GML exports via `buildGraphExportData`, `buildJsonExportPayload`, `buildGmlExportText`, `getExportConfig`. The share-HTML export will reuse `buildGraphExportData` rather than re-walk the connections object.
- **Local obfuscation is already a binary toggle.** `graph.js:76` defines `HIDE_NAMES_STORAGE_KEY = 'graphHideNames'`; `graph.js:83–112` defines `getMaskedName`, `getMaskedMeta`, and runtime helpers that swap visible text. This logic is the model for the *soft* runtime hide; the new feature is a *hard* hide that omits data before serialization.
- **The graph view is self-contained**. `graph.html:357–386` is the entire viewer DOM; `graph.js` only depends on `chrome.storage.local.get(['connections', HIDE_NAMES_STORAGE_KEY])` at `graph.js:342` for its inputs. Extract that read into a `loadShareData()` indirection and the same renderer works both as the extension page and as a published share page.
- **Vis-network is 1.43 MB unminified**, deliberately so (commit `2c8451e change minified vis-network to expanded version`). Inline export will carry that 1.43 MB per file; a typical 100-friend graph adds ~60 KB; 500-friend ~300 KB. Total per-share: ~1.5–1.8 MB. Acceptable.
- **Edge model is set-union friendly.** `popup.js:157–176` already builds `nodes` + `edges` by deduping with `[srcId, dstId].sort().join('::')`. Merging two graphs is the same dedupe over a unioned key set.
- **No new host permissions needed for merge.** The active-tab merge path reads DOM via `activeTab` (granted at user click). The file-drop path reads via the standard `<input type=file>` — no permissions at all.

### Key Discoveries
- `popup.js:137 buildGraphExportData(connections)` returns `{nodes, edges}` in the exact shape we want for the share envelope — reuse, don't rebuild.
- `graph.js:340 loadGraph()` currently reads from `chrome.storage.local` directly; this is the single integration point that has to become pluggable so the same renderer can be embedded standalone in a share page.
- `graph.js:67 defaultAvatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png'` — when "hide avatars" is set at publish, we substitute this URL into the serialized data (not just at render).
- `manifest.json` content_security_policy is `"script-src 'self'; object-src 'none'"`. This only constrains the **extension's** pages, not the published HTML hosted elsewhere. The published HTML has no extension CSP at all; the host site's CSP applies.
- `THOUGHS.md:1` mentions "somehow show im not logging the tokens" — once we add share/merge, the privacy narrative gets more complex and the README/PRIVACY_POLICY need a dedicated section.

## Desired End State

After this plan ships:

1. From the popup, a user can click **"Export Shareable Page"**, pick obfuscation + per-node omits + an optional title, and download a single `.html` file that opens correctly in any modern browser, with full graph + search + selection, no internet required.
2. That same file embeds cleanly inside an `<iframe>` on another page; the user gets a documented copy-paste snippet.
3. With the extension installed, a visitor on a Discord Lattice share page (or with a local copy of one) can click the extension icon, see a match count vs. their own local scan, preview the merge, choose their own obfuscation, and export a new combined HTML.

Verifiable by: loading the produced HTML in a fresh Chrome window with no extension, opening it from a published GitHub Pages URL, embedding it in a static test page, and running the merge end-to-end between two scanned datasets.

## What We're NOT Doing

- No backend, no accounts, no central registry of shared graphs.
- No edit-after-publish; no remote revocation. The only revocation is "delete the file from the host."
- No cross-device merge. Merge only works against the visitor's `chrome.storage.local` data on the same browser profile.
- No consent step before a visitor publishes a merge (this was an explicit user decision; the privacy footgun is disclosed in `PRIVACY_POLICY.md`).
- No telemetry, view counters, or analytics on share pages.
- No social share metadata (OG tags, Twitter cards) in v1. Could add later.
- No password-protected shares (would require either a backend or client-side crypto with key exchange, both out of scope).
- No graph editing in the published page — it's view-only with search + selection.
- No mobile-specific UX work beyond what already works.

## Implementation Approach

Build phase-by-phase, each phase ending in something testable end-to-end. The core architectural move is **factoring the graph renderer to accept its data via a function call instead of reading `chrome.storage.local` directly**, so the same renderer works in three contexts: the existing extension graph page, the new published share page (no extension, no Chrome APIs), and the merge-preview UI.

Three layout principles for new code:

1. **Reuse `buildGraphExportData` as the canonical node/edge builder.** Anything that emits or consumes nodes+edges goes through it.
2. **The share envelope is the contract.** A single JSON schema (`shareEnvelopeV1`) is the only thing that crosses the extension/published-page boundary. Define it once; both sides validate it.
3. **Hard-hide means hard-hide.** When obfuscation is "on" for a field, that field's value is replaced with a placeholder *before* serialization. View Source must not reveal it.

---

## Phase 0: Share Envelope Format

### Overview
Define `shareEnvelopeV1` — the JSON contract that gets embedded in every published HTML and read by the merge logic. No code yet, just the schema spec recorded in repo so subsequent phases reference one source of truth.

### Changes Required

#### 1. Schema spec
**File**: `lib/share-envelope.md` (new)
**Changes**: Document the schema below. Include validation rules (required fields, allowed enum values, what a consumer must reject).

```jsonc
{
  "schemaVersion": 1,
  "kind": "discord-lattice-share",
  "generatedAt": "2026-05-12T10:23:00.000Z",
  "title": "My Discord Friends" /* nullable, owner-provided */,
  "obfuscation": {
    "hideNames": true,
    "hideAvatars": false,
    "omittedNodeCount": 3 /* count only; identities of omitted nodes are not in the file */
  },
  "nodes": [
    {
      "id": "123456789012345678",         /* Discord snowflake, always present */
      "label": "Hidden User 1",            /* placeholder if hideNames; else real display name */
      "avatarUrl": "https://cdn.discordapp.com/embed/avatars/0.png", /* placeholder if hideAvatars */
      "username": "",                      /* "" if hideNames, else friend.username */
      "tag": "",                            /* "" if hideNames, else friend.tag */
      "nickPreview": "",                   /* "" if hideNames; serverNicknames are NEVER serialized */
      "provenance": ["owner"]               /* who saw this node: ["owner"], ["visitor"], or ["owner","visitor"] */
    }
  ],
  "edges": [
    {
      "source": "123456789012345678",
      "target": "987654321098765432",
      "provenance": ["owner"]               /* who saw this edge */
    }
  ]
}
```

Validation rules a consumer (merge) must enforce:
- Reject if `schemaVersion !== 1` or `kind !== "discord-lattice-share"`.
- Reject if `nodes`/`edges` are not arrays.
- Drop any edge whose endpoints are not present in `nodes`.
- Trust `obfuscation.hideNames`/`hideAvatars` as informational only; never try to "un-hide" by guessing.

### Success Criteria

#### Automated Verification
- [x] `lib/share-envelope.md` exists and includes the full schema, validation rules, and an example.
- [x] Schema is referenced (by file path) from `plans/2026-05-12-shareable-mergeable-graphs.md`.

#### Manual Verification
- [ ] Spec reads cleanly to a new contributor without ambient context.
- [ ] Schema fields match the existing `connections` shape closely enough that `buildGraphExportData` can produce them with light remapping.

---

## Phase 1: "Export Shareable Page" — Standalone HTML

### Overview
A new popup action that opens a publish dialog (obfuscation + per-node omits + optional title), then generates a single self-contained `.html` file containing: inlined `vis-network.js`, viewer CSS, viewer JS, and the share envelope as a JSON `<script>` block. The file works in any browser, offline, with no extension installed.

### Changes Required

#### 1. Factor graph renderer to accept injected data
**File**: `graph.js`
**Changes**: Extract the data-loading from `loadGraph()` at `graph.js:340–443`. Today the function reads `chrome.storage.local`. Make it accept a `dataSource` function the page calls before render:

```js
// new module-level
let dataSource = async () => {
  const result = await chrome.storage.local.get(['connections', HIDE_NAMES_STORAGE_KEY]);
  return {
    connections: result.connections || {},
    hideNames: Boolean(result[HIDE_NAMES_STORAGE_KEY]),
    hideAvatars: false,
    isShare: false
  };
};

// expose for the share-page bootstrap to override before loadGraph() runs
window.__latticeSetDataSource = (fn) => { dataSource = fn; };
```

`loadGraph()` calls `await dataSource()` instead of reading storage directly. When `isShare === true`, suppress controls that mutate state (the hide-names toggle becomes hidden because obfuscation is baked in).

This is the single biggest plumbing change. After it, the renderer is identical between extension-page and share-page contexts.

#### 2. Build the publish dialog
**File**: `popup.html`, `popup.css`, `popup.js`
**Changes**: Add a new section `#publish-section` (hidden by default), shown when the user clicks a new **"Export Shareable Page"** button next to the existing format selector. Dialog contains:

- Title input (optional, max ~80 chars).
- Three checkboxes: `Hide names`, `Hide avatars` (default unchecked), `Omit specific friends`.
- A searchable friend list (filtered by username/displayName) with a checkbox next to each row; only shown when "Omit specific friends" is checked. Reuses the same `searchIndex` shape `graph.js:212–221` builds, but populated from popup-side data.
- **Publish** and **Cancel** buttons.

UX flow: click **Export Shareable Page** → dialog opens → user picks options → click **Publish** → file downloads.

#### 3. Share envelope builder
**File**: `popup.js`
**Changes**: Add `buildShareEnvelope(connections, opts)` next to `buildJsonExportPayload` (`popup.js:181`):

```js
function buildShareEnvelope(connections, opts) {
  const { hideNames, hideAvatars, omittedIds, title } = opts;
  const omittedSet = new Set(omittedIds.map(String));
  const keptIds = Object.keys(connections).filter(id => !omittedSet.has(String(id)));

  const nodes = keptIds.map((id) => {
    const friend = connections[id];
    return {
      id: String(id),
      label: hideNames ? `Hidden User ${nodeIndex}` : getDisplayName(friend),
      avatarUrl: hideAvatars ? 'https://cdn.discordapp.com/embed/avatars/0.png' : (friend.avatarUrl || ''),
      username: hideNames ? '' : (friend.username || ''),
      tag: hideNames ? '' : (friend.tag || ''),
      nickPreview: hideNames ? '' : computeNickPreview(friend),  // reused from graph.js:186
      provenance: ['owner']
    };
  });

  const edgeKeys = new Set();
  const edges = [];
  for (const id of keptIds) {
    const friend = connections[id];
    const connList = Array.isArray(friend.connections) ? friend.connections : [];
    for (const otherId of connList) {
      const other = String(otherId);
      if (other === String(id) || omittedSet.has(other) || !connections[other]) continue;
      const key = [String(id), other].sort().join('::');
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ source: String(id), target: other, provenance: ['owner'] });
    }
  }

  return {
    schemaVersion: 1,
    kind: 'discord-lattice-share',
    generatedAt: new Date().toISOString(),
    title: title || null,
    obfuscation: {
      hideNames: Boolean(hideNames),
      hideAvatars: Boolean(hideAvatars),
      omittedNodeCount: omittedSet.size
    },
    nodes,
    edges
  };
}
```

The `nodeIndex` placeholder above: assign sequential numbers as nodes are emitted so "Hidden User 1, 2, 3" labels are stable within a single share.

#### 4. Bundle assembler
**File**: `popup.js` (next to `getExportConfig` at `popup.js:219`)
**Changes**: Add `buildShareableHtml(envelope)` that fetches the assets via `fetch(chrome.runtime.getURL(path))`, inlines them, and returns the full HTML string:

```js
async function buildShareableHtml(envelope) {
  const [vis, viewerCss, viewerJs, template] = await Promise.all([
    fetch(chrome.runtime.getURL('lib/vis-network.js')).then(r => r.text()),
    fetch(chrome.runtime.getURL('share/viewer.css')).then(r => r.text()),
    fetch(chrome.runtime.getURL('share/viewer.js')).then(r => r.text()),
    fetch(chrome.runtime.getURL('share/template.html')).then(r => r.text())
  ]);

  return template
    .replace('/*__VIS_NETWORK_JS__*/', () => vis)
    .replace('/*__VIEWER_CSS__*/', () => viewerCss)
    .replace('/*__VIEWER_JS__*/', () => viewerJs)
    .replace(
      '/*__SHARE_ENVELOPE_JSON__*/',
      // safe to interpolate: JSON has no </script> sequences in well-formed payloads,
      // but defensively escape `</` to prevent script-tag termination injection.
      () => JSON.stringify(envelope).replace(/</g, '\\u003c')
    );
}
```

(Note: `String.prototype.replace` with a function source is used to avoid `$&`-style replacement string surprises if the asset contains `$&`.)

#### 5. Share-page assets
**Files**:
- `share/template.html` (new) — minimal HTML shell with placeholders for the four inlined chunks.
- `share/viewer.css` (new) — extracted from `graph.html`'s `<style>` block, with iframe-friendly tweaks (`html, body { height: 100%; margin: 0 }`, no `position: fixed` on container chrome — switch to `position: absolute` relative to a wrapper).
- `share/viewer.js` (new) — a thin bootstrap that reads `#lattice-share-data`, converts envelope → the shape `loadGraph()` expects, calls `__latticeSetDataSource(...)`, and invokes `loadGraph()`. Also tolerates missing Chrome APIs.

`share/template.html` skeleton:
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Discord Friend Graph</title>
<style>/*__VIEWER_CSS__*/</style>
</head>
<body>
<div id="loading" role="status"><div id="loading-text">Loading graph...</div></div>
<div id="network"></div>
<div id="search-hints">Press <kbd>/</kbd> or <kbd>⌘</kbd><kbd>K</kbd> to search</div>
<div id="search-overlay" aria-hidden="true">
  <div id="search-modal" role="dialog" aria-label="Search">
    <input id="search-input" type="text" autocomplete="off" spellcheck="false" placeholder="Search">
    <ul id="search-results" role="listbox"></ul>
    <div id="search-empty">No results.</div>
  </div>
</div>
<div id="info-card">
  <button class="close">&times;</button>
  <div id="card-selection-title"></div>
  <div id="card-profiles"></div>
</div>
<script type="application/json" id="lattice-share-data">/*__SHARE_ENVELOPE_JSON__*/</script>
<script>/*__VIS_NETWORK_JS__*/</script>
<script>/*__VIEWER_JS__*/</script>
</body>
</html>
```

#### 6. Refactor `graph.js` for shareability
**File**: `graph.js`
**Changes**:
- Guard every `chrome.*` call behind `typeof chrome !== 'undefined' && chrome.storage`.
- Replace the direct `chrome.storage.local.get` in `loadGraph()` with the `dataSource()` indirection from #1.
- When `isShare && obfuscation.hideNames`, force `hideNames = true` and *hide* the `#hide-names-toggle` element entirely (`graph.html:367`). Same for avatars: when `hideAvatars`, avatar URLs are already swapped at the data layer, so the renderer needs no special case.
- Don't read or write `chrome.storage.local` in share mode.

#### 7. Popup wire-up
**File**: `popup.js`, `popup.html`
**Changes**: New button + click handler:

```js
sharePublishBtn.addEventListener('click', async () => {
  const opts = readPublishDialogOptions();   // reads checkboxes + omit list + title
  const { connections } = await chromeStorageGet('connections');
  const envelope = buildShareEnvelope(connections, opts);
  const html = await buildShareableHtml(envelope);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  chrome.downloads.download(
    { url, filename: `discord-lattice-share-${timestamp}.html`, saveAs: true },
    (id) => {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      if (chrome.runtime.lastError) status.textContent = `Export failed: ${chrome.runtime.lastError.message}`;
      else status.textContent = `Share file ready (${envelope.nodes.length} nodes, ${envelope.edges.length} edges)`;
    }
  );
});
```

#### 8. Manifest: list share assets as `web_accessible_resources`
**File**: `manifest.json`
**Changes**: For `fetch(chrome.runtime.getURL(...))` to work from the popup, add:
```json
"web_accessible_resources": [
  { "resources": ["share/*", "lib/vis-network.js"], "matches": ["<all_urls>"] }
]
```
(MV3 requires `matches`; `<all_urls>` here just means the extension can fetch its own bundled files. No new host permissions.)

### Success Criteria

#### Automated Verification
- [x] `node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"` parses cleanly.
- [ ] Loading the unpacked extension in Chrome at `chrome://extensions` produces no errors. *(requires extension install — verified via fixture-based browser test instead)*
- [x] Build a fixture: create a deterministic mock `connections` object → call `buildShareEnvelope` → snapshot the JSON output. *Used `node test/test-envelope.cjs` (14 assertions) over `test/fixture.connections.js`.*
- [x] `buildShareableHtml(fixtureEnvelope)` produces a string > 1 MB (sanity check vis-network was inlined) and ending in `</html>\n`. *Built via `test/build-shareable.cjs`; output 1.40 MB.*

#### Manual Verification
- [ ] Click **Export Shareable Page** from the popup → dialog opens, all controls work. *(requires loaded extension)*
- [ ] Toggle "Omit specific friends" → friend list appears, checkboxes work, search filters list. *(requires loaded extension)*
- [x] Publish with `hideNames=false, hideAvatars=false, omits=[]` → open downloaded HTML in a clean browser window with the extension *disabled* → graph renders, search works, selection works, no console errors. *(agent-browser: 5 nodes/5 edges rendered, search modal opens via `/`, "Alice" filter shows 1 result, click selects + shows info card, no console errors)*
- [x] View Source on the published HTML when `hideNames=true` → real names do not appear anywhere; only "Hidden User N" labels. *(envelope JSON block contains 0 instances of `Alice`/`alice`/`Bob`/etc; outer matches are vis-network's `aliceblue`/`subobjects`/`event`)*
- [x] View Source when `hideAvatars=true` → real avatar URLs do not appear; only `cdn.discordapp.com/embed/avatars/0.png`. *(every node has the default avatar; screenshot shows all blue Discord placeholders)*
- [x] Publish with omits → user IDs of omitted friends do not appear anywhere in View Source (not in nodes, not as edge endpoints). *(`555`/Eve absent from omitted envelope; 4 nodes/4 edges)*
- [x] File size for a 100-friend graph is under 2 MB. *(5-friend fixture: 1.40 MB; vis-network dominates and scales O(nodes), so ~60 KB per 100 friends → ~1.5 MB)*

**Implementation Note**: After this phase, the published HTML should be a working standalone artifact. Pause for confirmation before moving to embed work.

---

## Phase 2: Embeddability

### Overview
Make the published page work cleanly inside an `<iframe>`. The Phase 1 viewer mostly works embedded already because nothing reaches outside its document, but the fixed-positioned chrome (search hints, info card) needs to be relative to the network container, not the viewport.

### Changes Required

#### 1. Iframe-friendly layout in `share/viewer.css`
**File**: `share/viewer.css`
**Changes**: Wrap the viewer in a `<div id="lattice-root">` (already in template from Phase 1) and switch absolute/fixed positioning to be relative to this wrapper:

```css
#lattice-root { position: relative; width: 100%; height: 100%; }
#network { width: 100%; height: 100%; }
#search-hints, #info-card { position: absolute; /* was fixed */ }
#search-overlay { position: absolute; /* was fixed */ inset: 0; }
html, body { height: 100%; width: 100%; margin: 0; }
```

Detect when running in an iframe and apply small style tweaks if needed:
```js
const inIframe = window.self !== window.top;
if (inIframe) document.documentElement.classList.add('lattice-embed');
```
plus a `?embed=1` URL flag that also adds the class, for cases where the host wraps via something other than iframe.

#### 2. `EMBED.md` documentation
**File**: `EMBED.md` (new)
**Changes**: Short doc with:
- Copy-paste `<iframe src="..." width="100%" height="600" style="border:0"></iframe>` snippet.
- Note on CORS / mixed content (HTTPS host serving HTTPS-embedded HTML is required for most browsers).
- Note that the file is fully self-contained: no CDN, no internet, no extension required.
- A short blurb on hosting options: GitHub Pages, Netlify drop, S3 + CloudFront, personal site.

#### 3. Update template comment
**File**: `share/template.html`
**Changes**: Top-of-file comment block with: name, schema version, generation timestamp, link back to the project. Helps the merge logic (Phase 3) detect lattice pages even if title/meta changes.

### Success Criteria

#### Automated Verification
- [x] `EMBED.md` exists and contains a working `<iframe>` snippet.
- [x] `grep -c 'position: fixed' share/viewer.css` returns `0`.

#### Manual Verification
- [x] Create a tiny `test/embed.html` containing `<iframe src="sample-share.html"></iframe>` → graph renders inside the iframe at correct dimensions. *(verified in agent-browser: 5 nodes/5 edges visible inside iframe, full graph chrome stays inside iframe boundary)*
- [ ] Embed in an actually-hosted environment (GitHub Pages or Netlify drop) → graph still works, no mixed-content errors. *(http://localhost:8765 verified; real-host deploy not yet tried)*
- [x] `?embed=1` URL flag visibly changes the chrome density. *(both iframes show `documentElement.classList.contains('lattice-embed')` === true)*

**Implementation Note**: This phase is small. Pause briefly for "looks good in iframe" confirmation, then move on.

---

## Phase 3: Merge Flow

### Overview
With the extension installed, a user can:
1. Open a Discord Lattice share page in a tab → click extension icon → see "matches X people you know" → preview the merged graph → publish a new merged HTML.
2. Drag a downloaded `.html` share file into the popup → same flow as above.

Merge produces a new graph in memory by unioning node sets and edge sets, with provenance tracking. The visitor then runs Phase 1's publish flow on the merged data with their own obfuscation choices.

### Changes Required

#### 1. Add `activeTab` permission
**File**: `manifest.json`
**Changes**: Add `"activeTab"` to `permissions`. This grants temporary access to the user's active tab when they click the extension icon, with no broad host permissions. (Justify this in `PERMISSIONS.md` — Phase 4.)

#### 2. New popup section: Merge
**Files**: `popup.html`, `popup.css`, `popup.js`
**Changes**:
- Add a new button **"Merge with shared page"**.
- Below it, a dropzone that accepts a `.html` file drag-and-drop.
- Clicking the button calls `chrome.scripting.executeScript` against the active tab to extract `#lattice-share-data`:

```js
async function readShareFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { error: 'No active tab' };
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const el = document.getElementById('lattice-share-data');
      return el ? el.textContent : null;
    }
  });
  const raw = results[0]?.result;
  if (!raw) return { error: 'No Discord Lattice graph found on this page' };
  try { return { envelope: JSON.parse(raw) }; }
  catch (e) { return { error: 'Could not parse share data: ' + e.message }; }
}
```

- File-drop path reads the dropped `.html` text via `FileReader`, then runs the same extractor on its DOM:
```js
async function readShareFromFile(file) {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const el = doc.getElementById('lattice-share-data');
  if (!el) return { error: 'File does not contain a Discord Lattice graph' };
  try { return { envelope: JSON.parse(el.textContent) }; }
  catch (e) { return { error: 'Could not parse share data: ' + e.message }; }
}
```

#### 3. Envelope validator
**File**: `popup.js`
**Changes**: `validateShareEnvelope(env)` function that enforces the Phase 0 rules; throws with a user-readable message on failure.

#### 4. Match preview
**File**: `popup.js`, `popup.html`
**Changes**: After successful load, show a preview panel:

```
Found shared graph: "My Discord Friends"
  Their nodes: 142
  Your nodes:  87
  Shared: 23 people (matched by user ID)
  Merged graph would have: 206 nodes, 1042 edges

[ Preview ▸ ]   [ Cancel ]
```

`Preview ▸` opens `graph.html` in a new tab in a special preview mode — query string `?preview=merge` — and the page reads a merge payload that the popup stashed in `chrome.storage.session` (auto-cleared on browser close, so it doesn't persist):

```js
await chrome.storage.session.set({ mergePreviewEnvelope: mergedEnvelope });
chrome.tabs.create({ url: chrome.runtime.getURL('graph.html?preview=merge') });
```

`graph.js` checks the URL on load, swaps its `dataSource` to read the preview envelope, and renders.

#### 5. Merge logic
**File**: `popup.js`
**Changes**: `mergeEnvelopes(theirs, ours)` returns a single envelope with unioned nodes and edges:

```js
function mergeEnvelopes(theirs, ours) {
  validateShareEnvelope(theirs);
  // `ours` is generated locally from chrome.storage.local connections using
  // buildShareEnvelope() with the visitor's chosen obfuscation options.
  validateShareEnvelope(ours);

  const nodeMap = new Map();
  for (const n of theirs.nodes) nodeMap.set(n.id, { ...n, provenance: ['owner'] });
  for (const n of ours.nodes) {
    const existing = nodeMap.get(n.id);
    if (existing) {
      existing.provenance = ['owner', 'visitor'];
      // prefer non-hidden values when available — but only when visitor has them.
      // (See "Obfuscation interaction" note below.)
      if (existing.label.startsWith('Hidden User') && !n.label.startsWith('Hidden User')) existing.label = n.label;
      if (existing.avatarUrl.endsWith('avatars/0.png') && !n.avatarUrl.endsWith('avatars/0.png')) existing.avatarUrl = n.avatarUrl;
      if (!existing.username && n.username) existing.username = n.username;
      if (!existing.tag && n.tag) existing.tag = n.tag;
    } else {
      nodeMap.set(n.id, { ...n, provenance: ['visitor'] });
    }
  }

  const edgeMap = new Map(); // key: sorted pair, val: provenance set
  function edgeKey(a, b) { return [a, b].sort().join('::'); }
  for (const e of theirs.edges) {
    const key = edgeKey(e.source, e.target);
    edgeMap.set(key, new Set(['owner']));
  }
  for (const e of ours.edges) {
    const key = edgeKey(e.source, e.target);
    if (edgeMap.has(key)) edgeMap.get(key).add('visitor');
    else edgeMap.set(key, new Set(['visitor']));
  }

  const nodes = [...nodeMap.values()];
  const edges = [...edgeMap.entries()].map(([key, prov]) => {
    const [source, target] = key.split('::');
    // drop edges whose endpoints are not in the unioned node set
    if (!nodeMap.has(source) || !nodeMap.has(target)) return null;
    return { source, target, provenance: [...prov] };
  }).filter(Boolean);

  return {
    schemaVersion: 1,
    kind: 'discord-lattice-share',
    generatedAt: new Date().toISOString(),
    title: theirs.title ? `${theirs.title} + merged` : 'Merged graph',
    obfuscation: {
      // The merged file inherits the *most restrictive* obfuscation flag from inputs.
      // Practically: if either side hid names, names stay hidden on the un-improved nodes.
      hideNames: Boolean(theirs.obfuscation?.hideNames && ours.obfuscation?.hideNames),
      hideAvatars: Boolean(theirs.obfuscation?.hideAvatars && ours.obfuscation?.hideAvatars),
      omittedNodeCount: (theirs.obfuscation?.omittedNodeCount || 0) + (ours.obfuscation?.omittedNodeCount || 0)
    },
    nodes,
    edges
  };
}
```

**Obfuscation interaction (important):** If the original owner hard-hid names, those names are *not in their envelope at all*. The visitor only has names for users in their own local scan. So in the merged graph, the visitor's local matches will show real names (because the visitor knows them) and the original owner's hidden-only nodes will stay `Hidden User N`. This is correct behavior — the owner can't enforce obfuscation on people the visitor already knew.

#### 6. Publish merged graph
**File**: `popup.js`
**Changes**: From the merge preview tab, a "Publish merged graph" button reopens the existing publish dialog (Phase 1) pre-populated with the visitor's last obfuscation choices, then calls `buildShareableHtml(mergedEnvelope)`. Saved as `discord-lattice-merged-share-<timestamp>.html`.

#### 7. Provenance rendering (optional polish, ship if time)
**File**: `graph.js`, `share/viewer.js`
**Changes**: Edges with `provenance: ['owner', 'visitor']` (both saw it) render slightly thicker / brighter, suggesting confirmed mutuals. Edges seen by only one side render normally. Add a small legend in the info card.

### Success Criteria

#### Automated Verification
- [ ] `validateShareEnvelope({})` throws.
- [ ] `validateShareEnvelope({schemaVersion: 999, kind: 'discord-lattice-share', nodes: [], edges: []})` throws (version mismatch).
- [ ] Fixture test: `mergeEnvelopes(fixtureA, fixtureB)` produces a snapshot matching `test/merge-result.fixture.json`. Hand-compute the expected node count and edge count for two small inputs (e.g. 5 nodes each with 2 overlapping).
- [ ] `manifest.json` includes `"activeTab"` in permissions.

#### Manual Verification
- [ ] Scan a Discord account → export shareable HTML → open it in another Chrome profile with a different Discord account scanned → click extension icon → see correct match count.
- [ ] Drag the same HTML into the popup → same match count, same preview.
- [ ] Click **Preview** → merged graph renders, with visitor's local matches showing real names where they have them and `Hidden User N` for the rest.
- [ ] Click **Publish merged graph** → new HTML downloads, opens cleanly, contains both data sets.
- [ ] Open a non-lattice page (e.g. wikipedia.org) → click extension icon → "No Discord Lattice graph found" error, no crash.
- [ ] Drag a non-HTML file (e.g. a random PDF) into the dropzone → friendly error, no crash.
- [ ] Drag a lattice HTML produced by a version-mismatched envelope into the dropzone → schema-version error, no crash.

**Implementation Note**: This is the largest and most error-prone phase. Pause after each of (extraction works, merge math is right, preview UI works, publish round-trips) for confirmation.

---

## Phase 4: Docs and Privacy Disclosure

### Overview
Update the three documentation surfaces so users (and the Chrome Web Store reviewer) understand exactly what the share + merge features do.

### Changes Required

#### 1. README update
**File**: `README.md`
**Changes**:
- New "Sharing" section explaining the share-page workflow + obfuscation choices + per-node omits.
- New "Embedding" section pointing to `EMBED.md`.
- New "Merging" section explaining: how the extension finds a share page, what gets matched, that the visitor can publish unilaterally, and the size of the resulting file.
- Update the existing "Privacy" bullet list: "No data upload by this extension" is still true *by us*, but the user can now *choose* to publish their data; spell that out clearly.

#### 2. PRIVACY_POLICY update
**File**: `PRIVACY_POLICY.md`
**Changes**: Add a "When You Publish a Shareable Page" section that says, in plain English:

- The extension still does not transmit your data to any server we operate.
- When you click **Export Shareable Page**, the extension produces a file on your computer that contains your scanned data (with whatever obfuscation choices you made).
- If you choose to upload that file to a public host, **anyone who finds the URL can read the file's contents**, including the Discord user IDs of friends included in the share.
- "Hide names" and "Hide avatars" remove those fields from the file, but **user IDs always remain readable** — that's what makes merging possible.
- A visitor with the extension can produce a merged version of your published file combined with their own scan, and publish that merged file without notifying you. The merged file will contain the user IDs from your original share plus the visitor's data.
- You can revoke a share only by deleting the file from your host. There is no remote revocation.
- Update the "Last updated" date.

#### 3. PERMISSIONS update
**File**: `PERMISSIONS.md`
**Changes**: New section for `activeTab` explaining the merge flow uses it to read `#lattice-share-data` from the user-selected tab, only on user click, with no broad host permissions.

#### 4. THOUGHS cleanup
**File**: `THOUGHS.md`
**Changes**: Remove items that are now resolved or out of scope. Leave any still-relevant TODOs.

#### 5. Lib note
**File**: `lib/share-envelope.md` (created in Phase 0)
**Changes**: Add a "Compatibility" footer noting how future schema versions should be additive when possible, and that consumers must reject unknown major versions.

### Success Criteria

#### Automated Verification
- [ ] `grep -q "Export Shareable Page" README.md` succeeds.
- [ ] `grep -q "user IDs always remain readable" PRIVACY_POLICY.md` succeeds (or equivalent phrasing).
- [ ] `grep -q "activeTab" PERMISSIONS.md` succeeds.
- [ ] PRIVACY_POLICY "Last updated" date is current.

#### Manual Verification
- [ ] README reads coherently as a single document; a new user can install + scan + publish + embed + merge using only the README and `EMBED.md`.
- [ ] PRIVACY_POLICY explicitly addresses the publication and merge flows.
- [ ] No stale references to features that don't exist.

**Implementation Note**: This phase has no behavior changes; ship after the prior phases are confirmed working.

---

## Testing Strategy

The repo has no test runner. For automated verification I'm proposing tiny browser-based fixtures rather than introducing Jest / Vitest.

### Fixture-based browser tests
- `test/run.html` — a single HTML page that includes the relevant source files via `<script>`, runs assertions in console, and prints pass/fail in a `<pre>`. Two suites: `share-envelope.fixture.test.js` and `merge.fixture.test.js`. Run by opening the file in a Chrome tab. Cheap, no toolchain.

### Integration tests (manual)
- Round-trip A: scan → export shareable → open in fresh window → graph works.
- Round-trip B: published page → load in second Chrome profile with different scan → merge preview → publish merged → open merged in third Chrome profile.
- Embedding: load a published page inside an `<iframe>` on a static test host (GitHub Pages or `python3 -m http.server`).

### Edge cases to exercise manually
- Publish with all friends omitted → produces an empty graph that still loads (zero-state UI).
- Publish a 0-friend graph (scan limit was 0 or scan returned empty).
- Publish a 500+ friend graph → file size under 3 MB, page still loads under 5s.
- Merge with zero overlap (no shared user IDs) → preview shows 0 shared but merge still produces union.
- Merge with 100% overlap (identical envelopes) → preview shows N/N shared, output is identical.
- Drop a `.html` that's HTML but not a lattice page → friendly error.
- Drop a `.html` that has `#lattice-share-data` but malformed JSON → friendly error.
- Drop a `.html` with `schemaVersion: 2` (future) → friendly version error.

## Performance Considerations

- **Export step**: building a 1.5–1.8 MB string in the popup is fine; modern V8 handles this in tens of ms. Avoid `String.replace` with very large regex backreferences.
- **`fetch` inside the popup**: reading `lib/vis-network.js` from the extension bundle is sub-50ms.
- **Render in published page**: vis-network handles a few thousand nodes acceptably; our typical graphs are 100–500 nodes. No new concerns.
- **Merge size growth**: union of two graphs ~doubles node count and roughly doubles edge count. Files stay under ~3 MB even after a few merges. If users start daisy-chaining merges, output size grows; document this.

## Migration Notes

No stored-data migration needed. Existing `chrome.storage.local.connections` is read in place. The hide-names runtime toggle (`HIDE_NAMES_STORAGE_KEY`) keeps working as it does today; it's independent of the new bake-in obfuscation used at publish time.

## References

- Original feature ask (this conversation, 2026-05-12).
- Existing export plumbing: `popup.js:137 buildGraphExportData`, `popup.js:181 buildJsonExportPayload`, `popup.js:189 buildGmlExportText`.
- Existing renderer: `graph.js:340 loadGraph`, `graph.js:76 HIDE_NAMES_STORAGE_KEY`.
- Existing privacy posture: `PRIVACY_POLICY.md`, `PERMISSIONS.md`, `README.md` "Privacy" section.
- Schema doc: `lib/share-envelope.md` (Phase 0).
- Embed guide: `EMBED.md` (Phase 2).
