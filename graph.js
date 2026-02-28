// graph rendering - adapted from Mutuals project

const options = {
  physics: {
    enabled: true,
    barnesHut: {
      theta: 0.5,
      // Pull nodes into a tighter cluster (less repulsion + shorter springs).
      gravitationalConstant: -500,
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
    borderWidth: 1,
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
    // Fallback image loaded directly by the page; this does not require a CDN host permission.
    brokenImage: 'https://cdn.discordapp.com/embed/avatars/5.png',
    shape: 'circularImage'
  },
  edges: {
    color: { color: '#444', highlight: '#5865f2' },
    width: 0.2,
    chosen: false,
    smooth: true
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
let selectedNodeIds = [];
let hideNames = false;
const HIDE_NAMES_STORAGE_KEY = 'graphHideNames';
const hideNamesToggleEl = document.getElementById('hide-names-toggle');

function getDisplayName(friend) {
  return friend.displayName || friend.globalName || friend.global_name || friend.username || 'Unknown User';
}

function getMaskedName() {
  return 'Hidden User';
}

function getMaskedMeta() {
  return 'Names hidden';
}

function getNodeLabel(friend) {
  return hideNames ? '' : getDisplayName(friend);
}

function getNodeTitle(friend) {
  const connectionCount = getNetworkMutualCount(friend);
  if (hideNames) return formatConnectionCount(connectionCount);
  return `${getDisplayName(friend)} - ${formatConnectionCount(connectionCount)}`;
}

function getSearchResultName(item) {
  return hideNames ? getMaskedName() : item.name;
}

function getSearchResultMeta(item) {
  if (hideNames) return getMaskedMeta();
  return item.nickPreview || item.username || 'No nickname data';
}

function getProfileName(friend) {
  return hideNames ? getMaskedName() : getDisplayName(friend);
}

function getProfileTag(friend) {
  return hideNames ? '' : (friend.tag || '');
}

function getProfileStats(friend) {
  const mutualCount = getNetworkMutualCount(friend);
  if (hideNames) return formatConnectionCount(mutualCount);
  const nickLine = formatServerNicknames(friend);
  return nickLine
    ? `${formatConnectionCount(mutualCount)} | ${nickLine}`
    : formatConnectionCount(mutualCount);
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

function getMutualServers(friend) {
  if (Array.isArray(friend.mutualServers) && friend.mutualServers.length > 0) {
    return friend.mutualServers
      .filter((server) => server && server.guildId)
      .map((server) => ({
        guildId: normalizeId(server.guildId),
        name: typeof server.name === 'string' && server.name.trim().length > 0 ? server.name.trim() : '',
        nick: typeof server.nick === 'string' && server.nick.trim().length > 0 ? server.nick.trim() : ''
      }));
  }

  const nickEntries = Array.isArray(friend.serverNicknames) ? friend.serverNicknames : [];
  return nickEntries
    .filter((entry) => entry && entry.guildId)
    .map((entry) => ({
      guildId: normalizeId(entry.guildId),
      name: '',
      nick: typeof entry.nick === 'string' && entry.nick.trim().length > 0 ? entry.nick.trim() : ''
    }));
}

function formatMutualServerLabel(server) {
  if (!server) return '';
  if (hideNames) return 'Mutual server';
  if (server.name && server.nick) return `${server.name} (${server.nick})`;
  if (server.name) return server.name;
  if (server.nick) return server.nick;
  return 'Unknown server';
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
  getMutualServers(friend).forEach((server) => {
    if (server.name) fields.push(server.name);
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
    nameEl.textContent = getSearchResultName(item);

    const metaEl = document.createElement('div');
    metaEl.className = 'search-meta';
    metaEl.textContent = getSearchResultMeta(item);

    textWrap.appendChild(nameEl);
    textWrap.appendChild(metaEl);
    li.appendChild(avatar);
    li.appendChild(textWrap);
    li.addEventListener('click', () => {
      activeResultIndex = idx;
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
  addSelection(normalizedId, true);
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
    const result = await chrome.storage.local.get(['connections', HIDE_NAMES_STORAGE_KEY]);
    const connections = result.connections;
    hideNames = Boolean(result[HIDE_NAMES_STORAGE_KEY]);
    if (hideNamesToggleEl) hideNamesToggleEl.checked = hideNames;

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

      data.nodes.push({
        id: id,
        image: friend.avatarUrl || defaultAvatarUrl,
        label: getNodeLabel(friend),
        title: getNodeTitle(friend)
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
        addSelection(params.nodes[0], false, true);
      } else {
        clearSelections();
      }
    });

    // Keep edge clicks from producing a selected state.
    network.on('selectEdge', () => {
      network.unselectAll();
      if (selectedNodeIds.length > 0) network.selectNodes(selectedNodeIds, false);
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

function getNetworkMutualCount(friend) {
  const ids = Array.isArray(friend.connections) ? friend.connections : [];
  return ids.filter((id) => connectionsData[normalizeId(id)]).length;
}

function createProfileCard(friend) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card-profile';

  const header = document.createElement('div');
  header.className = 'card-profile-header';

  const avatar = document.createElement('img');
  avatar.className = 'card-profile-avatar';
  avatar.src = friend.avatarUrl || defaultAvatarUrl;
  avatar.alt = '';
  avatar.onerror = (e) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = defaultAvatarUrl;
  };

  const nameWrap = document.createElement('div');
  nameWrap.className = 'card-profile-name-wrap';

  const nameEl = document.createElement('div');
  nameEl.className = 'card-profile-name';
  nameEl.textContent = getProfileName(friend);

  const tagEl = document.createElement('div');
  tagEl.className = 'card-profile-tag';
  tagEl.textContent = getProfileTag(friend);

  nameWrap.appendChild(nameEl);
  nameWrap.appendChild(tagEl);
  header.appendChild(avatar);
  header.appendChild(nameWrap);

  const statsEl = document.createElement('div');
  statsEl.className = 'card-profile-stats';
  statsEl.textContent = getProfileStats(friend);

  const openEl = document.createElement('a');
  openEl.className = 'open-profile';
  openEl.href = getProfileUrl(friend);
  openEl.target = '_blank';
  openEl.rel = 'noopener noreferrer';
  openEl.textContent = 'Open Profile';

  const mutualServers = getMutualServers(friend);

  wrapper.appendChild(header);
  wrapper.appendChild(statsEl);
  if (mutualServers.length > 0) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'card-profile-section';

    const sectionTitleEl = document.createElement('div');
    sectionTitleEl.className = 'card-profile-section-title';
    sectionTitleEl.textContent = `Mutual servers (${mutualServers.length})`;

    const listEl = document.createElement('div');
    listEl.className = 'card-profile-server-list';

    mutualServers.slice(0, 6).forEach((server) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'card-profile-server-item';
      itemEl.textContent = formatMutualServerLabel(server);
      listEl.appendChild(itemEl);
    });

    if (mutualServers.length > 6) {
      const moreEl = document.createElement('div');
      moreEl.className = 'card-profile-server-more';
      moreEl.textContent = `+${mutualServers.length - 6} more`;
      listEl.appendChild(moreEl);
    }

    sectionEl.appendChild(sectionTitleEl);
    sectionEl.appendChild(listEl);
    wrapper.appendChild(sectionEl);
  }
  wrapper.appendChild(openEl);
  return wrapper;
}

function showInfoCard(nodeIds) {
  const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
  const normalizedIds = ids.map(normalizeId).filter((id) => connectionsData[id]);
  if (normalizedIds.length === 0) return;

  const titleEl = document.getElementById('card-selection-title');
  const profilesEl = document.getElementById('card-profiles');

  titleEl.textContent = `${normalizedIds.length} selected`;
  profilesEl.innerHTML = '';

  normalizedIds.forEach((id) => {
    const friend = connectionsData[id];
    if (!friend) return;
    profilesEl.appendChild(createProfileCard(friend));
  });

  document.getElementById('info-card').classList.add('visible');
}

function hideInfoCard() {
  document.getElementById('info-card').classList.remove('visible');
}

function getFriendConnectionSet(nodeId) {
  const friend = connectionsData[normalizeId(nodeId)];
  if (!friend) return new Set();
  const ids = Array.isArray(friend.connections) ? friend.connections : [];
  const set = new Set();
  ids.forEach((id) => {
    const normalizedId = normalizeId(id);
    if (connectionsData[normalizedId]) set.add(normalizedId);
  });
  return set;
}

function getSharedMutuals(nodeIds) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return new Set();
  let shared = null;

  nodeIds.forEach((nodeId) => {
    const current = getFriendConnectionSet(nodeId);
    if (shared === null) {
      shared = current;
      return;
    }
    shared = new Set([...shared].filter((id) => current.has(id)));
  });

  return shared || new Set();
}

function highlightConnections() {
  if (!connectionsData || !network) return;

  const selectedSet = new Set(selectedNodeIds.map(normalizeId));
  const sharedMutuals = getSharedMutuals(selectedNodeIds);
  const visibleSet = new Set([...selectedSet, ...sharedMutuals]);

  const updates = [];
  for (const id in connectionsData) {
    updates.push({ id: id, opacity: visibleSet.has(id) ? 1.0 : 0.12 });
  }
  network.body.data.nodes.update(updates);

  const edgeUpdates = [];
  const edges = network.body.data.edges.get();
  for (const edge of edges) {
    const keepEdge = visibleSet.has(edge.from) && visibleSet.has(edge.to);
    edgeUpdates.push({
      id: edge.id,
      color: keepEdge ? '#5865f2' : 'rgba(68, 68, 68, 0.08)',
      width: keepEdge ? 2 : 1
    });
  }
  network.body.data.edges.update(edgeUpdates);
}

function renderSelections() {
  if (!network) return;

  if (selectedNodeIds.length === 0) {
    network.unselectAll();
    hideInfoCard();
    resetHighlight();
    return;
  }

  network.selectNodes(selectedNodeIds, false);
  highlightConnections();
  showInfoCard(selectedNodeIds);
}

function addSelection(nodeId, shouldFocus = false, toggleIfExists = false) {
  const normalizedNodeId = normalizeId(nodeId);
  if (!connectionsData[normalizedNodeId]) return;

  const existingIndex = selectedNodeIds.indexOf(normalizedNodeId);
  if (existingIndex >= 0) {
    if (toggleIfExists) {
      selectedNodeIds.splice(existingIndex, 1);
      renderSelections();
      return;
    }
    selectedNodeIds.splice(existingIndex, 1);
  }
  selectedNodeIds.push(normalizedNodeId);

  if (shouldFocus && network) {
    network.focus(normalizedNodeId, {
      scale: Math.max(network.getScale(), 0.65),
      animation: { duration: 350, easingFunction: 'easeInOutQuad' }
    });
  }

  renderSelections();
}

function popSelection() {
  if (selectedNodeIds.length === 0) return false;
  selectedNodeIds.pop();
  renderSelections();
  return true;
}

function clearSelections() {
  if (selectedNodeIds.length === 0) {
    hideInfoCard();
    resetHighlight();
    if (network) network.unselectAll();
    return;
  }
  selectedNodeIds = [];
  renderSelections();
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

function refreshGraphNameVisibility() {
  if (hideNamesToggleEl) hideNamesToggleEl.checked = hideNames;

  if (network && connectionsData) {
    const updates = Object.entries(connectionsData).map(([id, friend]) => ({
      id,
      label: getNodeLabel(friend),
      title: getNodeTitle(friend)
    }));
    network.body.data.nodes.update(updates);
  }

  if (searchResultsEl) renderSearchResults();
  if (selectedNodeIds.length > 0) showInfoCard(selectedNodeIds);
}

async function setHideNames(nextValue) {
  hideNames = Boolean(nextValue);
  refreshGraphNameVisibility();
  await chrome.storage.local.set({ [HIDE_NAMES_STORAGE_KEY]: hideNames });
}

// close button for info card
document.querySelector('#info-card .close').addEventListener('click', clearSelections);

if (hideNamesToggleEl) {
  hideNamesToggleEl.addEventListener('change', (event) => {
    setHideNames(event.target.checked);
  });
}

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
  event.preventDefault();
  if (popSelection()) return;
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
