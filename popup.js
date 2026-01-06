/**
 * TubeCreate Browser Controller - Popup Script
 */

const tokenInput = document.getElementById('token');
const copyBtn = document.getElementById('copyToken');
const refreshTokenBtn = document.getElementById('refreshToken');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const apiUrlInput = document.getElementById('apiUrl');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');

// DOM Elements
const automationControl = document.getElementById('automationControl');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const modeBadge = document.getElementById('modeBadge');
const queueInfo = document.getElementById('queueInfo');
const queueHeader = document.getElementById('queueHeader');
const queueToggle = document.getElementById('queueToggle');
const queueList = document.getElementById('queueList');
const connectWarning = document.getElementById('connectWarning');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    // Add active class
    btn.classList.add('active');
    const tabId = btn.dataset.tab; // 'automation' or 'recorder'
    document.getElementById(`${tabId}Tab`).classList.add('active');
  });
});

let queueUpdateInterval = null;
let queueExpanded = false;

// Toggle queue list
queueHeader.addEventListener('click', () => {
  queueExpanded = !queueExpanded;
  queueList.style.display = queueExpanded ? 'block' : 'none';
  queueToggle.textContent = queueExpanded ? '▲' : '▼';
});

// Load current status
async function loadStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  
  tokenInput.value = response.token || '';
  apiUrlInput.value = response.apiUrl || 'http://localhost:5295/api/v1/browser';
  
  // Force token generation if missing
  if (!response.token) {
    console.log('Token missing, refreshing...');
    const result = await chrome.runtime.sendMessage({ type: 'REFRESH_TOKEN' });
    if (result.token) {
        tokenInput.value = result.token;
    }
  }
  
  updateConnectionUI(response.isConnected);
  updateAutomationUI(response.isAutomationPaused);
  
  // Start queue polling if connected
  if (response.isConnected) {
    startQueuePolling();
  }
}

// Update execution status
async function updateExecutionStatus() {
  try {
    // Get queue info
    const queueResponse = await chrome.runtime.sendMessage({ type: 'GET_QUEUE' });
    // Get execution status  
    const execResponse = await chrome.runtime.sendMessage({ type: 'GET_EXECUTION_STATUS' });
    
    if (queueResponse.success && execResponse.success) {
      const pending = queueResponse.queueSize || 0;
      const history = execResponse.history || [];
      const current = execResponse.current;
      
      // Update header
      const total = history.length + (current ? 1 : 0) + pending;
      const completed = history.filter(h => h.status === 'success').length;
      const errors = history.filter(h => h.status === 'error').length;
      
      queueInfo.innerHTML = `
        <span style="color: #22C55E;">${completed}✅</span>
        ${errors > 0 ? `<span style="color: #EF4444;">${errors}❌</span>` : ''}
        ${current ? '<span style="color: #F59E0B;">1⏳</span>' : ''}
        ${pending > 0 ? `<span style="color: #64748B;">${pending}⏸</span>` : ''}
      `;
      
      // Build execution list
      let listHTML = '';
      
      // Show history (last 5)
      const recentHistory = history.slice(-5).reverse();
      recentHistory.forEach(item => {
        const icon = item.status === 'success' ? '✅' : '❌';
        const color = item.status === 'success' ? '#22C55E' : '#EF4444';
        const timeStr = item.time ? `${(item.time/1000).toFixed(1)}s` : '';
        listHTML += `
          <div style="display: flex; align-items: center; gap: 6px; padding: 4px; font-size: 11px; color: ${color};">
            <span style="font-size: 12px;">${icon}</span>
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.description}</span>
            <span style="color: #64748B; font-size: 10px;">${timeStr}</span>
          </div>
        `;
        if (item.error) {
          listHTML += `<div style="padding-left: 24px; font-size: 10px; color: #EF4444; opacity: 0.8;">${item.error}</div>`;
        }
      });
      
      // Show current executing
      if (current) {
        const elapsed = ((Date.now() - current.startTime) / 1000).toFixed(1);
        listHTML += `
          <div style="display: flex; align-items: center; gap: 6px; padding: 4px; font-size: 11px; color: #F59E0B; animation: pulse 1.5s ease-in-out infinite;">
            <span style="font-size: 12px;">⏳</span>
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: bold;">${current.description}</span>
            <span style="color: #64748B; font-size: 10px;">${elapsed}s...</span>
          </div>
        `;
      }
      
      // Show pending (first 3)
      const pendingCommands = queueResponse.queuePreview?.slice(current ? 1 : 0, 3) || [];
      pendingCommands.forEach(item => {
        listHTML += `
          <div style="display: flex; align-items: center; gap: 6px; padding: 4px; font-size: 11px; color: #64748B;">
            <span style="font-size: 12px;">⏸</span>
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.description || item.action}</span>
          </div>
        `;
      });
      
      if (!listHTML) {
        listHTML = '<div style="color: #64748B; font-size: 11px; text-align: center; padding: 10px;">No commands executed yet</div>';
      }
      
      queueList.innerHTML = listHTML;
    }
  } catch (e) {
    console.error('Execution status update error:', e);
  }
}

