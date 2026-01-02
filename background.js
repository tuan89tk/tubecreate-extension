/**
 * TubeCreate Browser Controller - Background Script
 * Handles API communication, token management, and command routing
 */

// Configuration
const DEFAULT_API_URL = 'http://localhost:5295/api/v1/browser';
const POLL_INTERVAL = 1000; // 1 second

// State
let token = null;
let apiUrl = DEFAULT_API_URL;
let isConnected = false;
let pollTimer = null;

// Keep-alive using Chrome alarms (prevents service worker from stopping)
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive' && isConnected) {
    console.log('[BrowserController] Keep-alive ping');
  }
});

// Generate unique token
function generateToken() {
  return 'ext-' + crypto.randomUUID().substring(0, 8);
}

// Initialize extension
async function init() {
  // Load saved settings
  const stored = await chrome.storage.local.get(['token', 'apiUrl', 'isConnected']);
  
  if (stored.token) {
    token = stored.token;
  } else {
    token = generateToken();
    await chrome.storage.local.set({ token });
  }
  
  if (stored.apiUrl) {
    apiUrl = stored.apiUrl;
  }
  
  console.log('[BrowserController] Initialized with token:', token);
  
  
  if (stored.isConnected) {
    await connect();
  }

  // Create context menus
  chrome.contextMenus.create({
    id: "pick-parent",
    title: "TubeCreate: Pick Selector",
    contexts: ["all", "selection"]
  });

  chrome.contextMenus.create({
    id: "pick-css",
    parentId: "pick-parent",
    title: "Copy CSS",
    contexts: ["all", "selection"]
  });

  chrome.contextMenus.create({
    id: "pick-xpath",
    parentId: "pick-parent",
    title: "Copy XPath",
    contexts: ["all", "selection"]
  });

  chrome.contextMenus.create({
    id: "pick-match",
    parentId: "pick-parent",
    title: "Copy Match (HTML)",
    contexts: ["all", "selection"]
  });

  chrome.contextMenus.create({
    id: "pick-parent-selector",
    parentId: "pick-parent",
    title: "Copy Parent CSS",
    contexts: ["all", "selection"]
  });
}

// Handle Context Menu Click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId.startsWith("pick-")) {
    const mode = info.menuItemId.replace("pick-", ""); // css, xpath, match
    
    // Send message to content script to get element info
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { 
        type: 'GET_CTX_ELEMENT',
        mode: mode
      });
      
      if (result && result.selector) {
        // Find recording state
        const stored = await chrome.storage.local.get(['isRecording', 'recordedCommands']);
        if (stored.isRecording) {
          const commands = stored.recordedCommands || [];
          
          // Determine what to save based on mode
          let finalSelector = result.selector;
          let selectorType = 'css';
          
          if (mode === 'xpath') {
            finalSelector = result.xpath;
            selectorType = 'xpath';
          } else if (mode === 'match') {
            finalSelector = result.match;
            selectorType = 'match';
          }
          
          commands.push({
            action: 'inspect',
            selector: finalSelector,
            selectorType: selectorType,
            description: `Picked ${mode.toUpperCase()}: ${result.tagName}`
          });
          await chrome.storage.local.set({ recordedCommands: commands });
        }
        
        // Flash badge to indicate success
        chrome.action.setBadgeText({ text: 'COPIED', tabId: tab.id });
        setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 1500);
      }
    } catch (e) {
      console.error('Pick selector error:', e);
    }
  }
});

