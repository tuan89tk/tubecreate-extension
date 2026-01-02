/**
 * TubeCreate Browser Controller - Background Script (Firefox)
 * Handles API communication, token management, and command routing
 * Firefox Manifest V2 compatible version
 */

// Configuration
const DEFAULT_API_URL = 'http://localhost:5295/api/v1/browser';
const POLL_INTERVAL = 1000;

// State
let token = null;
let apiUrl = DEFAULT_API_URL;
let isConnected = false;
let pollTimer = null;

// Keep-alive using alarms
browser.alarms.create('keepAlive', { periodInMinutes: 0.5 });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && isConnected) {
    console.log('[BrowserController] Keep-alive ping');
  }
});

// Generate unique token
function generateToken() {
  return 'ext-' + Math.random().toString(36).substring(2, 10);
}

// Initialize extension
async function init() {
  const stored = await browser.storage.local.get(['token', 'apiUrl', 'isConnected']);
  
  if (stored.token) {
    token = stored.token;
  } else {
    token = generateToken();
    await browser.storage.local.set({ token });
  }
  
  if (stored.apiUrl) {
    apiUrl = stored.apiUrl;
  }
  
  console.log('[BrowserController] Initialized with token:', token);
  
  if (stored.isConnected) {
    await connect();
  }
}

// Connect to API server
async function connect() {
  try {
    if (!token) {
      const stored = await browser.storage.local.get(['token']);
      if (stored.token) {
        token = stored.token;
      } else {
        token = generateToken();
        await browser.storage.local.set({ token });
      }
    }
    
    console.log('[BrowserController] Connecting with token:', token);
    
    const response = await fetch(`${apiUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        token: token,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      })
    });
    
    if (response.ok) {
      isConnected = true;
      await browser.storage.local.set({ isConnected: true });
      startPolling();
      console.log('[BrowserController] Connected to API server');
      return { success: true };
    } else {
      const error = await response.text();
      console.error('[BrowserController] Connection failed:', error);
      return { success: false, error };
    }
  } catch (error) {
    console.error('[BrowserController] Connection error:', error);
    return { success: false, error: error.message };
  }
}

// Disconnect
async function disconnect() {
  stopPolling();
  isConnected = false;
  await browser.storage.local.set({ isConnected: false });
  
  try {
    await fetch(`${apiUrl}/extensions/${token}`, { method: 'DELETE' });
  } catch (e) {}
  
  console.log('[BrowserController] Disconnected');
  return { success: true };
}

// Start polling
function startPolling() {
  if (pollTimer) return;
  
  pollTimer = setInterval(async () => {
    if (!isConnected) return;
    
    try {
      const response = await fetch(`${apiUrl}/commands/${token}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.command) {
          console.log('[BrowserController] Received command:', data.command);
          await executeCommand(data.command);
        }
      }
    } catch (error) {
      console.error('[BrowserController] Poll error:', error);
    }
  }, POLL_INTERVAL);
}

// Stop polling
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Execute command on active tab
async function executeCommand(command) {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    
    if (!tab) {
      await sendResult(command.id, { success: false, error: 'No active tab' });
      return;
    }
    
    if (tab.url?.startsWith('about:') || tab.url?.startsWith('moz-extension://')) {
      await sendResult(command.id, { success: false, error: 'Cannot run on about: pages' });
      return;
    }
    
    if (command.action === 'navigate') {
      await browser.tabs.update(tab.id, { url: command.params?.url });
      await sendResult(command.id, { success: true, result: 'Navigated' });
      return;
    }
    
    if (command.action === 'screenshot') {
      const dataUrl = await browser.tabs.captureVisibleTab(null, { format: 'png' });
      await sendResult(command.id, { success: true, result: dataUrl });
      return;
    }
    
    // Firefox uses tabs.executeScript for MV2
    try {
      await browser.tabs.executeScript(tab.id, { file: 'content.js' });
    } catch (e) {
      console.log('[BrowserController] Content script injection:', e.message);
    }
    
    await new Promise(r => setTimeout(r, 100));
    
    const result = await browser.tabs.sendMessage(tab.id, { type: 'EXECUTE', command });
    await sendResult(command.id, result);
    
  } catch (error) {
    console.error('[BrowserController] Execute error:', error);
    await sendResult(command.id, { success: false, error: error.message });
  }
}

// Send result back to API
async function sendResult(commandId, result) {
  try {
    await fetch(`${apiUrl}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        commandId,
        ...result
      })
    });
  } catch (error) {
    console.error('[BrowserController] Send result error:', error);
  }
}

// Handle messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_STATUS':
        if (!token) {
          const stored = await browser.storage.local.get(['token']);
          if (stored.token) {
            token = stored.token;
          } else {
            token = generateToken();
            await browser.storage.local.set({ token });
          }
        }
        sendResponse({ token, apiUrl, isConnected });
        break;
        
      case 'CONNECT':
        const connectResult = await connect();
        sendResponse(connectResult);
        break;
        
      case 'DISCONNECT':
        const disconnectResult = await disconnect();
        sendResponse(disconnectResult);
        break;
        
      case 'SET_API_URL':
        apiUrl = message.url;
        await browser.storage.local.set({ apiUrl });
        sendResponse({ success: true });
        break;
        
      case 'REFRESH_TOKEN':
        token = generateToken();
        await browser.storage.local.set({ token });
        console.log('[BrowserController] Token refreshed:', token);
        sendResponse({ success: true, token });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  
  return true;
});

// Initialize
init();
