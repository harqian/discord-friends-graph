(function () {
  function showError(message) {
    const loading = document.getElementById('loading');
    const text = document.getElementById('loading-text');
    if (text) text.textContent = message;
    if (loading) loading.classList.remove('hidden');
  }

  function validate(envelope) {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error('Share data is not a JSON object.');
    }
    if (envelope.schemaVersion !== 1) {
      throw new Error('Unsupported share schema version: ' + envelope.schemaVersion);
    }
    if (envelope.kind !== 'discord-friends-graph-share') {
      throw new Error('Not a Discord Friends Graph share file.');
    }
    if (!Array.isArray(envelope.nodes) || !Array.isArray(envelope.edges)) {
      throw new Error('Share data is missing nodes or edges.');
    }
  }

  function showToast(text) {
    const toast = document.getElementById('dfg-toolbar-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('visible'), 1800);
  }

  async function downloadHtml() {
    const url = window.location.href;
    const filenameFromUrl = (() => {
      try {
        const u = new URL(url);
        const last = u.pathname.split('/').filter(Boolean).pop();
        if (last && /\.html?$/i.test(last)) return last;
      } catch (_) {}
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      return `discord-friends-graph-share-${ts}.html`;
    })();

    let blob;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error('fetch failed');
      blob = await res.blob();
    } catch (_) {
      // Fallback: reconstruct from current DOM. Loses byte-fidelity but functional.
      const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
      blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    }

    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filenameFromUrl;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(objUrl);
      a.remove();
    }, 1000);
    showToast('Download started');
  }

  async function copyEmbedCode() {
    const url = window.location.href;
    const snippet = `<iframe src="${url}" width="100%" height="600" style="border:0" title="Discord Friends Graph" loading="lazy"></iframe>`;
    try {
      await navigator.clipboard.writeText(snippet);
      showToast('Embed code copied');
    } catch (_) {
      // Fallback for older / iframe-restricted contexts
      const ta = document.createElement('textarea');
      ta.value = snippet;
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showToast('Embed code copied'); }
      catch (_) { showToast('Copy failed'); }
      ta.remove();
    }
  }

  function openFull() {
    try {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    } catch (_) {
      showToast('Open failed');
    }
  }

  function wireToolbar() {
    const inIframe = window.self !== window.top;
    const openBtn = document.getElementById('dfg-btn-open');
    const downloadBtn = document.getElementById('dfg-btn-download');
    const copyBtn = document.getElementById('dfg-btn-copy');
    if (openBtn) {
      if (inIframe) openBtn.removeAttribute('hidden');
      openBtn.addEventListener('click', openFull);
    }
    if (downloadBtn) downloadBtn.addEventListener('click', downloadHtml);
    if (copyBtn) copyBtn.addEventListener('click', copyEmbedCode);
  }

  try {
    const el = document.getElementById('dfg-share-data');
    if (!el) throw new Error('No share data block found.');
    const envelope = JSON.parse(el.textContent);
    validate(envelope);
    window.__dfgShareEnvelope = envelope;

    if (envelope.title) {
      try { document.title = envelope.title + ' — Discord Friends Graph'; } catch (_) {}
    }

    const inIframe = window.self !== window.top;
    const urlParams = new URLSearchParams(window.location.search || '');
    if (inIframe || urlParams.get('embed') === '1') {
      document.documentElement.classList.add('dfg-embed');
    }

    wireToolbar();
  } catch (e) {
    showError('Failed to load share: ' + (e && e.message ? e.message : String(e)));
    window.__dfgShareEnvelope = null;
  }
})();
