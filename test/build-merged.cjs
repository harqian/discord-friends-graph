#!/usr/bin/env node
// Build a sample merged share by combining two fixture envelopes.
// Used for e2e visual testing of provenance rendering.
const fs = require('fs');
const path = require('path');
const { buildShareEnvelope, mergeEnvelopes } = require('../lib/share-builder.js');

const ROOT = path.resolve(__dirname, '..');
function readAsset(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function escapeHtmlText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeJsonForScriptTag(jsonString) { return jsonString.replace(/</g, '\\u003c'); }

function buildHtml(envelope) {
  const template = readAsset('share/template.html');
  return template
    .replace('__SHARE_TITLE__', () => escapeHtmlText(envelope.title || 'Discord Friends Graph Share'))
    .replace('/*__VIEWER_CSS__*/', () => readAsset('share/viewer.css'))
    .replace('/*__SHARE_ENVELOPE_JSON__*/', () => escapeJsonForScriptTag(JSON.stringify(envelope)))
    .replace('/*__VIEWER_BOOTSTRAP_JS__*/', () => readAsset('share/viewer.js'))
    .replace('/*__VIS_NETWORK_JS__*/', () => readAsset('lib/vis-network.js'))
    .replace('/*__GRAPH_JS__*/', () => readAsset('graph.js'));
}

const NOW = '2026-05-12T10:23:00.000Z';

const ownerConnections = {
  '1': { username: 'a', displayName: 'A', avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png?size=128', id: '1', connections: ['2'], serverNicknames: [], mutualServers: [] },
  '2': { username: 'b', displayName: 'B', avatarUrl: 'https://cdn.discordapp.com/avatars/2/b.png?size=128', id: '2', connections: ['1', '3'], serverNicknames: [], mutualServers: [] },
  '3': { username: 'c', displayName: 'C', avatarUrl: 'https://cdn.discordapp.com/avatars/3/c.png?size=128', id: '3', connections: ['2', '4'], serverNicknames: [], mutualServers: [] },
  '4': { username: 'd', displayName: 'D', avatarUrl: 'https://cdn.discordapp.com/avatars/4/d.png?size=128', id: '4', connections: ['3'], serverNicknames: [], mutualServers: [] }
};

const visitorConnections = {
  '3': { username: 'c', displayName: 'C', avatarUrl: 'https://cdn.discordapp.com/avatars/3/c.png?size=128', id: '3', connections: ['4', '5'], serverNicknames: [], mutualServers: [] },
  '4': { username: 'd', displayName: 'D', avatarUrl: 'https://cdn.discordapp.com/avatars/4/d.png?size=128', id: '4', connections: ['3'], serverNicknames: [], mutualServers: [] },
  '5': { username: 'e', displayName: 'E', avatarUrl: 'https://cdn.discordapp.com/avatars/5/e.png?size=128', id: '5', connections: ['3', '6'], serverNicknames: [], mutualServers: [] },
  '6': { username: 'f', displayName: 'F', avatarUrl: 'https://cdn.discordapp.com/avatars/6/f.png?size=128', id: '6', connections: ['5'], serverNicknames: [], mutualServers: [] }
};

const theirs = buildShareEnvelope(ownerConnections, { now: NOW, title: 'Owner' });
const ours = buildShareEnvelope(visitorConnections, { now: NOW, title: 'Visitor' });
const merged = mergeEnvelopes(theirs, ours, { now: NOW });

const outFile = process.argv[2] || 'test/sample-merged.html';
fs.writeFileSync(outFile, buildHtml(merged), 'utf8');
const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`wrote ${outFile}`);
console.log(`  ${merged.nodes.length} nodes, ${merged.edges.length} edges (${sizeKb} KB)`);
console.log('  edge provenance breakdown:');
const byProv = {};
for (const e of merged.edges) {
  const key = e.provenance.slice().sort().join(',');
  byProv[key] = (byProv[key] || 0) + 1;
}
for (const k of Object.keys(byProv)) console.log(`    [${k}]: ${byProv[k]}`);
