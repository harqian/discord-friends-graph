# K-means Clustering with Manual Reassignment — Implementation Plan

## Overview

Add a clustering feature to Discord Friends Graph that:

1. Runs **k-means** over the user's friend graph to assign each friend to one of *k* clusters.
2. Colors nodes by cluster and draws translucent **cluster hulls** behind them.
3. Lets the user **drag a node from one cluster to another** to override the algorithm.
4. Lets the user **highlight inter-cluster edges** ("bridges") with a toggle, since those are the structurally interesting connections.

This is a local, in-graph feature. No new backend, no new permissions, no new data leaving the device. Cluster assignments live in `chrome.storage.local`.

## Current State Analysis

The renderer is already a single file (`graph.js`) with a pluggable data source after the Phase 1 share-page refactor. The data shape is fixed: `connectionsData[userId] = { connections: [otherIds...], ... }`. vis-network is mature and gives us several useful hooks we'll lean on:

- `network.body.data.nodes` / `network.body.data.edges` — live `DataSet`s; calling `.update([...])` patches visuals without rebuilding the network.
- `network.on('dragStart' | 'dragEnd', ...)` — fires per drag of a node. `dragEnd` gives us the destination position.
- `network.on('afterDrawing', ctx)` — fires every frame with a 2D canvas context. We'll draw cluster hulls here.
- `network.getPositions([nodeIds])` — gets current `{x, y}` per node, useful both for hull drawing and for layout-based clustering if we want it.

### Key Discoveries

- `graph.js:535 network = new vis.Network(container, data, options)` is the single construction site. Cluster styling integrates into the existing edge-color machinery (`getEdgeBaseStyle` at line ~717 already merges provenance into edge colors) rather than fighting it.
- `graph.js:31–47 options.nodes` sets a global `borderWidth: 1` and `color.border: '#212121'`. Cluster color goes on **per-node border** updates, leaving the avatar image untouched.
- `graph.js:51 options.edges.width = 0.2` is the base edge width. We have headroom to widen inter-cluster edges to 2–3 without making the graph look spider-webby.
- `share/template.html` does **not** include clustering chrome. v1 ships clustering as an extension-only feature; published share pages stay clean. Future v2 can opt-in.
- vis-network's built-in `clustering` API (`network.cluster()`) does something different: it **collapses** nodes into super-nodes for performance. We are *not* using that. We're computing our own assignments and using them for **styling**.

## Desired End State

After this plan ships:

1. A **Clustering** panel in the graph view exposes: a *k* picker (1–10), an **Auto-cluster** button, an **Inter-cluster bridges** highlight toggle, and a **Reset pins** button.
2. Clicking **Auto-cluster** colors every node by its cluster and draws translucent hulls around each cluster's territory.
3. Right-clicking a node opens a "Move to cluster..." submenu. Choosing a cluster reassigns the node, pins it, and immediately re-renders.
4. Dragging a node onto a different cluster's hull does the same thing (drag-based UX for users who don't right-click).
5. Toggling **Inter-cluster bridges** dims same-cluster edges and brightens cross-cluster edges so the user can see who bridges between groups.
6. Cluster assignments + manual pins persist across reload via `chrome.storage.local`.
7. Re-running k-means respects pins: pinned nodes never move, unpinned nodes get re-assigned around the pinned constraints.

Verifiable by: running on a real friend graph, observing visually coherent groups; seeing the same coloring after a page reload; dragging a node between clusters and watching the algorithm respect that pin on the next re-run.

## What We're NOT Doing

- No **community detection** algorithms (Louvain, Leiden, label-propagation). Those are better-suited to graph data but the ask was specifically k-means.
- No **automatic *k* selection** (elbow method, silhouette score). User picks *k*.
- No clustering in published share pages or in merge previews. Extension-only.
- No **3D / force-projection layout**. The 2D vis-network layout stays.
- No edge clustering. Only nodes are clustered.
- No animation between re-cluster states (a re-cluster is a flat re-render). Nice-to-have, not in scope.
- No backend, no syncing pins across devices, no sharing pins.

## Implementation Approach

