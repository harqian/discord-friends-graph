const scanBtn = document.getElementById('scan');
const viewBtn = document.getElementById('view');
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

function hideAll() {
  buttons.classList.add('hidden');
  confirmSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  clearInterval(progressInterval);
}

function showIdle(msg) {
  hideAll();
  buttons.classList.remove('hidden');
  if (msg) status.textContent = msg;
}

function showConfirm(count) {
  hideAll();
  confirmSection.classList.remove('hidden');
  confirmLabel.textContent = `Found ${count} friends`;
  limitInput.value = count;
  limitInput.max = count;
  limitTotal.textContent = `of ${count}`;
  status.textContent = 'How many friends to scan?';
}

function showScanning(current, total) {
  hideAll();
  progressSection.classList.remove('hidden');
  buttons.classList.add('hidden');
  stopBtn.disabled = false;
  status.textContent = 'Scanning in progress...';

  if (total) {
    const pct = Math.round((current / total) * 100);
    progressFill.style.width = pct + '%';
    progressCount.textContent = `${current} / ${total}`;
    progressLabel.textContent = `Scanning friends... ${pct}%`;
  } else {
    progressFill.style.width = '0%';
    progressCount.textContent = '0 / ?';
    progressLabel.textContent = 'Starting scan...';
  }
}

function showDone(count) {
  showIdle(`${count} friends scanned`);
  viewBtn.disabled = false;
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
  progressInterval = setInterval(() => {
    chrome.storage.local.get(['scanProgress', 'connections'], (result) => {
      if (result.scanProgress) {
        const { current, total } = result.scanProgress;
        showScanning(current, total);
      } else {
        clearInterval(progressInterval);
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
  showScanning(0, null);
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

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop' });
  progressLabel.textContent = 'Stopping...';
  stopBtn.disabled = true;
});

clearDuringBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clearData' }, () => {
    showIdle('Data cleared');
    viewBtn.disabled = true;
  });
});

viewBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('graph.html') });
});

clearBtn.addEventListener('click', () => {
  chrome.storage.local.clear(() => {
    showIdle('Data cleared');
    viewBtn.disabled = true;
  });
});
