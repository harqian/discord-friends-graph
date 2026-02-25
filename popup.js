const scanBtn = document.getElementById('scan');
const viewBtn = document.getElementById('view');
const exportBtn = document.getElementById('export');
const clearBtn = document.getElementById('clear');
const stopBtn = document.getElementById('stop');
const clearDuringBtn = document.getElementById('clear-during-scan');
const startScanBtn = document.getElementById('start-scan');
const cancelConfirmBtn = document.getElementById('cancel-confirm');
const limitInput = document.getElementById('limit-input');
const limitTotal = document.getElementById('limit-total');
const confirmSection = document.getElementById('confirm-section');
const confirmLabel = document.getElementById('confirm-label');
const status = document.getElementById('status');
const progressSection = document.getElementById('progress-section');
const progressLabel = document.getElementById('progress-label');
const progressFill = document.getElementById('progress-bar-fill');
const progressCount = document.getElementById('progress-count');
const buttons = document.getElementById('buttons');

let progressInterval = null;
const APPROX_SECONDS_PER_FRIEND = 1.25;

function formatDuration(seconds) {
  const clamped = Math.max(0, Math.round(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function getEstimatedSeconds(total) {
  return total * APPROX_SECONDS_PER_FRIEND;
}

function stopProgressPolling() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function hideAll() {
  buttons.classList.add('hidden');
  confirmSection.classList.add('hidden');
  progressSection.classList.add('hidden');
}

function showIdle(msg) {
  stopProgressPolling();
  hideAll();
  buttons.classList.remove('hidden');
  if (msg) status.textContent = msg;
}

function showConfirm(count) {
  stopProgressPolling();
  hideAll();
  confirmSection.classList.remove('hidden');
  confirmLabel.textContent = `Found ${count} friends`;
  limitInput.value = count;
  limitInput.max = count;
  limitTotal.textContent = `of ${count}`;
  const estimate = formatDuration(getEstimatedSeconds(count));
  status.textContent = `How many friends to scan? Approx: ${estimate}`;
}

function showScanning(current, total) {
  hideAll();
  progressSection.classList.remove('hidden');
  buttons.classList.add('hidden');
  stopBtn.disabled = false;
  status.textContent = 'Scanning in progress...';

  if (total) {
    const pct = Math.round((current / total) * 100);
    const remainingEstimate = formatDuration(
      getEstimatedSeconds(Math.max(total - current, 0))
    );
    const totalEstimate = formatDuration(getEstimatedSeconds(total));
    progressFill.style.width = pct + '%';
    progressCount.textContent = `${current} / ${total}`;
    progressLabel.textContent = `Scanning friends... ${pct}% (~${remainingEstimate} left, ~${totalEstimate} total)`;
  } else {
    progressFill.style.width = '0%';
    progressCount.textContent = '0 / ?';
    progressLabel.textContent = 'Starting scan...';
  }
}

function showDone(count) {
  showIdle(`${count} friends scanned`);
  viewBtn.disabled = false;
  exportBtn.disabled = false;
}

// restore state on popup open
chrome.storage.local.get(['connections', 'scanProgress'], (result) => {
  if (result.scanProgress) {
    const { current, total } = result.scanProgress;
    showScanning(current, total);
    startProgressPolling();
  } else if (result.connections && Object.keys(result.connections).length > 0) {
    showDone(Object.keys(result.connections).length);
  }
});

function startProgressPolling() {
  stopProgressPolling();
  progressInterval = setInterval(() => {
    chrome.storage.local.get(['scanProgress', 'connections'], (result) => {
      if (result.scanProgress) {
        const { current, total } = result.scanProgress;
        showScanning(current, total);
      } else {
        stopProgressPolling();
        if (result.connections && Object.keys(result.connections).length > 0) {
          showDone(Object.keys(result.connections).length);
        } else {
          showIdle('Open Discord to scan your friends network');
        }
      }
    });
  }, 500);
}

// step 1: user clicks scan, we fetch count
scanBtn.addEventListener('click', () => {
  scanBtn.disabled = true;
  status.textContent = 'Checking friends list...';

  chrome.runtime.sendMessage({ action: 'count' }, (response) => {
    scanBtn.disabled = false;
    if (chrome.runtime.lastError) {
      status.textContent = 'Error: Refresh Discord and try again';
      return;
    }
    if (response?.error) {
      status.textContent = `Error: ${response.error}`;
      return;
    }
    showConfirm(response.count);
  });
});

// step 2: user picks limit and starts
startScanBtn.addEventListener('click', () => {
  const limit = parseInt(limitInput.value) || parseInt(limitInput.max);
  showScanning(0, limit);
  startProgressPolling();

  chrome.runtime.sendMessage({ action: 'scan', limit }, (response) => {
    if (chrome.runtime.lastError) {
      showIdle('Error: Refresh Discord and try again');
      return;
    }
    if (response?.error) {
      showIdle(`Error: ${response.error}`);
    }
  });
});

cancelConfirmBtn.addEventListener('click', () => {
  showIdle('Open Discord to scan your friends network');
});

limitInput.addEventListener('input', () => {
  const max = parseInt(limitInput.max);
  let selected = parseInt(limitInput.value);
  if (Number.isNaN(selected) || selected < 1) selected = 1;
  if (max && selected > max) selected = max;
  const estimate = formatDuration(getEstimatedSeconds(selected));
  status.textContent = `How many friends to scan? Approx: ${estimate}`;
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop' });
  progressLabel.textContent = 'Stopping...';
  stopBtn.disabled = true;
});

clearDuringBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clearData' }, () => {
    showIdle('Data cleared');
    viewBtn.disabled = true;
    exportBtn.disabled = true;
  });
});

viewBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('graph.html') });
});

clearBtn.addEventListener('click', () => {
  chrome.storage.local.clear(() => {
    showIdle('Data cleared');
    viewBtn.disabled = true;
    exportBtn.disabled = true;
  });
});

exportBtn.addEventListener('click', () => {
  exportBtn.disabled = true;
  status.textContent = 'Preparing export...';

  chrome.storage.local.get(['connections'], (result) => {
    const connections = result.connections;
    if (!connections || Object.keys(connections).length === 0) {
      status.textContent = 'No data to export';
      exportBtn.disabled = true;
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      totalUsers: Object.keys(connections).length,
      connections
    };

    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(payload, null, 2)
    )}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `discord-lattice-export-${timestamp}.json`;

    chrome.downloads.download(
      { url: dataUrl, filename, saveAs: true },
      (downloadId) => {
        if (chrome.runtime.lastError || !downloadId) {
          status.textContent = `Export failed: ${chrome.runtime.lastError?.message || 'Unknown error'}`;
        } else {
          status.textContent = 'Export started';
        }
        exportBtn.disabled = false;
      }
    );
  });
});
