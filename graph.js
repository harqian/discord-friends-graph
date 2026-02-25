// graph rendering - adapted from Mutuals project

const options = {
  physics: {
    enabled: true,
    barnesHut: {
      theta: 0.5,
      // Pull nodes into a tighter cluster (less repulsion + shorter springs).
      gravitationalConstant: -200,
      centralGravity: 0.5,
      springLength: 200,
      springConstant: 0.01,
      damping: 0.15,
      // Keep circular avatars from occupying the same space.
      // 0 disables collision handling; 1 uses full node size for spacing.
      avoidOverlap: 0
    },
    stabilization: {
      enabled: false,
      iterations: 1000,
      updateInterval: 50,
      fit: true
    },
    adaptiveTimestep: true
  },
  layout: {
    randomSeed: 0,
    improvedLayout: true,
    clusterThreshold: 50
  },
  nodes: {
    borderWidth: 5,
    size: 15,
    color: {
      border: '#212121',
      background: '#666666'
    },
    font: {
      color: '#dcddde',
      face: 'system-ui, sans-serif',
      size: 16,
      strokeWidth: 3,
      strokeColor: '#1a1a1a'
    },
    brokenImage: 'https://cdn.discordapp.com/embed/avatars/5.png',
    shape: 'circularImage'
  },
  edges: {
    color: { color: '#444', highlight: '#5865f2' },
    width: 1,
    chosen: false
  },
  interaction: {
    hover: true,
    tooltipDelay: 100,
    selectConnectedEdges: false
  }
};

let network = null;
let connectionsData = null;
const loadingEl = document.getElementById('loading');
const loadingTextEl = document.getElementById('loading-text');
const defaultAvatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
const searchOverlayEl = document.getElementById('search-overlay');
const searchInputEl = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');
const searchEmptyEl = document.getElementById('search-empty');
let searchIndex = [];
let searchResults = [];
let activeResultIndex = 0;

function getDisplayName(friend) {
  return friend.displayName || friend.globalName || friend.global_name || friend.username || 'Unknown User';
}

function getProfileUrl(friend) {
  return friend.profileUrl || `https://discord.com/users/${friend.id}`;
}

function normalizeId(id) {
  return String(id);
}

function formatConnectionCount(count) {
  return `${count} connection${count === 1 ? '' : 's'}`;
}

function formatServerNicknames(friend) {
  const nickEntries = Array.isArray(friend.serverNicknames) ? friend.serverNicknames : [];
  if (nickEntries.length === 0) return '';

  const uniqueNicks = [...new Set(
    nickEntries
      .map((entry) => entry?.nick)
      .filter((nick) => typeof nick === 'string' && nick.length > 0)
  )];

  if (uniqueNicks.length === 0) return '';

  const preview = uniqueNicks.slice(0, 3).join(', ');
  const extra = uniqueNicks.length - 3;
  return extra > 0 ? `Server nicknames: ${preview} +${extra} more` : `Server nicknames: ${preview}`;
}

function getNickPreview(friend) {
  const nickEntries = Array.isArray(friend.serverNicknames) ? friend.serverNicknames : [];
  const uniqueNicks = [...new Set(
    nickEntries
      .map((entry) => entry?.nick)
      .filter((nick) => typeof nick === 'string' && nick.trim().length > 0)
      .map((nick) => nick.trim())
  )];
  return uniqueNicks.slice(0, 3).join(', ');
}

function toSearchText(friend) {
  const fields = [];
  fields.push(friend.username || '');
  fields.push(friend.globalName || friend.global_name || '');
  fields.push(friend.displayName || '');
  const nickEntries = Array.isArray(friend.serverNicknames) ? friend.serverNicknames : [];
  nickEntries.forEach((entry) => {
    if (typeof entry?.nick === 'string') fields.push(entry.nick);
  });
  return fields.join(' ').toLowerCase();
}

function buildSearchIndex(connections) {
  searchIndex = Object.entries(connections).map(([id, friend]) => ({
    id: normalizeId(id),
    name: getDisplayName(friend),
    username: friend.username || '',
    nickPreview: getNickPreview(friend),
    avatarUrl: friend.avatarUrl || defaultAvatarUrl,
    searchText: toSearchText(friend)
  }));
}

function fuzzyScore(haystack, needle) {
  if (!needle) return 1;
  if (!haystack) return -1;
  if (haystack.includes(needle)) return 1000 - (haystack.indexOf(needle) * 2);

  let score = 0;
  let hPos = 0;
  let streak = 0;
  for (let i = 0; i < needle.length; i++) {
    const ch = needle[i];
    const found = haystack.indexOf(ch, hPos);
    if (found === -1) return -1;
    if (found === hPos) {
      streak += 1;
      score += 5 + streak;
    } else {
      streak = 0;
      score += 1;
    }
    hPos = found + 1;
  }
  return score;
}