// Connect to API server
async function connect() {
  try {
    // Ensure token is initialized
    if (!token) {
      const stored = await chrome.storage.local.get(['token']);
      if (stored.token) {
        token = stored.token;
      } else {
        token = generateToken();
        await chrome.storage.local.set({ token });
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
      await chrome.storage.local.set({ isConnected: true });
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

// Disconnect from API server
async function disconnect() {
  stopPolling();
  isConnected = false;
  await chrome.storage.local.set({ isConnected: false });
  
  try {
    await fetch(`${apiUrl}/extensions/${token}`, { method: 'DELETE' });
  } catch (e) {
    // Ignore errors on disconnect
  }
  
  console.log('[BrowserController] Disconnected');
  return { success: true };
}

// Start polling for commands
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
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      await sendResult(command.id, { success: false, error: 'No active tab' });
      return;
    }
    
    // Skip chrome:// and other restricted URLs
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      await sendResult(command.id, { success: false, error: 'Cannot run on chrome:// pages' });
      return;
    }
    
    // Handle navigation separately (doesn't need content script)
    if (command.action === 'navigate') {
      await chrome.tabs.update(tab.id, { url: command.params?.url });
      await sendResult(command.id, { success: true, result: 'Navigated' });
      return;
    }
    
    // Handle screenshot
    if (command.action === 'screenshot') {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      await sendResult(command.id, { success: true, result: dataUrl });
      return;
    }
    
    // Try to inject content script first (in case it wasn't loaded)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (e) {
      // Script might already be injected, ignore error
      console.log('[BrowserController] Content script injection:', e.message);
    }
    
    // Small delay to ensure script is ready
    await new Promise(r => setTimeout(r, 100));
    
    // Send to content script for DOM operations
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE', command });
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'GET_STATUS':
        // Ensure token exists
        if (!token) {
          const stored = await chrome.storage.local.get(['token']);
          if (stored.token) {
            token = stored.token;
          } else {
            token = generateToken();
            await chrome.storage.local.set({ token });
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
        await chrome.storage.local.set({ apiUrl });
        sendResponse({ success: true });
        break;
        
      case 'REFRESH_TOKEN':
        // Generate new token
        token = generateToken();
        await chrome.storage.local.set({ token });
        console.log('[BrowserController] Token refreshed:', token);
        sendResponse({ success: true, token });
        break;

      // --- Macro Recorder Messages ---
      case 'START_RECORDING':
        await chrome.storage.local.set({ 
            isRecording: true, 
            recordedCommands: [],
            lastActionTime: Date.now() // Initialize timer
        });
        // Broadcast to all tabs to enable listeners
        const tabsStart = await chrome.tabs.query({});
        for (const t of tabsStart) {
          try { await chrome.tabs.sendMessage(t.id, { type: 'START_RECORDING' }); } catch(e){}
        }
        sendResponse({ success: true });
        break;

      case 'STOP_RECORDING':
        await chrome.storage.local.set({ isRecording: false });
        // Broadcast to all tabs to disable listeners
        const tabsStop = await chrome.tabs.query({});
        for (const t of tabsStop) {
          try { await chrome.tabs.sendMessage(t.id, { type: 'STOP_RECORDING' }); } catch(e){}
        }
        // Return recorded commands
        const recordResult = await chrome.storage.local.get(['recordedCommands']);
        sendResponse({ success: true, commands: recordResult.recordedCommands || [] });
        break;

      case 'GET_RECORDING_STATUS':
        const status = await chrome.storage.local.get(['isRecording', 'recordedCommands']);
        sendResponse({ 
          isRecording: status.isRecording || false, 
          commands: status.recordedCommands || [] 
        });
        break;
        
      case 'RECORD_ACTION':
        const current = await chrome.storage.local.get(['recordedCommands', 'isRecording', 'lastActionTime']);
        if (current.isRecording) {
          const cmds = current.recordedCommands || [];
          const now = Date.now();
          const lastTime = current.lastActionTime || now;
          const diff = now - lastTime;
          
          // If delay > 1s, record a wait command first
          if (diff > 1000) {
             cmds.push({
                 action: 'wait',
                 params: { duration: diff },
                 description: `Wait ${Math.round(diff/1000)}s`
             });
          }
          
          cmds.push(message.command);
          await chrome.storage.local.set({ 
              recordedCommands: cmds,
              lastActionTime: now
          });
        }
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Initialize on startup
init();