Build in four phases, each independently shippable and verifiable. The core architectural move is **separating the algorithm from the renderer**: clustering math lives in `lib/clustering.js` as pure functions that take a `connections` object and return assignments. Everything else is render glue.

Three layout principles for new code:

1. **Pure functions in `lib/`, rendering in `graph.js`.** The clustering module never touches the DOM or vis-network. Tests run in Node.
2. **Pins are the source of truth, assignments are derived.** Storage layer is `{ clusterPins, clusterK }`. Auto-assignments live in memory only; they re-derive on load.
3. **Cluster colors are deterministic from cluster index.** A palette of 10 visually distinct colors, indexed by cluster number. Same cluster → same color across re-renders.

---

## Phase 0: Clustering Primitives (pure Node module)

### Overview

Define `lib/clustering.js` with pure functions: build feature vectors, run k-means++ seeding, run Lloyd's iterations, return per-node assignments. Includes a `pins` parameter that locks assignments for specific nodes during the iterations.

### Changes Required

#### 1. The clustering module
**File**: `lib/clustering.js` (new)
**Exports** (global `DfgClustering` + CommonJS `module.exports`):

```js
buildFeatureVectors(connections)  // → { ids: [string], vectors: number[][], dim: number }
seedCentroidsPlusPlus(vectors, k, seedRng)  // → number[][] (k vectors)
assignToNearest(vectors, centroids, pinnedAssignmentsByIndex)  // → number[] assignments
updateCentroids(vectors, assignments, k)  // → number[][]
runKMeans(connections, opts)
  // opts: { k, pins: { [userId]: clusterIndex }, maxIterations: 50, seed: 0 }
  // returns: { assignments: { [userId]: clusterIndex }, iterations: number, inertia: number }
```

Feature vector choice: **L1-normalized adjacency rows**. For each node, build a length-N binary vector indicating friendships, then divide by its degree so each row sums to 1. This converts raw co-membership into a probability distribution over neighbors, which makes nodes of wildly different degrees comparable.

```
node.featureVec[i] = (1 / degree) if connected to ids[i], else 0
```

If a node has degree 0, its vector is all zeros. K-means will assign it to whichever centroid happens to be closest to the origin — surface that as "unclustered" in Phase 1.

K-means details:
- **K-means++ seeding**. Without it, two centroids can collide in low-variance graphs.
- **Lloyd's algorithm**. Max 50 iterations. Stop early when no node changes cluster.
- **Tie-breaking**: when a node is equidistant from two centroids, pick the lower-index cluster (deterministic).
- **Pinned nodes are excluded from centroid updates** as well as from reassignment. Their feature vectors influence neither the centroid math nor each other's distances. This makes pin behavior intuitive: "this node sits in cluster 3, period."
- **Deterministic by default**. The `seed` param drives a small PRNG (xorshift32 is enough). Same connections + same seed + same pins → same output.

#### 2. Tests
**File**: `test/test-clustering.cjs` (new)
**Fixtures**: A handcrafted graph with two obvious cliques + one bridge node. Assert:
- With `k=2` and no pins, the two cliques end up in different clusters and the bridge ends up with whichever clique it has more edges to.
- Pinning the bridge to a third cluster (`k=3`) leaves the cliques where they were and isolates the bridge.
- Empty input → empty assignments.
- Single-node input → single cluster.
- Disconnected node (degree 0) → still gets a cluster assignment (not undefined).
- Determinism: two runs with the same seed produce identical output.

### Success Criteria

#### Automated Verification
- [ ] `node test/test-clustering.cjs` passes all assertions.
- [ ] `lib/clustering.js` has zero references to `window`, `document`, `chrome`, or `vis`. (`grep -E "window\.|document\.|chrome\.|vis\." lib/clustering.js` returns nothing.)
- [ ] Running k-means on the existing `test/fixture.connections.js` 5-node graph terminates in under 10 iterations.

#### Manual Verification
- [ ] Read the algorithm. Confirm tie-breaking is deterministic.

---

## Phase 1: Visual Coloring + Auto-cluster Button

### Overview

Wire the algorithm into the graph view. Add a small **Clustering** panel with a `k` input and an **Auto-cluster** button. On click, run k-means, color nodes by cluster border, draw translucent cluster hulls behind the graph.

### Changes Required

