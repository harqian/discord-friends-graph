// background service worker - handles token extraction and API calls

let scanCancelled = false;

// try to get token from discord's page context using multiple methods
async function extractToken(tabId) {
  // discord tokens are long base64ish strings, usually 70+ chars
  function looksLikeToken(t) {
    return typeof t === 'string' && t.length > 30 && !t.includes(' ');
  }

  // method 1: localStorage
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const raw = localStorage.getItem('token');
          if (raw) return raw.replace(/"/g, '');
        } catch(e) {}
        return null;
      }
    });
    const val = results[0]?.result;
    if (val && looksLikeToken(val)) {
      console.log('[bg] token from localStorage, length:', val.length);
      return val;
    }
    console.log('[bg] localStorage returned:', val ? `"${val.slice(0,10)}..." (${val.length} chars)` : 'null');
  } catch(e) {
    console.log('[bg] localStorage method failed:', e.message);
  }

  // method 2: webpack chunk introspection
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          if (typeof webpackChunkdiscord_app === 'undefined') return null;

          // skip i18n proxy objects that have getToken as a message key
          function isRealTokenModule(obj) {
            if (!obj || typeof obj.getToken !== 'function') return false;
            const tag = obj[Symbol.toStringTag];
            if (tag === 'IntlMessagesProxy' || tag === 'Proxy') return false;
            // real token is a long base64 string with dots
            try {
              const t = obj.getToken();
              return typeof t === 'string' && t.length > 30;
            } catch { return false; }
          }

          let token = null;
          const modules = [];
          webpackChunkdiscord_app.push([['__lattice__'], {}, o => {
            for (let c in o.c) modules.push(o.c[c]);
          }]);
          webpackChunkdiscord_app.pop();

          for (let e of modules) {
            try {
              if (!e.exports || e.exports === window) continue;
              if (isRealTokenModule(e.exports)) {
                token = e.exports.getToken();
                break;
              }
              if (isRealTokenModule(e.exports?.default)) {
                token = e.exports.default.getToken();
                break;
              }
              for (let key in e.exports) {
                if (isRealTokenModule(e.exports[key])) {
                  token = e.exports[key].getToken();
                  break;
                }
              }
              if (token) break;
            } catch {}
          }
          return token;
        } catch(e) {
          return null;
        }
      }
    });
    if (results[0]?.result) {
      console.log('[bg] token from webpack, length:', results[0].result.length);
      return results[0].result;
    }
  } catch(e) {
    console.log('[bg] webpack method failed:', e.message);
  }

  // method 3: look for token in document cookie or other storage
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          // some builds store in sessionStorage
          const session = sessionStorage.getItem('token');
          if (session) return session.replace(/"/g, '');
        } catch(e) {}
        return null;
      }
    });
    if (results[0]?.result) {
      console.log('[bg] token from sessionStorage, length:', results[0].result.length);
      return results[0].result;
    }
  } catch(e) {
    console.log('[bg] sessionStorage method failed:', e.message);
  }

  return null;
}

// fetch discord API from background context (bypasses CORS)
async function discordFetch(url, token) {
  const res = await fetch(url, {
    headers: { authorization: token }
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// just get friend count + cache the token/list for immediate scan
let cachedToken = null;
let cachedFriends = null;

async function getFriendCount(tabId) {
  const token = await extractToken(tabId);
  if (!token) return { error: 'Could not extract token. Make sure you are logged into Discord.' };

  try {
    const relationships = await discordFetch(
      'https://discord.com/api/v9/users/@me/relationships', token
    );
    const friends = relationships.filter(r => r.type === 1);
    // cache so scan doesn't re-fetch
    cachedToken = token;
    cachedFriends = friends;
    return { count: friends.length };
  } catch(e) {
    return { error: e.message };
  }
}

// scan friends and their mutual connections
async function scanFriends(tabId, limit) {
  scanCancelled = false;

  // use cached data from count step if available, otherwise fetch fresh
  let token = cachedToken;
  let friends = cachedFriends;
  cachedToken = null;
  cachedFriends = null;

  if (!token) {
    token = await extractToken(tabId);
    if (!token) {
      return { error: 'Could not extract token. Make sure you are logged into Discord.' };
    }
  }

  try {
    if (!friends) {
      const relationships = await discordFetch(
        'https://discord.com/api/v9/users/@me/relationships', token
      );
      friends = relationships.filter(r => r.type === 1);
    }

    // apply limit
    const total = friends.length;
    if (limit && limit < friends.length) {
      friends = friends.slice(0, limit);
    }
    console.log('[bg] scanning', friends.length, 'of', total, 'friends');

    const data = {};

    for (let i = 0; i < friends.length; i++) {
      if (scanCancelled) {
        console.log('[bg] scan cancelled at', i, '/', friends.length);
        // save partial results
        if (Object.keys(data).length > 0) {
          await chrome.storage.local.set({ connections: data, scanProgress: null });
        } else {
          await chrome.storage.local.set({ scanProgress: null });
        }
        return { cancelled: true, partial: Object.keys(data).length };
      }

      const friend = friends[i];
      const avatarUrl = friend.user.avatar
        ? `https://cdn.discordapp.com/avatars/${friend.user.id}/${friend.user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${(parseInt(friend.user.id) >> 22) % 6}.png`;

      data[friend.user.id] = {
        username: friend.user.username,
        avatarUrl,
        id: friend.user.id,
        connections: []
      };

      // get mutual friends for this user
      try {
        const mutuals = await discordFetch(
          `https://discord.com/api/v9/users/${friend.user.id}/relationships`, token
        );
        data[friend.user.id].connections = mutuals.map(m => m.id);
      } catch(e) {
        console.log('[bg] mutuals failed for', friend.user.username, e.message);
      }

      await chrome.storage.local.set({
        scanProgress: { current: i + 1, total: friends.length }
      });

      // rate limit - 1 req/sec
      if (i < friends.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // save results, clear progress
    await chrome.storage.local.set({ connections: data, scanProgress: null });
    return { data };
  } catch(e) {
    console.log('[bg] scan error:', e.message);
    return { error: e.message };
  }
}

// handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'count') {
    chrome.tabs.query({ url: 'https://discord.com/*' }).then(tabs => {
      if (tabs.length === 0) {
        sendResponse({ error: 'Open Discord first' });
        return;
      }
      getFriendCount(tabs[0].id).then(sendResponse);
    });
    return true;
  }

  if (request.action === 'scan') {
    chrome.tabs.query({ url: 'https://discord.com/*' }).then(tabs => {
      if (tabs.length === 0) {
        sendResponse({ error: 'Open Discord first' });
        return;
      }
      scanFriends(tabs[0].id, request.limit).then(sendResponse);
    });
    return true;
  }

  if (request.action === 'stop') {
    scanCancelled = true;
    sendResponse({ ok: true });
  }

  if (request.action === 'clearData') {
    scanCancelled = true;
    chrome.storage.local.clear(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