function getSearchResults(query) {
  const q = query.trim().toLowerCase();
  if (!q) return searchIndex.slice(0, 30);

  return searchIndex
    .map((entry) => ({ ...entry, score: fuzzyScore(entry.searchText, q) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);
}

function renderSearchResults() {
  searchResultsEl.innerHTML = '';
  if (searchResults.length === 0) {
    searchEmptyEl.style.display = 'block';
    return;
  }
  searchEmptyEl.style.display = 'none';

  searchResults.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = `search-item${idx === activeResultIndex ? ' active' : ''}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', idx === activeResultIndex ? 'true' : 'false');
    li.dataset.id = item.id;
    const avatar = document.createElement('img');
    avatar.src = item.avatarUrl;
    avatar.alt = '';

    const textWrap = document.createElement('div');
    textWrap.className = 'search-text';

    const nameEl = document.createElement('div');
    nameEl.className = 'search-name';
    nameEl.textContent = item.name;

    const metaEl = document.createElement('div');
    metaEl.className = 'search-meta';
    metaEl.textContent = item.nickPreview || item.username || 'No nickname data';

    textWrap.appendChild(nameEl);
    textWrap.appendChild(metaEl);
    li.appendChild(avatar);
    li.appendChild(textWrap);
    li.addEventListener('mouseenter', () => {
      activeResultIndex = idx;
      renderSearchResults();
    });
    li.addEventListener('click', () => {
      selectSearchResult(item.id);
    });
    searchResultsEl.appendChild(li);
  });
}

function updateSearchResults() {
  searchResults = getSearchResults(searchInputEl.value);
  if (activeResultIndex >= searchResults.length) activeResultIndex = 0;
  renderSearchResults();
}

function openSearch() {
  if (!searchOverlayEl) return;
  searchOverlayEl.classList.add('visible');
  searchOverlayEl.setAttribute('aria-hidden', 'false');
  activeResultIndex = 0;
  updateSearchResults();
  searchInputEl.focus();
  searchInputEl.select();
}

function closeSearch() {
  if (!searchOverlayEl) return;
  searchOverlayEl.classList.remove('visible');
  searchOverlayEl.setAttribute('aria-hidden', 'true');
}

function selectSearchResult(id) {
  if (!network || !connectionsData) return;
  const normalizedId = normalizeId(id);
  closeSearch();
  network.selectNodes([normalizedId]);
  network.focus(normalizedId, {
    scale: Math.max(network.getScale(), 0.65),
    animation: { duration: 350, easingFunction: 'easeInOutQuad' }
  });
  showInfoCard(normalizedId);
}

function isSearchOpen() {
  return searchOverlayEl && searchOverlayEl.classList.contains('visible');
}

function setLoadingText(text) {
  if (loadingTextEl) loadingTextEl.textContent = text;
}

function hideLoading() {
  if (loadingEl) loadingEl.classList.add('hidden');
}

async function loadGraph() {
  try {
    const result = await chrome.storage.local.get(['connections']);
    const connections = result.connections;

    if (!connections || Object.keys(connections).length === 0) {
      setLoadingText('No data. Scan friends first.');
      return;
    }

    connectionsData = connections;
    buildSearchIndex(connections);

    const data = { nodes: [], edges: [] };
    const links = new Set();
    const ids = Object.keys(connections);
    const totalNodes = ids.length;

    // build nodes and collect edges
    for (let i = 0; i < totalNodes; i++) {
      const id = ids[i];
      const friend = connections[id];
      const displayName = getDisplayName(friend);
      const connectionCount = friend.connections.filter(
        (mutualId) => connections[normalizeId(mutualId)]
      ).length;

      data.nodes.push({
        id: id,
        image: friend.avatarUrl || defaultAvatarUrl,
        label: displayName,
        title: `${displayName} - ${formatConnectionCount(connectionCount)}`
      });

      // add edges for mutuals (dedupe by sorting ids)
      friend.connections.forEach(mutualId => {
        // only add edge if mutual is also in our friends list
        if (connections[mutualId]) {
          const edge = [normalizeId(id), normalizeId(mutualId)].sort().join('-');
          links.add(edge);
        }
      });

      if (i % 25 === 0 || i === totalNodes - 1) {
        setLoadingText(`Preparing graph data... ${i + 1}/${totalNodes} users`);
      }
    }

    // convert edge set to array
    setLoadingText(`Building edges... ${links.size} found`);
    links.forEach(link => {
      const [from, to] = link.split('-');
      data.edges.push({ from: from, to: to });
    });

    setLoadingText(`Rendering graph... ${data.nodes.length} nodes, ${data.edges.length} edges`);
    const container = document.getElementById('network');
    network = new vis.Network(container, data, options);

    const stabilizationEnabled = options.physics?.enabled && options.physics?.stabilization?.enabled;
    if (stabilizationEnabled) {
      network.on('stabilizationProgress', ({ iterations, total }) => {
        const pct = Math.max(0.1, Math.min(99.9, (iterations / total) * 100));
        setLoadingText(`Stabilizing layout... ${pct.toFixed(1)}%`);
      });

      network.once('stabilizationIterationsDone', () => {
        setLoadingText('Stabilizing layout... 100%');
        hideLoading();
      });
    } else {
      network.once('afterDrawing', () => hideLoading());
    }

    // click handler for info card
    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        showInfoCard(params.nodes[0]);
      } else {
        hideInfoCard();
      }
    });

    // Keep edge clicks from producing a selected state.
    network.on('selectEdge', () => {
      network.unselectAll();
      hideInfoCard();
    });

    network.on('hoverNode', () => {
      container.style.cursor = 'pointer';
    });

    network.on('blurNode', () => {
      container.style.cursor = 'default';
    });

    network.on('doubleClick', (params) => {
      if (params.nodes.length === 0) return;
      const friend = connectionsData[normalizeId(params.nodes[0])];
      if (!friend) return;
      window.open(getProfileUrl(friend), '_blank', 'noopener,noreferrer');
    });
  } catch (err) {
    setLoadingText(`Failed to load graph: ${err.message}`);
  }
}

function showInfoCard(nodeId) {
  const friend = connectionsData[normalizeId(nodeId)];
  if (!friend) return;

  // count how many mutuals are also in our network
  const mutualCount = friend.connections.filter(id => connectionsData[id]).length;

  document.getElementById('card-avatar').src = friend.avatarUrl || defaultAvatarUrl;
  document.getElementById('card-avatar').onerror = (e) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = defaultAvatarUrl;
  };
  document.getElementById('card-username').textContent = getDisplayName(friend);
  document.getElementById('card-tag').textContent = formatConnectionCount(mutualCount);
  document.getElementById('card-stats').textContent = formatServerNicknames(friend);
  document.getElementById('card-open').href = getProfileUrl(friend);

  document.getElementById('info-card').classList.add('visible');

  // highlight this node's connections
  highlightConnections(nodeId);
}

function hideInfoCard() {
  document.getElementById('info-card').classList.remove('visible');
  resetHighlight();
}

function highlightConnections(nodeId) {
  const normalizedNodeId = normalizeId(nodeId);
  const friend = connectionsData[normalizedNodeId];
  if (!friend) return;

  const connectedIds = new Set(friend.connections.map(normalizeId));
  connectedIds.add(normalizedNodeId);

  // dim nodes not connected
  const updates = [];
  for (const id in connectionsData) {
    if (connectedIds.has(id)) {
      updates.push({ id: id, opacity: 1.0 });
    } else {
      updates.push({ id: id, opacity: 0.15 });
    }
  }

  network.body.data.nodes.update(updates);

  // Emphasize only edges connected to the selected node.
  const edgeUpdates = [];
  const edges = network.body.data.edges.get();
  for (const edge of edges) {
    const isConnected = edge.from === normalizedNodeId || edge.to === normalizedNodeId;
    edgeUpdates.push({
      id: edge.id,
      color: isConnected ? '#5865f2' : 'rgba(68, 68, 68, 0.08)',
      width: isConnected ? 2 : 1
    });
  }
  network.body.data.edges.update(edgeUpdates);
}

function resetHighlight() {
  if (!connectionsData || !network) return;

  const updates = [];
  for (const id in connectionsData) {
    updates.push({ id: id, opacity: 1.0 });
  }
  network.body.data.nodes.update(updates);

  const edgeUpdates = [];
  const edges = network.body.data.edges.get();
  for (const edge of edges) {
    edgeUpdates.push({ id: edge.id, color: '#444', width: 1 });
  }
  network.body.data.edges.update(edgeUpdates);
}

// close button for info card
document.querySelector('#info-card .close').addEventListener('click', hideInfoCard);

// Esc clears active selection/highlight.
document.addEventListener('keydown', (event) => {
  const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
  if (isCmdK) {
    event.preventDefault();
    openSearch();
    return;
  }

  if (event.key === '/') {
    const isInputTarget = event.target instanceof HTMLElement &&
      (event.target.tagName === 'INPUT' ||
       event.target.tagName === 'TEXTAREA' ||
       event.target.isContentEditable);
    if (!isInputTarget) {
      event.preventDefault();
      openSearch();
      return;
    }
  }

  if (isSearchOpen()) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (searchResults.length > 0) {
        activeResultIndex = (activeResultIndex + 1) % searchResults.length;
        renderSearchResults();
      }
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (searchResults.length > 0) {
        activeResultIndex = (activeResultIndex - 1 + searchResults.length) % searchResults.length;
        renderSearchResults();
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (searchResults[activeResultIndex]) {
        selectSearchResult(searchResults[activeResultIndex].id);
      }
      return;
    }
  }

  if (event.key !== 'Escape') return;
  if (network) network.unselectAll();
  hideInfoCard();
});

if (searchInputEl) {
  searchInputEl.addEventListener('input', () => {
    activeResultIndex = 0;
    updateSearchResults();
  });
}

if (searchOverlayEl) {
  searchOverlayEl.addEventListener('click', (event) => {
    if (event.target === searchOverlayEl) closeSearch();
  });
}

loadGraph();