#### 1. Cluster panel UI
**File**: `graph.html`
**Changes**: Add a `#cluster-controls` block stacked below `#privacy-controls`:

```html
<div id="cluster-controls">
  <label>k <input type="number" id="cluster-k" min="1" max="10" value="3"></label>
  <button id="cluster-run">Auto-cluster</button>
  <button id="cluster-reset" hidden>Reset</button>
</div>
```

CSS: stack at `top: 104px; left: 12px` (below privacy-controls), same dark-pill style.

#### 2. Cluster state + palette
**File**: `graph.js`
**Changes**: Module-level:
```js
let clusterAssignments = {};  // { userId: clusterIndex }
let clusterPins = {};         // { userId: clusterIndex }
let clusterK = 3;
const CLUSTER_PALETTE = [
  '#5865f2', '#3ba55d', '#faa61a', '#ed4245', '#eb459e',
  '#9b59b6', '#1abc9c', '#e67e22', '#16a085', '#7289da'
];
function clusterColor(idx) { return CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length]; }
```

#### 3. Auto-cluster handler
**File**: `graph.js`
**Changes**: On `#cluster-run` click:
1. `const k = clamp(parseInt(clusterKInput.value), 1, 10);`
2. `const result = DfgClustering.runKMeans(connectionsData, { k, pins: clusterPins });`
3. `clusterAssignments = result.assignments;`
4. Call `applyClusterStyling()`:
   - For each node, update `border` color to `clusterColor(assignment)`, increase `borderWidth` to `3`.
   - Trigger a redraw.

