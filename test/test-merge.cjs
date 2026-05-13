#!/usr/bin/env node
// Fixture tests for mergeEnvelopes + summarizeMatch.
// Run: node test/test-merge.cjs
const assert = require('assert');
const {
  buildShareEnvelope,
  mergeEnvelopes,
  validateShareEnvelope,
  summarizeMatch
} = require('../lib/share-builder.js');

const NOW = '2026-05-12T10:23:00.000Z';
let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${e.message}`);
    process.exitCode = 1;
  }
}

// owner has 4 friends: a, b, c, d with edges a-b, b-c, c-d
const ownerConnections = {
  '1': { username: 'a', displayName: 'A', avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png?size=128', id: '1', connections: ['2'], serverNicknames: [], mutualServers: [] },
  '2': { username: 'b', displayName: 'B', avatarUrl: 'https://cdn.discordapp.com/avatars/2/b.png?size=128', id: '2', connections: ['1', '3'], serverNicknames: [], mutualServers: [] },
  '3': { username: 'c', displayName: 'C', avatarUrl: 'https://cdn.discordapp.com/avatars/3/c.png?size=128', id: '3', connections: ['2', '4'], serverNicknames: [], mutualServers: [] },
  '4': { username: 'd', displayName: 'D', avatarUrl: 'https://cdn.discordapp.com/avatars/4/d.png?size=128', id: '4', connections: ['3'], serverNicknames: [], mutualServers: [] }
};

// visitor has 4 friends: c, d, e, f (overlap with owner on c, d)
// edges: c-d, c-e, e-f
const visitorConnections = {
  '3': { username: 'c-v', displayName: 'CarolV', avatarUrl: 'https://cdn.discordapp.com/avatars/3/cv.png?size=128', id: '3', connections: ['4', '5'], serverNicknames: [], mutualServers: [] },
  '4': { username: 'd-v', displayName: 'DaveV', avatarUrl: 'https://cdn.discordapp.com/avatars/4/dv.png?size=128', id: '4', connections: ['3'], serverNicknames: [], mutualServers: [] },
  '5': { username: 'e', displayName: 'E', avatarUrl: 'https://cdn.discordapp.com/avatars/5/e.png?size=128', id: '5', connections: ['3', '6'], serverNicknames: [], mutualServers: [] },
  '6': { username: 'f', displayName: 'F', avatarUrl: 'https://cdn.discordapp.com/avatars/6/f.png?size=128', id: '6', connections: ['5'], serverNicknames: [], mutualServers: [] }
};

const theirs = buildShareEnvelope(ownerConnections, { now: NOW, title: 'Owner share' });
const ours = buildShareEnvelope(visitorConnections, { now: NOW, title: 'Visitor share' });

test('owner envelope: 4 nodes, 3 edges (a-b, b-c, c-d)', () => {
  assert.strictEqual(theirs.nodes.length, 4);
  assert.strictEqual(theirs.edges.length, 3);
});

test('visitor envelope: 4 nodes, 3 edges (c-d, c-e, e-f)', () => {
  assert.strictEqual(ours.nodes.length, 4);
  assert.strictEqual(ours.edges.length, 3);
});

test('summarizeMatch: 4/4, 2 shared (3 and 4)', () => {
  const s = summarizeMatch(theirs, ours);
  assert.strictEqual(s.theirNodeCount, 4);
  assert.strictEqual(s.ourNodeCount, 4);
  assert.strictEqual(s.sharedNodeCount, 2);
  assert.strictEqual(s.onlyTheirs, 2);
  assert.strictEqual(s.onlyOurs, 2);
});

test('mergeEnvelopes: union has 6 nodes, 5 unique edges, 1 shared edge', () => {
  const merged = mergeEnvelopes(theirs, ours, { now: NOW });
  validateShareEnvelope(merged);
  // unique nodes: 1, 2, 3, 4, 5, 6 = 6
  assert.strictEqual(merged.nodes.length, 6);
  // unique edges: 1-2 (owner), 2-3 (owner), 3-4 (both!), 3-5 (visitor), 5-6 (visitor) = 5
  assert.strictEqual(merged.edges.length, 5);
  const both = merged.edges.filter((e) => e.provenance.length === 2);
  assert.strictEqual(both.length, 1);
  assert.deepStrictEqual([both[0].source, both[0].target].sort(), ['3', '4']);
});

test('mergeEnvelopes: provenance is correct per node', () => {
  const merged = mergeEnvelopes(theirs, ours, { now: NOW });
  const provById = Object.fromEntries(merged.nodes.map((n) => [n.id, n.provenance.sort()]));
  assert.deepStrictEqual(provById['1'], ['owner']);
  assert.deepStrictEqual(provById['2'], ['owner']);
  assert.deepStrictEqual(provById['3'], ['owner', 'visitor']);
  assert.deepStrictEqual(provById['4'], ['owner', 'visitor']);
  assert.deepStrictEqual(provById['5'], ['visitor']);
  assert.deepStrictEqual(provById['6'], ['visitor']);
});

test('mergeEnvelopes: shared node keeps owner label when both have real names', () => {
  const merged = mergeEnvelopes(theirs, ours, { now: NOW });
  // node '3' is "C" in owner and "CarolV" in visitor. Owner first, so label stays "C"
  // (we only override when owner has a placeholder).
  const three = merged.nodes.find((n) => n.id === '3');
  assert.strictEqual(three.label, 'C');
});

test('mergeEnvelopes: visitor reveals identity when owner hid it', () => {
  // theirs is hide-names, ours has real names. Shared node gets the visitor's real label.
  const hiddenTheirs = buildShareEnvelope(ownerConnections, { now: NOW, hideNames: true });
  const merged = mergeEnvelopes(hiddenTheirs, ours, { now: NOW });
  // node 3 starts with placeholder from owner, visitor has 'CarolV' -> should be 'CarolV'
  const three = merged.nodes.find((n) => n.id === '3');
  assert.strictEqual(three.label, 'CarolV');
  // node 1 is owner-only and still hidden
  const one = merged.nodes.find((n) => n.id === '1');
  assert.ok(/^Hidden User /.test(one.label));
});

test('mergeEnvelopes: hide flags AND-combined (most permissive wins)', () => {
  const ht = buildShareEnvelope(ownerConnections, { now: NOW, hideNames: true });
  const ho = buildShareEnvelope(visitorConnections, { now: NOW, hideNames: true });
  const both = mergeEnvelopes(ht, ho, { now: NOW });
  assert.strictEqual(both.obfuscation.hideNames, true);

  const mixed = mergeEnvelopes(ht, ours, { now: NOW });
  // visitor has real names so the merged file isn't strictly "names hidden"
  assert.strictEqual(mixed.obfuscation.hideNames, false);
});

test('mergeEnvelopes: omittedNodeCount sums', () => {
  const ot = buildShareEnvelope(ownerConnections, { now: NOW, omittedIds: ['4'] });
  const oo = buildShareEnvelope(visitorConnections, { now: NOW, omittedIds: ['6'] });
  const m = mergeEnvelopes(ot, oo, { now: NOW });
  assert.strictEqual(m.obfuscation.omittedNodeCount, 2);
});

test('mergeEnvelopes: zero overlap still works', () => {
  const isolated = {
    '99': { username: 'z', displayName: 'Z', avatarUrl: 'https://cdn.discordapp.com/avatars/99/z.png?size=128', id: '99', connections: [], serverNicknames: [], mutualServers: [] }
  };
  const lonely = buildShareEnvelope(isolated, { now: NOW });
  const m = mergeEnvelopes(theirs, lonely, { now: NOW });
  assert.strictEqual(m.nodes.length, 5);
  // all 99 edges in lonely: 0; owner edges: 3
  assert.strictEqual(m.edges.length, 3);
});

test('mergeEnvelopes: identical envelopes produce identical-shape output', () => {
  const m = mergeEnvelopes(theirs, theirs, { now: NOW });
  assert.strictEqual(m.nodes.length, theirs.nodes.length);
  assert.strictEqual(m.edges.length, theirs.edges.length);
  m.nodes.forEach((n) => assert.deepStrictEqual(n.provenance.sort(), ['owner', 'visitor']));
  m.edges.forEach((e) => assert.deepStrictEqual(e.provenance.sort(), ['owner', 'visitor']));
});

test('mergeEnvelopes: rejects malformed input', () => {
  assert.throws(() => mergeEnvelopes({}, ours));
  assert.throws(() => mergeEnvelopes(theirs, { schemaVersion: 2, kind: 'discord-lattice-share', nodes: [], edges: [] }));
});

test('mergeEnvelopes: merged title combines both titles', () => {
  const m = mergeEnvelopes(theirs, ours, { now: NOW });
  assert.strictEqual(m.title, 'Owner share + Visitor share');
});

console.log(`\n${passed} tests passed`);
