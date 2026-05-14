# Share Envelope (`shareEnvelopeV1`)

The single JSON contract that crosses every extension/published-page boundary in
Discord Friends Graph's share + merge features. Every published HTML embeds one of
these as a `<script type="application/json" id="dfg-share-data">` block.
Every consumer (the viewer in a published page, the merge flow in the popup)
parses the same shape.

If you change anything in here, bump `schemaVersion` and update the validator
in `popup.js` so older consumers reject the new format instead of misreading
it.

## Where it appears

- **Inside a published share HTML** — as the JSON payload of
  `<script type="application/json" id="dfg-share-data">`.
- **In `chrome.storage.session`** — under the key `mergePreviewEnvelope`, used
  to hand a merge result from the popup to the graph preview tab.

It is **not** stored in `chrome.storage.local`. The user's raw `connections`
record is still the canonical local data shape; envelopes are derived at
publish/merge time.

## Schema

```jsonc
{
  "schemaVersion": 1,
  "kind": "discord-friends-graph-share",
  "generatedAt": "2026-05-12T10:23:00.000Z",
  "title": "My Discord Friends",   // nullable, owner-provided, max ~80 chars
  "obfuscation": {
    "hideNames": true,             // names + usernames + tags replaced with placeholders
    "hideAvatars": false,          // real avatar URLs replaced with the default Discord avatar
    "hideProfileLinks": true,      // suppress "Open Profile" link + double-click-to-open in the viewer
    "omittedNodeCount": 3          // count only; identities of omitted nodes are NOT in the file
  },
  "nodes": [
    {
      "id": "123456789012345678", // Discord snowflake, always present, always real
      "label": "Hidden User 1",     // placeholder if hideNames; else real display name
      "avatarUrl": "https://cdn.discordapp.com/embed/avatars/0.png", // placeholder if hideAvatars
      "username": "",               // "" if hideNames; else friend.username
      "tag": "",                    // "" if hideNames; else friend.tag
      "nickPreview": "",            // "" if hideNames; serverNicknames are NEVER serialized in full
      "provenance": ["owner"]       // who saw this node: ["owner"], ["visitor"], or ["owner","visitor"]
    }
  ],
  "edges": [
    {
      "source": "123456789012345678",
      "target": "987654321098765432",
      "provenance": ["owner"]       // who saw this edge
    }
  ]
}
```

## Field semantics

### Top level

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | yes | Must be `1`. Bump when making a non-additive change. |
| `kind` | string | yes | Must be `"discord-friends-graph-share"`. Used to fingerprint Discord Friends Graph share pages during merge. |
| `generatedAt` | ISO-8601 string | yes | Wall-clock at publish time. Informational only. |
| `title` | string \| null | yes | Owner-provided title, or `null`. |
| `obfuscation` | object | yes | See below. |
| `nodes` | array | yes | See below. |
| `edges` | array | yes | See below. |

### `obfuscation`

Informational record of what the publisher chose to hide. Consumers **must not**
attempt to "un-hide" by guessing; the placeholder values are the only source of
truth in the file.

| Field | Type | Notes |
|---|---|---|
| `hideNames` | boolean | If true, `label`/`username`/`tag`/`nickPreview` are placeholders. |
| `hideAvatars` | boolean | If true, every `avatarUrl` is `https://cdn.discordapp.com/embed/avatars/0.png`. |
| `hideProfileLinks` | boolean | If true, the rendered viewer omits the "Open Profile" link and the double-click-to-open behavior. UI policy only — user IDs are still in the file and `discord.com/users/<id>` is constructable by any consumer. |
| `omittedNodeCount` | integer >= 0 | Number of nodes excluded at publish time. Identities are not included. |

### `nodes[]`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Discord snowflake. Always real, always present. This is what makes merging possible. |
| `label` | string | Display name or `Hidden User N` placeholder. Stable within a single file. |
| `avatarUrl` | string | HTTPS URL. Either the real Discord CDN URL or the default avatar URL. |
| `username` | string | Real username, or `""` when hidden. |
| `tag` | string | Discord-style tag, or `""` when hidden. |
| `nickPreview` | string | First few server nicknames joined by `, `, or `""`. Never the full nickname list. |
| `provenance` | string[] | Subset of `["owner", "visitor"]`. Used during merge to track who saw the node. |

The full `serverNicknames` array from local storage is **never** serialized
into a share envelope. Only the nick-preview line is exposed, and only when
names are not hidden.

### `edges[]`

| Field | Type | Notes |
|---|---|---|
| `source` | string | Snowflake. Must match a node `id`. |
| `target` | string | Snowflake. Must match a node `id`. |
| `provenance` | string[] | Subset of `["owner", "visitor"]`. |

Edges are undirected in semantics but stored as ordered pairs. Deduping uses
the sorted pair `[source, target].sort().join('::')` so flipped duplicates
are merged.

## Validation rules (consumers MUST enforce)

A consumer reading an envelope (the merge flow, the viewer bootstrap) must:

1. Reject the envelope if `schemaVersion !== 1` with a "version mismatch" error.
2. Reject if `kind !== "discord-friends-graph-share"`.
3. Reject if `nodes` or `edges` is not an array.
4. Drop any edge whose `source` or `target` is not present in `nodes`.
5. Drop any edge where `source === target` (self-loops are meaningless here).
6. Treat `obfuscation.hideNames`/`hideAvatars` as informational. Never attempt
   to recover hidden values from anywhere.
7. Tolerate unknown extra fields on `nodes[]` / `edges[]` (forward compatibility),
   but never require them.

The validator should throw with a user-readable message so the popup can
surface a friendly error.

## Provenance semantics

- An envelope produced by a single publisher tags every node and edge with
  `["owner"]`.
- An envelope produced by `mergeEnvelopes(theirs, ours)` tags items as:
  - `["owner"]` — only the original publisher's data has it.
  - `["visitor"]` — only the merging visitor's data has it.
  - `["owner", "visitor"]` — both sides saw it. (Confirmed mutuals.)

Provenance is for UI affordances (e.g. rendering both-sides edges thicker).
It is not authoritative or signed; a hand-edited envelope can claim anything.

## Example

```json
{
  "schemaVersion": 1,
  "kind": "discord-friends-graph-share",
  "generatedAt": "2026-05-12T10:23:00.000Z",
  "title": "demo",
  "obfuscation": { "hideNames": false, "hideAvatars": false, "omittedNodeCount": 0 },
  "nodes": [
    { "id": "111", "label": "Alice", "avatarUrl": "https://cdn.discordapp.com/avatars/111/abc.png?size=128", "username": "alice", "tag": "@alice", "nickPreview": "", "provenance": ["owner"] },
    { "id": "222", "label": "Bob",   "avatarUrl": "https://cdn.discordapp.com/avatars/222/def.png?size=128", "username": "bob",   "tag": "@bob",   "nickPreview": "", "provenance": ["owner"] }
  ],
  "edges": [
    { "source": "111", "target": "222", "provenance": ["owner"] }
  ]
}
```

## Compatibility

Future schema versions should be **additive** wherever possible. Adding a new
optional field to `nodes[]` should not require bumping `schemaVersion`.
Renaming a field, changing a field's type, or changing validation semantics
**does** require a bump.

Consumers must reject unknown **major** versions outright (`schemaVersion !==
their expected version`) rather than guessing. A new minor concept (e.g. a
new top-level optional `meta` block) can be introduced under `schemaVersion: 1`
and ignored by older consumers as long as the strict fields above keep their
exact shape.
