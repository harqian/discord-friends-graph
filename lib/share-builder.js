// Pure helpers for building a shareEnvelopeV1 from a connections record.
// Loaded as a global-exposing script in popup.html. Also exports a CommonJS
// module so the fixture tests can require it from Node without DOM access.

(function (global) {
  const DEFAULT_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function getDisplayName(friend) {
    if (!isPlainObject(friend)) return 'Unknown User';
    if (typeof friend.displayName === 'string' && friend.displayName.trim().length > 0) return friend.displayName;
    if (typeof friend.globalName === 'string' && friend.globalName.trim().length > 0) return friend.globalName;
    if (typeof friend.global_name === 'string' && friend.global_name.trim().length > 0) return friend.global_name;
    if (typeof friend.username === 'string' && friend.username.trim().length > 0) return friend.username;
    return 'Unknown User';
  }

  function getNickPreview(friend) {
    const nickEntries = Array.isArray(friend.serverNicknames) ? friend.serverNicknames : [];
    const uniqueNicks = [...new Set(
      nickEntries
        .map((entry) => (entry && typeof entry.nick === 'string') ? entry.nick : '')
        .filter((nick) => nick.trim().length > 0)
        .map((nick) => nick.trim())
    )];
    return uniqueNicks.slice(0, 3).join(', ');
  }

  function buildShareEnvelope(connections, opts) {
    const options = isPlainObject(opts) ? opts : {};
    const hideNames = Boolean(options.hideNames);
    const hideAvatars = Boolean(options.hideAvatars);
    const title = typeof options.title === 'string' && options.title.trim().length > 0
      ? options.title.trim().slice(0, 80)
      : null;
    const omittedIds = Array.isArray(options.omittedIds) ? options.omittedIds : [];
    const omittedSet = new Set(omittedIds.map(String));
    const now = typeof options.now === 'string' ? options.now : new Date().toISOString();

    const sourceIds = Object.keys(connections || {});
    const keptIds = sourceIds.filter((id) => !omittedSet.has(String(id)));
    const idIndex = new Map();
    keptIds.forEach((id, i) => idIndex.set(String(id), i + 1));

    const nodes = keptIds.map((id) => {
      const friend = isPlainObject(connections[id]) ? connections[id] : {};
      const normalizedId = String(id);
      return {
        id: normalizedId,
        label: hideNames ? `Hidden User ${idIndex.get(normalizedId)}` : getDisplayName(friend),
        avatarUrl: hideAvatars
          ? DEFAULT_AVATAR_URL
          : (typeof friend.avatarUrl === 'string' && friend.avatarUrl ? friend.avatarUrl : DEFAULT_AVATAR_URL),
        username: hideNames ? '' : (typeof friend.username === 'string' ? friend.username : ''),
        tag: hideNames ? '' : (typeof friend.tag === 'string' ? friend.tag : ''),
        nickPreview: hideNames ? '' : getNickPreview(friend),
        provenance: ['owner']
      };
    });

    const edgeKeys = new Set();
    const edges = [];
    keptIds.forEach((id) => {
      const friend = isPlainObject(connections[id]) ? connections[id] : {};
      const connList = Array.isArray(friend.connections) ? friend.connections : [];
      const sourceId = String(id);
      connList.forEach((rawOther) => {
        const otherId = String(rawOther);
        if (!otherId || otherId === sourceId) return;
        if (omittedSet.has(otherId)) return;
        if (!connections[otherId]) return;
        const key = [sourceId, otherId].sort().join('::');
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        edges.push({ source: sourceId, target: otherId, provenance: ['owner'] });
      });
    });

    return {
      schemaVersion: 1,
      kind: 'discord-lattice-share',
      generatedAt: now,
      title,
      obfuscation: {
        hideNames,
        hideAvatars,
        omittedNodeCount: omittedSet.size
      },
      nodes,
      edges
    };
  }

  function validateShareEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') throw new Error('Envelope is not an object');
    if (envelope.schemaVersion !== 1) throw new Error('Unsupported schema version: ' + envelope.schemaVersion);
    if (envelope.kind !== 'discord-lattice-share') throw new Error('Not a Discord Lattice share envelope');
    if (!Array.isArray(envelope.nodes)) throw new Error('Envelope nodes is not an array');
    if (!Array.isArray(envelope.edges)) throw new Error('Envelope edges is not an array');
    return true;
  }

  const api = {
    DEFAULT_AVATAR_URL,
    isPlainObject,
    getDisplayName,
    getNickPreview,
    buildShareEnvelope,
    validateShareEnvelope
  };

  global.LatticeShareBuilder = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
