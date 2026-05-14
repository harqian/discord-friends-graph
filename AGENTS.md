# Discord Friends Graph — AGENTS.md

## Goal

Chrome MV3 extension that scans the user's Discord friends list, renders mutual connections as an interactive graph (vis-network), and supports exporting / embedding / merging self-contained share pages with no backend.

## Conventions

- **No build step.** What's in the repo is what Chrome runs. No bundler, transpiler, or package manager.
- **vis-network is checked in unminified** at `lib/vis-network.js` (1.43 MB). Don't replace it without reading commit `2c8451e` for the reason.
- **Pure helpers in `lib/`, rendering in `graph.js`.** `lib/share-builder.js` and `lib/clustering.js` (future) expose globals via window AND a CommonJS export so they're testable in Node without DOM.
- **`shareEnvelopeV1` is the contract.** Spec at `lib/share-envelope.md`. Bump `schemaVersion` only on non-additive changes. Adding a new optional field is additive.
- **`graph.js` is shared between the extension and the published share viewer.** It detects its context via `window.__latticeShareEnvelope` (share mode) or a `?preview=merge` URL param (merge preview). All `chrome.*` calls are guarded with feature checks because the same file runs in pages that have no `chrome` global.
- **`chrome.scripting.executeScript` uses `allFrames: true` in the merge flow** so lattice shares embedded in iframes on another site are discoverable. `activeTab` covers all frames in the active tab without needing host permissions.
- **Tests run under Node**, no test runner: `node test/test-envelope.cjs`, `node test/test-merge.cjs`. Add a `test/test-*.cjs` for each new pure module.
- **End-to-end UI checks via `agent-browser`.** Snapshot the rendered share or extension page; assert on DOM + envelope shape via `eval`.

## Preferences

- **Linked obfuscation toggles.** When the publish dialog has obfuscation checkboxes, the broader ones imply the narrower ones via UI auto-check, not via hard constraint. Specifically: checking `Hide names` also checks `Hide profile links`. The user can still uncheck the narrower one independently. **Why:** users often want safety defaults but want to override on case-by-case. **How to apply:** if you add another related toggle (e.g. "Hide servers"), wire the same one-way auto-check from `Hide names` → it.

- **No automatic detection of share pages on tab visit.** Merge is button-initiated (`Merge with shared page` → `Read active tab`), never a popup notification or auto-prompt. **Why:** the user wants explicit control. **How to apply:** don't add background-page or content-script auto-detection.

- **Em dashes are banned everywhere** (global rule, repeated for emphasis since it's hard to remember in flowery copy). Use a comma, colon, parens, or period.

## Plans

- `plans/2026-05-12-shareable-mergeable-graphs.md` — Phases 0–4, all completed. Sharing, embedding, merging.
- `plans/2026-05-13-kmeans-clustering.md` — drafted, on hold. **Open question:** Louvain may be a better fit than k-means for graph data; revisit before implementing.

## Open follow-ups (deferred)

- **Multi-file merge.** Drop in N share files, union all of them plus local. Provenance becomes a set, not just owner/visitor. Mentioned 2026-05-13.
- **In-popup merge instructions.** A `?` icon expanding into a 4-line how-to next to the merge button. The help text under the merge button got a small update but the inline `?` is still TODO. Mentioned 2026-05-13.
- **Copy JSON button.** The share-viewer toolbar has Download HTML + Copy embed code + Open in new tab. A fourth "Copy envelope JSON" button is a power-user nice-to-have that wasn't shipped. Mentioned 2026-05-13.

## Privacy posture

- The extension itself never transmits data to any server we operate.
- Discord **user IDs are always in published share envelopes** even when names/avatars/profile-links are hidden — they're required for merge to work. The privacy policy spells this out.
- `Hide profile links` is **UI policy, not data hiding.** A determined viewer can reconstruct `discord.com/users/<id>` from any envelope.
