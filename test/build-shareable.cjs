#!/usr/bin/env node
// Build a sample shareable HTML from the fixture, mimicking what
// buildShareableHtml does in the popup. Used to test the published page
// end-to-end without needing the extension loaded in Chrome.

const fs = require('fs');
const path = require('path');
const { buildShareEnvelope } = require('../lib/share-builder.js');
const connections = require('./fixture.connections.js');

const ROOT = path.resolve(__dirname, '..');
function readAsset(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function escapeHtmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJsonForScriptTag(jsonString) {
  return jsonString.replace(/</g, '\\u003c');
}

function buildShareableHtml(envelope) {
  const template = readAsset('share/template.html');
  const viewerCss = readAsset('share/viewer.css');
  const viewerJs = readAsset('share/viewer.js');
  const visNetworkJs = readAsset('lib/vis-network.js');
  const graphJs = readAsset('graph.js');

  const titleText = envelope.title ? envelope.title : 'Discord Friends Graph Share';
  const safeJson = escapeJsonForScriptTag(JSON.stringify(envelope));

  return template
    .replace('__SHARE_TITLE__', () => escapeHtmlText(titleText))
    .replace('/*__VIEWER_CSS__*/', () => viewerCss)
    .replace('/*__SHARE_ENVELOPE_JSON__*/', () => safeJson)
    .replace('/*__VIEWER_BOOTSTRAP_JS__*/', () => viewerJs)
    .replace('/*__VIS_NETWORK_JS__*/', () => visNetworkJs)
    .replace('/*__GRAPH_JS__*/', () => graphJs);
}

const args = process.argv.slice(2);
let outFile = args[0] || 'test/sample-share.html';
const opts = {
  now: '2026-05-12T10:23:00.000Z',
  title: 'Sample Share',
  hideNames: args.includes('--hide-names'),
  hideAvatars: args.includes('--hide-avatars'),
  omittedIds: args.includes('--omit-eve') ? ['555'] : []
};

const envelope = buildShareEnvelope(connections, opts);
const html = buildShareableHtml(envelope);
fs.writeFileSync(outFile, html, 'utf8');
const sizeKb = (html.length / 1024).toFixed(1);
console.log(`wrote ${outFile}`);
console.log(`  ${envelope.nodes.length} nodes, ${envelope.edges.length} edges`);
console.log(`  ${sizeKb} KB`);
console.log(`  ends in: ${JSON.stringify(html.slice(-20))}`);
