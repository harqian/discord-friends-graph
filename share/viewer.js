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
    if (envelope.kind !== 'discord-lattice-share') {
      throw new Error('Not a Discord Lattice share file.');
    }
    if (!Array.isArray(envelope.nodes) || !Array.isArray(envelope.edges)) {
      throw new Error('Share data is missing nodes or edges.');
    }
  }

  try {
    const el = document.getElementById('lattice-share-data');
    if (!el) throw new Error('No share data block found.');
    const envelope = JSON.parse(el.textContent);
    validate(envelope);
    window.__latticeShareEnvelope = envelope;

    if (envelope.title) {
      try { document.title = envelope.title + ' — Discord Lattice'; } catch (_) {}
    }

    const inIframe = window.self !== window.top;
    const urlParams = new URLSearchParams(window.location.search || '');
    if (inIframe || urlParams.get('embed') === '1') {
      document.documentElement.classList.add('lattice-embed');
    }
  } catch (e) {
    showError('Failed to load share: ' + (e && e.message ? e.message : String(e)));
    window.__latticeShareEnvelope = null;
  }
})();
