const scanBtn = document.getElementById('scan');
const viewBtn = document.getElementById('view');
const clearBtn = document.getElementById('clear');
const stopBtn = document.getElementById('stop');
const clearDuringBtn = document.getElementById('clear-during-scan');
const status = document.getElementById('status');
const progressSection = document.getElementById('progress-section');
const progressLabel = document.getElementById('progress-label');
const progressFill = document.getElementById('progress-bar-fill');
const progressCount = document.getElementById('progress-count');
const buttons = document.getElementById('buttons');

let progressInterval = null;

function showScanning(current, total) {
  progressSection.classList.remove('hidden');
  buttons.classList.add('hidden');
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

function showIdle(msg) {
  progressSection.classList.add('hidden');
  buttons.classList.remove('hidden');
  clearInterval(progressInterval);
  if (msg) status.textContent = msg;
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

scanBtn.addEventListener('click', () => {
  showScanning(0, null);
  startProgressPolling();

  chrome.runtime.sendMessage({ action: 'scan' }, (response) => {
    if (chrome.runtime.lastError) {
      showIdle('Error: Refresh Discord and try again');
      return;
    }
    if (response?.error) {
      showIdle(`Error: ${response.error}`);
    }
    if (response?.cancelled) {
      // partial data saved by background, polling will pick it up
    }
  });
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
