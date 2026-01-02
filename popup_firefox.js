/**
 * TubeCreate Browser Controller - Popup Script (Firefox)
 * Uses browser.* API instead of chrome.*
 */

const tokenInput = document.getElementById('token');
const copyBtn = document.getElementById('copyToken');
const refreshTokenBtn = document.getElementById('refreshToken');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const apiUrlInput = document.getElementById('apiUrl');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');

// Use browser API with Promise-based approach
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Load current status
async function loadStatus() {
  const response = await browserAPI.runtime.sendMessage({ type: 'GET_STATUS' });
  
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

// Refresh token
refreshTokenBtn.addEventListener('click', async () => {
  refreshTokenBtn.textContent = '⏳';
  const result = await browserAPI.runtime.sendMessage({ type: 'REFRESH_TOKEN' });
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
  await browserAPI.runtime.sendMessage({ 
    type: 'SET_API_URL', 
    url: apiUrlInput.value 
  });
});

// Connect
connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  
  const result = await browserAPI.runtime.sendMessage({ type: 'CONNECT' });
  
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
  await browserAPI.runtime.sendMessage({ type: 'DISCONNECT' });
  updateConnectionUI(false);
});

// Initialize
loadStatus();