// Start polling execution status
function startQueuePolling() {
  if (queueUpdateInterval) return;
  updateExecutionStatus(); // Initial update
  queueUpdateInterval = setInterval(updateExecutionStatus, 1000); // Update every second
}

// Stop polling execution status
function stopQueuePolling() {
  if (queueUpdateInterval) {
    clearInterval(queueUpdateInterval);
    queueUpdateInterval = null;
  }
}

// Update UI based on connection state
function updateConnectionUI(isConnected) {
  if (isConnected) {
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected';
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'block';
    
    // Show automation controls when connected
    automationControl.style.display = 'block';
    connectWarning.style.display = 'none';
    startQueuePolling();
  } else {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Disconnected';
    connectBtn.style.display = 'block';
    disconnectBtn.style.display = 'none';
    
    // Hide automation controls, show warning
    automationControl.style.display = 'none';
    connectWarning.style.display = 'block';
    stopQueuePolling();
  }
}

// Update Automation UI
function updateAutomationUI(isPaused) {
    if (isPaused) {
        modeBadge.textContent = 'PAUSED';
        modeBadge.style.backgroundColor = '#F59E0B';
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'block';
    } else {
        modeBadge.textContent = 'RUNNING';
        modeBadge.style.backgroundColor = '#22C55E';
        pauseBtn.style.display = 'block';
        resumeBtn.style.display = 'none';
    }
}

// Pause Automation
pauseBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'PAUSE_AUTOMATION' });
    updateAutomationUI(true);
});

// Resume Automation
resumeBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'RESUME_AUTOMATION' });
    updateAutomationUI(false);
});

// Stop & Clear Queue
stopBtn.addEventListener('click', async () => {
    if (confirm('Stop and clear all commands?')) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE' });
        // Set to running state - ready for new batch
        updateAutomationUI(false);
        updateExecutionStatus();
    }
});

// Copy token to clipboard
copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(tokenInput.value);
  copyBtn.textContent = '✓';
  setTimeout(() => copyBtn.textContent = '📋', 1000);
});

// Refresh token - generate new one
refreshTokenBtn.addEventListener('click', async () => {
  refreshTokenBtn.textContent = '⏳';
  const result = await chrome.runtime.sendMessage({ type: 'REFRESH_TOKEN' });
  if (result.token) {
    tokenInput.value = result.token;
    refreshTokenBtn.textContent = '✓';
  } else {
    refreshTokenBtn.textContent = '❌';
  }
  setTimeout(() => refreshTokenBtn.textContent = '🔄', 1000);
});

// Update API URL
apiUrlInput.addEventListener('change', async () => {
  await chrome.runtime.sendMessage({ 
    type: 'SET_API_URL', 
    url: apiUrlInput.value 
  });
});

// Connect
connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  
  const result = await chrome.runtime.sendMessage({ type: 'CONNECT' });
  
  if (result.success) {
    updateConnectionUI(true);
    // Determine default status (usually unpaused on connect)
    updateAutomationUI(false);
  } else {
    alert('Connection failed: ' + (result.error || 'Unknown error'));
  }
  
  connectBtn.disabled = false;
  connectBtn.textContent = 'Connect';
});

// Disconnect
disconnectBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'DISCONNECT' });
  updateConnectionUI(false);
});

const recordBtn = document.getElementById('recordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const jsonOutput = document.getElementById('jsonOutput');

// --- Macro Recorder Logic ---
async function updateRecorderUI(isRecording) {
  if (isRecording) {
    recordBtn.style.display = 'none';
    stopRecordBtn.style.display = 'block';
    jsonOutput.placeholder = 'Recording... Perform actions on the page.';
  } else {
    recordBtn.style.display = 'block';
    stopRecordBtn.style.display = 'none';
  }
}

// Start Recording
recordBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
  updateRecorderUI(true);
  window.close(); // Close popup to let user interact
});

// Stop Recording
stopRecordBtn.addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  updateRecorderUI(false);
  
  if (result.commands && result.commands.length > 0) {
    jsonOutput.value = JSON.stringify(result.commands, null, 2);
  } else {
    jsonOutput.value = '[] // No actions recorded';
  }
});

// Check recording status on load
// Check recording status on load
chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
  updateRecorderUI(response.isRecording);
  if (!response.isRecording && response.commands && response.commands.length > 0) {
    jsonOutput.value = JSON.stringify(response.commands, null, 2);
  }
  
  // If recording is active, switch to Recorder tab
  if (response.isRecording) {
      // Deactivate all
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // Activate recorder
      const recBtn = document.querySelector('.tab-btn[data-tab="recorder"]');
      const recTab = document.getElementById('recorderTab');
      if (recBtn && recTab) {
          recBtn.classList.add('active');
          recTab.classList.add('active');
      }
  }
});

// Initialize
loadStatus();
