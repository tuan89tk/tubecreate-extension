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

// Load current status
async function loadStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  
  tokenInput.value = response.token || '';
  apiUrlInput.value = response.apiUrl || 'http://localhost:5295/api/v1/browser';
  
  updateConnectionUI(response.isConnected);
}

// Update UI based on connection state
function updateConnectionUI(isConnected) {
  if (isConnected) {
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected';
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'block';
  } else {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Disconnected';
    connectBtn.style.display = 'block';
    disconnectBtn.style.display = 'none';
  }
}

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
const stopBtn = document.getElementById('stopBtn');
const jsonOutput = document.getElementById('jsonOutput');

// --- Macro Recorder Logic ---
async function updateRecorderUI(isRecording) {
  if (isRecording) {
    recordBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    jsonOutput.placeholder = 'Recording... Perform actions on the page.';
  } else {
    recordBtn.style.display = 'block';
    stopBtn.style.display = 'none';
  }
}

// Start Recording
recordBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'START_RECORDING' });
  updateRecorderUI(true);
  window.close(); // Close popup to let user interact
});

// Stop Recording
stopBtn.addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  updateRecorderUI(false);
  
  if (result.commands && result.commands.length > 0) {
    jsonOutput.value = JSON.stringify(result.commands, null, 2);
  } else {
    jsonOutput.value = '[] // No actions recorded';
  }
});

// Check recording status on load
chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
  updateRecorderUI(response.isRecording);
  if (!response.isRecording && response.commands && response.commands.length > 0) {
    jsonOutput.value = JSON.stringify(response.commands, null, 2);
  }
});

// Initialize
loadStatus();