#### 4. Cluster hull rendering
**File**: `graph.js`
**Changes**: Hook `network.on('afterDrawing', drawClusterHulls)`. The handler:
1. Group node positions (`network.getPositions()`) by cluster.
2. For each cluster, compute a **convex hull** (Andrew's monotone chain — ~20 lines). For 1-node clusters, skip. For 2-node clusters, draw a thin capsule. For 3+ nodes, draw the hull.
3. Inflate the hull outward by ~25px (so it sits behind the nodes, not slicing through them).
4. Fill with `clusterColor(idx)` at 8% alpha, stroke at 25% alpha.

Performance: the hull pass runs every frame. 10 clusters × ~50 nodes/cluster is trivially fast. Skip the pass entirely when no clusters are assigned.

#### 5. Persistence
**File**: `graph.js`
**Changes**: On `Auto-cluster` success, write `{ clusterK, clusterPins }` to `chrome.storage.local`. On `loadGraph` after `connectionsData` is built, restore these and immediately run `applyClusterStyling()` using the **derived** assignments (re-run k-means with the same `k` + pins so behavior is consistent post-reload).

Don't store `clusterAssignments` itself — derive on load. (Pin storage is small. Assignment storage would be 8B × N userIDs, fine to omit.)

### Success Criteria

#### Automated Verification
- [ ] `applyClusterStyling()` doesn't touch nodes that aren't in `connectionsData`.
- [ ] Hull rendering is skipped when `Object.keys(clusterAssignments).length === 0`.
- [ ] Storage round-trip: write `{ clusterK: 4, clusterPins: { '1': 2 } }`, reload, read back.

#### Manual Verification
- [ ] Auto-cluster with k=3 on a real friend graph → three visibly distinct color regions, hulls behind them.
- [ ] Reload the graph tab → same coloring re-derives.
- [ ] Change k from 3 to 5 → click Auto-cluster → re-renders with 5 colors.

---

## Phase 2: Manual Reassignment

### Overview

Two ways to override a node's cluster: a right-click context menu and a drag-onto-hull gesture.

### Changes Required

#### 1. Right-click reassignment menu
**File**: `graph.js`
**Changes**:
- Add `network.on('oncontext', (params) => { ... })` (vis's right-click event).
- If `params.nodes.length > 0`, open a small floating menu near the click position with one button per cluster (color swatch + "Move to cluster N"), plus a **Pin to current** button and an **Unpin** button (if currently pinned).
- Clicking an option calls `setNodeCluster(nodeId, clusterIndex, { pin: true })`.

#### 2. `setNodeCluster`
**File**: `graph.js`
**Changes**: Function that:
1. Writes `clusterPins[nodeId] = clusterIndex`.
2. Re-runs k-means with the new pins.
3. Calls `applyClusterStyling()`.
4. Persists pins.

This causes the *other* nodes to potentially re-assign as the pinned node drags its cluster's centroid.

#### 3. Drag-onto-hull gesture
**File**: `graph.js`
**Changes**: Hook `network.on('dragEnd', (params) => { ... })`. In the handler:
1. If a single node was dragged, get its current `{x, y}` from `network.getPositions([id])`.
2. For each cluster, check if the point falls inside the (inflated) hull. Use a winding-number test (~10 lines).
3. If the point is inside a *different* cluster's hull than the node was assigned to, call `setNodeCluster(id, thatCluster, { pin: true })`.
4. If the point is outside all hulls, do nothing (node is "in between"); the auto-cluster will re-pull it on next run.

Edge case: dragging within your own cluster's hull is a no-op (preserves the existing "drag to reposition" behavior).

#### 4. Visual feedback during drag
**File**: `graph.js`
**Changes**: On `dragStart`, brighten all hulls (raise fill alpha from 8% to 16%) so the user sees the targets. Reset on `dragEnd`. This is purely an `afterDrawing` state flag.

#### 5. Pin indicator
**File**: `graph.js`
**Changes**: Pinned nodes get a slightly thicker border (`borderWidth: 5` vs. 3 for unpinned). Cheap visual differentiation, no new icons. Optional: a small dot in the corner.

### Success Criteria

#### Automated Verification
- [ ] After pinning node X to cluster N, `clusterPins['X'] === N` and `clusterAssignments['X'] === N`.
- [ ] Running k-means with pinned node X never changes X's assignment, regardless of seed.
- [ ] Unpinning lets X move on next re-cluster.

#### Manual Verification
- [ ] Right-click a node → menu appears at the cursor, all *k* clusters listed.
- [ ] Choosing a different cluster → node recolors immediately + nearby nodes may shift cluster as the centroid re-fits.
- [ ] Drag a node into another cluster's hull → cluster reassigns on drop.
- [ ] Pin survives page reload.
- [ ] **Reset pins** clears all pins → next Auto-cluster is pure algorithm.

---

## Phase 3: Inter-cluster Bridge Highlighting

### Overview

A toggle that flips the edge color scheme: instead of highlighting "selected node's neighbors," it highlights **edges that cross cluster boundaries**. Most graphs have a small number of bridges; making them pop reveals the connective tissue between groups.

### Changes Required

#### 1. Bridge mode toggle
**File**: `graph.html`
**Changes**: Add to `#cluster-controls`:
```html
<label><input type="checkbox" id="cluster-bridges-toggle"> Highlight bridges</label>
```

#### 2. Edge styling
**File**: `graph.js`
**Changes**: Extend `getEdgeBaseStyle(from, to)`:
- If bridge mode is on **and** `clusterAssignments[from] !== clusterAssignments[to]`:
  - Color: `#ffd166` (warm yellow, deliberately different from cluster palette and from provenance colors)
  - Width: 2.0
- Else if bridge mode is on (same cluster):
  - Color: `rgba(68, 68, 68, 0.15)` (de-emphasized)
  - Width: 0.5
- Else: fall through to existing provenance / default logic.

Toggling the mode triggers a full edge-style refresh.

#### 3. Bridge count in info card
**File**: `graph.js`
**Changes**: When a node is selected, augment `createProfileCard` with a small line: "Bridges to N other clusters" if the node has any cross-cluster edges. Cheap, lives in the existing card pipeline.

### Success Criteria

#### Automated Verification
- [ ] With bridge mode on and no clusters assigned, edge styling falls back to the default (defensive — no division by zero).
- [ ] Bridge color is applied only to edges whose endpoints have different cluster assignments.

#### Manual Verification
- [ ] Auto-cluster + toggle on → a small number of edges go yellow, the rest fade.
- [ ] Reassign a node to a new cluster → some edges flip from "same-cluster" (faded) to "bridge" (yellow) immediately.

---

## Phase 4: Polish + Documentation

### Overview

Small UX wins, documentation updates, edge cases. Ship after the previous phases are confirmed working.

### Changes Required

#### 1. Cluster size labels
**File**: `graph.js`
**Changes**: For each cluster hull, render a small "N members" label near the hull centroid. Only when clusters exist and zoom is below a threshold (so it doesn't clutter when zoomed in).

#### 2. Empty / degenerate cases
- 0 friends → cluster panel hidden.
- 1 friend → cluster panel disables Auto-cluster.
- k=1 → everyone in one cluster, hull contains the whole graph (boring but correct).
- All friends in one connected component vs. multiple — both work; k-means doesn't care about reachability.

#### 3. Settings panel grouping
**File**: `graph.html`, `share/viewer.css`
**Changes**: Group `#privacy-controls` and `#cluster-controls` into one collapsible **Settings** panel so the top-left doesn't get crowded as features grow. Hidden behind a gear icon when collapsed. Single change, applies to both controls.

#### 4. README + screenshots
**File**: `README.md`
**Changes**: New "Clustering" section explaining what auto-clustering does, what the *k* knob controls, and how to override manually.

#### 5. Lib note
**File**: `lib/clustering.js`
**Changes**: Top-of-file comment with the feature vector definition + the pin semantics so the next contributor doesn't have to re-derive it.

### Success Criteria

#### Automated Verification
- [ ] `grep -q "Clustering" README.md` succeeds.
- [ ] `lib/clustering.js` top comment exists and references "pins".

#### Manual Verification
- [ ] Empty-graph and 1-friend cases don't crash.
- [ ] Settings panel collapse/expand works.

---

## Testing Strategy

### Fixture-based Node tests
- `test/test-clustering.cjs` — algorithm correctness, determinism, pin behavior. Run with `node test/test-clustering.cjs`.

### Visual tests (manual via agent-browser)
- Build a fixture with two obvious cliques → load `graph.html` with mocked storage → run Auto-cluster k=2 → screenshot → assert visually that the cliques are in different colors.
- Run k=2 → manually drag a node across → screenshot → assert reassignment.
- Toggle bridge mode → screenshot → assert yellow on inter-cluster edges.

### Edge cases to exercise manually
- Real friend graph with 100+ nodes → clustering completes in <500ms.
- *k* > # of nodes → some clusters are empty; algorithm doesn't crash. Empty clusters get an arbitrary centroid; we drop them from hull rendering.
- Disconnected components → clustering doesn't respect them; a small isolated component may end up split across clusters (correct behavior — k-means doesn't know about reachability). Document this in the help text.

## Performance Considerations

- **Feature vectors**: O(N²) memory for the dense matrix. At N=500 that's 250K floats × 8B = 2 MB. Fine. At N=5000 it'd be 200 MB and we'd need sparse vectors; not in scope.
- **K-means iterations**: each iteration is O(N × k × dim) = O(N² × k). At N=500, k=5: 1.25M ops per iteration, sub-50ms in modern V8. Cap iterations at 50.
- **Hull rendering**: Andrew's monotone chain is O(N log N) for an N-point hull. Runs every frame; for typical graphs negligible. Cache the hull per cluster; only recompute when a node's position changes by >5px since last frame.
- **Re-cluster on every pin**: each manual override re-runs k-means. At N=500 + k=5 this is ~250ms, fine for interactive use.

## Migration Notes

No data migration. New storage keys (`clusterPins`, `clusterK`) live alongside `connections` and `graphHideNames`. Old installs without these keys read `{}` defaults; nothing breaks.

The share envelope schema does NOT change. Cluster state is local-only in v1.

## References

- Original feature ask (this conversation, 2026-05-13).
- Existing renderer: `graph.js:340 loadGraph`, `graph.js:535 new vis.Network`, `graph.js:717 getEdgeBaseStyle`.
- Existing storage pattern: `graph.js:HIDE_NAMES_STORAGE_KEY` and how it reads/writes `chrome.storage.local`.
- vis-network event/dataset docs: <https://visjs.github.io/vis-network/docs/network/>
- K-means++ seeding (Arthur & Vassilvitskii, 2007).
- Andrew's monotone chain convex hull: <https://en.wikibooks.org/wiki/Algorithm_Implementation/Geometry/Convex_hull/Monotone_chain>
