const scanBtn = document.getElementById('scan');
const viewBtn = document.getElementById('view');
const clearBtn = document.getElementById('clear');
const status = document.getElementById('status');
const progressSection = document.getElementById('progress-section');
const progressLabel = document.getElementById('progress-label');
const progressFill = document.getElementById('progress-bar-fill');
const progressCount = document.getElementById('progress-count');
const buttons = document.getElementById('buttons');

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

function showIdle() {
  progressSection.classList.add('hidden');
  buttons.classList.remove('hidden');
}

function showDone(count) {
  showIdle();
  status.textContent = `${count} friends scanned`;
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

let progressInterval = null;

function startProgressPolling() {
  progressInterval = setInterval(() => {
    chrome.storage.local.get(['scanProgress', 'connections'], (result) => {
      if (result.scanProgress) {
        const { current, total } = result.scanProgress;
        showScanning(current, total);
      } else {
        clearInterval(progressInterval);
        if (result.connections) {
          showDone(Object.keys(result.connections).length);
        } else {
          showIdle();
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
      showIdle();
      status.textContent = 'Error: Refresh Discord and try again';
      clearInterval(progressInterval);
      return;
    }

    if (response?.error) {
      showIdle();
      status.textContent = `Error: ${response.error}`;
      clearInterval(progressInterval);
    }
  });
});

viewBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('graph.html') });
});

clearBtn.addEventListener('click', () => {
  chrome.storage.local.clear(() => {
    showIdle();
    status.textContent = 'Data cleared';
    viewBtn.disabled = true;
  });
});
