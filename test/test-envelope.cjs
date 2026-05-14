#!/usr/bin/env node
// Fixture tests for buildShareEnvelope. Run: node test/test-envelope.cjs
const assert = require('assert');
const { buildShareEnvelope, validateShareEnvelope } = require('../lib/share-builder.js');
const connections = require('./fixture.connections.js');

const FIXED_NOW = '2026-05-12T10:23:00.000Z';
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

console.log('buildShareEnvelope');

test('produces 5 nodes and 5 unique edges with no obfuscation', () => {
  const env = buildShareEnvelope(connections, { now: FIXED_NOW });
  validateShareEnvelope(env);
  assert.strictEqual(env.nodes.length, 5);
  // expected edges: 111-222, 111-333, 222-333, 333-444, 444-555 = 5
  assert.strictEqual(env.edges.length, 5);
  const keys = env.edges.map((e) => [e.source, e.target].sort().join('::')).sort();
  assert.deepStrictEqual(keys, ['111::222', '111::333', '222::333', '333::444', '444::555']);
});

test('every node has provenance ["owner"]', () => {
  const env = buildShareEnvelope(connections, { now: FIXED_NOW });
  for (const n of env.nodes) {
    assert.deepStrictEqual(n.provenance, ['owner']);
  }
});

test('real names appear when hideNames is false', () => {
  const env = buildShareEnvelope(connections, { now: FIXED_NOW });
  const alice = env.nodes.find((n) => n.id === '111');
  assert.strictEqual(alice.label, 'Alice');
  assert.strictEqual(alice.username, 'alice');
  assert.ok(alice.avatarUrl.startsWith('https://cdn.discordapp.com/avatars/'));
});

test('hideNames replaces labels with placeholders and blanks username/tag/nickPreview', () => {
  const env = buildShareEnvelope(connections, { now: FIXED_NOW, hideNames: true });
  for (const n of env.nodes) {
    assert.ok(n.label.startsWith('Hidden User '), `expected placeholder label, got ${n.label}`);
    assert.strictEqual(n.username, '');
    assert.strictEqual(n.tag, '');
    assert.strictEqual(n.nickPreview, '');
  }
  const serialized = JSON.stringify(env);
  assert.ok(!serialized.includes('alice'), 'serialized envelope must not contain real usernames');
  assert.ok(!serialized.includes('Alice'), 'serialized envelope must not contain real display names');
});

test('hideAvatars replaces every avatarUrl with the default', () => {
  const env = buildShareEnvelope(connections, { now: FIXED_NOW, hideAvatars: true });
  for (const n of env.nodes) {
    assert.strictEqual(n.avatarUrl, 'https://cdn.discordapp.com/embed/avatars/0.png');
  }
  const serialized = JSON.stringify(env);
  assert.ok(!serialized.includes('avatars/111/avatar.png'), 'real avatar URL leaked');
});

test('omittedIds drops nodes AND any edge touching them', () => {
  const env = buildShareEnvelope(connections, { now: FIXED_NOW, omittedIds: ['333'] });
  assert.strictEqual(env.nodes.length, 4);
  assert.strictEqual(env.obfuscation.omittedNodeCount, 1);
  assert.ok(!env.nodes.some((n) => n.id === '333'));
  // edges that touch 333 dropped: 111-333, 222-333, 333-444 — leaving 111-222 and 444-555
  assert.strictEqual(env.edges.length, 2);
  assert.ok(!env.edges.some((e) => e.source === '333' || e.target === '333'));
  const serialized = JSON.stringify(env);
  assert.ok(!serialized.includes('"333"'), 'omitted id leaked in serialized envelope');
  assert.ok(!serialized.includes('Carol'), 'omitted display name leaked');
});

test('combined hideNames + hideAvatars + omit', () => {
  const env = buildShareEnvelope(connections, {
    now: FIXED_NOW,
    hideNames: true,
    hideAvatars: true,
    omittedIds: ['555']
  });
  assert.strictEqual(env.nodes.length, 4);
  assert.strictEqual(env.obfuscation.hideNames, true);
  assert.strictEqual(env.obfuscation.hideAvatars, true);
  assert.strictEqual(env.obfuscation.omittedNodeCount, 1);
  for (const n of env.nodes) {
    assert.ok(n.label.startsWith('Hidden User '));
    assert.strictEqual(n.avatarUrl, 'https://cdn.discordapp.com/embed/avatars/0.png');
  }
});

test('title is truncated to 80 chars and trimmed', () => {
  const long = ' '.repeat(5) + 'x'.repeat(200);
  const env = buildShareEnvelope(connections, { now: FIXED_NOW, title: long });
  assert.strictEqual(env.title.length, 80);
});

test('title null when blank', () => {
  const env = buildShareEnvelope(connections, { now: FIXED_NOW, title: '   ' });
  assert.strictEqual(env.title, null);
});

test('hideProfileLinks defaults to false', () => {
  const env = buildShareEnvelope(connections, { now: FIXED_NOW });
  assert.strictEqual(env.obfuscation.hideProfileLinks, false);
});

test('hideProfileLinks: true is captured in obfuscation', () => {
  const env = buildShareEnvelope(connections, { now: FIXED_NOW, hideProfileLinks: true });
  assert.strictEqual(env.obfuscation.hideProfileLinks, true);
  // Note: profile URLs aren't in the envelope at all (they're computed from id at render time).
  // The flag is interpreted by the renderer, not stamped into nodes.
});

test('empty connections produces an empty but valid envelope', () => {
  const env = buildShareEnvelope({}, { now: FIXED_NOW });
  validateShareEnvelope(env);
  assert.strictEqual(env.nodes.length, 0);
  assert.strictEqual(env.edges.length, 0);
});

test('edges referencing absent friends are dropped', () => {
  const partial = {
    '111': { ...connections['111'] },
    // 222 referenced by 111.connections but not present
  };
  partial['111'].connections = ['222', '333'];
  const env = buildShareEnvelope(partial, { now: FIXED_NOW });
  assert.strictEqual(env.nodes.length, 1);
  assert.strictEqual(env.edges.length, 0);
});

test('validateShareEnvelope rejects wrong schemaVersion', () => {
  assert.throws(() => validateShareEnvelope({ schemaVersion: 2, kind: 'discord-friends-graph-share', nodes: [], edges: [] }));
});

test('validateShareEnvelope rejects wrong kind', () => {
  assert.throws(() => validateShareEnvelope({ schemaVersion: 1, kind: 'something-else', nodes: [], edges: [] }));
});

test('validateShareEnvelope rejects missing nodes/edges', () => {
  assert.throws(() => validateShareEnvelope({ schemaVersion: 1, kind: 'discord-friends-graph-share', edges: [] }));
  assert.throws(() => validateShareEnvelope({ schemaVersion: 1, kind: 'discord-friends-graph-share', nodes: [] }));
});

console.log(`\n${passed} tests passed`);
