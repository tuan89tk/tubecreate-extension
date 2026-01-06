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
let isPaused = false; // New: pause execution

// Execution tracking
let executionHistory = []; // {id, action, description, status: 'success'|'error', time, error?}
let currentExecuting = null; // {id, action, description, startTime}
const MAX_HISTORY = 20; // Keep last 20 commands
let shouldAbort = false; // Flag to abort current execution

// Keep-alive using Chrome alarms

// Start polling for commands
function startPolling() {
  if (pollTimer) return;
  
  pollTimer = setInterval(async () => {
    if (!isConnected) return;
    
    // Don't fetch new commands when paused
    if (isPaused) return;
    
    try {
      // Keep fetching commands until queue is empty OR paused
      let hasMoreCommands = true;
      
      while (hasMoreCommands && !isPaused && !shouldAbort) {
        const response = await fetch(`${apiUrl}/commands/${token}`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.command) {
            console.log('[BrowserController] Received command:', data.command);
            
            // Check pause and abort before executing
            if (!isPaused && !shouldAbort) {
              await executeCommand(data.command);
            } else {
              console.log('[BrowserController] Paused or aborted, skipping execution');
              break;
            }
          } else {
            // No more commands in queue
            hasMoreCommands = false;
          }
        } else {
          hasMoreCommands = false;
        }
      }
    } catch (error) {
      console.error('[BrowserController] Poll error:', error);
    }
  }, POLL_INTERVAL);
}

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

  // === Download Monitoring ===
  let downloadHistory = [];
  
  // Load existing download history
  const storedDownloads = await chrome.storage.local.get(['downloadHistory']);
  if (storedDownloads.downloadHistory) {
    downloadHistory = storedDownloads.downloadHistory;
  }
  
  // Listen for download completion
  chrome.downloads.onChanged.addListener((downloadDelta) => {
    if (downloadDelta.state && downloadDelta.state.current === 'complete') {
      chrome.downloads.search({ id: downloadDelta.id }, (results) => {
        if (results.length > 0) {
          const download = results[0];
          const downloadInfo = {
            id: download.id,
            filename: download.filename,
            url: download.url,
            finalUrl: download.finalUrl || download.url,
            fileSize: download.fileSize,
            mime: download.mime,
            startTime: download.startTime,
            endTime: download.endTime,
            timestamp: Date.now()
          };
          
          downloadHistory.push(downloadInfo);
          console.log('[Downloads] Completed:', downloadInfo.filename);
          
          // Keep only last 50
          if (downloadHistory.length > 50) {
            downloadHistory.shift();
          }
          
          chrome.storage.local.set({ downloadHistory });
        }
      });
    }
  });
  
  chrome.downloads.onCreated.addListener((item) => {
    console.log('[Downloads] Started:', item.filename);
  });

  // Download history is available via chrome.storage or message handler
  // Service workers don't have window object
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

// Stop polling
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Execute command on active tab
async function executeCommand(command) {
  // Track execution start
  currentExecuting = {
    id: command.id,
    action: command.action,
    description: command.description || command.action,
    startTime: Date.now()
  };
  
  try {
    // Check abort flag immediately
    if (shouldAbort) {
      console.log('[BrowserController] Execution aborted by user');
      await sendResult(command.id, { success: false, error: 'Aborted by user' });
      
      // Track abort
      executionHistory.push({
        id: command.id,
        action: command.action,
        description: command.description || command.action,
        status: 'error',
        error: 'Aborted by user',
        time: 0
      });
      if (executionHistory.length > MAX_HISTORY) executionHistory.shift();
      currentExecuting = null;
      return;
    }

    // Check mutual exclusion: Block execution if recording
    const recState = await chrome.storage.local.get(['isRecording']);
    if (recState.isRecording) {
         console.log('[BrowserController] Execution blocked: Recording in progress');
         await sendResult(command.id, { success: false, error: 'Blocked: Recording in progress' });
         // Log error
         executionHistory.push({
            id: command.id,
            action: command.action,
            description: command.description || command.action,
            status: 'error',
            error: 'Blocked: Recording in progress',
            time: 0
         });
         currentExecuting = null;
         return;
    }
    
    
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      await sendResult(command.id, { success: false, error: 'No active tab' });
      // Track error
      executionHistory.push({
        id: command.id,
        action: command.action,
        description: command.description || command.action,
        status: 'error',
        error: 'No active tab',
        time: Date.now() - currentExecuting.startTime
      });
      if (executionHistory.length > MAX_HISTORY) executionHistory.shift();
      currentExecuting = null;
      return;
    }
    // Handle navigation separately (doesn't need content script)
    if (command.action === 'navigate') {
      const targetUrl = command.params?.url || command.selector;
      console.log('[BrowserController] Navigating to:', targetUrl);
      
      // Update tab and wait for loading to complete
      await chrome.tabs.update(tab.id, { url: targetUrl });
      
      // Wait for navigation to complete
      await new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 30000);
      });
      
      await sendResult(command.id, { success: true, result: 'Navigated' });
      return;
    }
    
    // Handle screenshot (can run on any visible page)
    if (command.action === 'screenshot') {
      try {
        // Check if tab URL is restricted for screenshots
        const currentTab = await chrome.tabs.get(tab.id);
        if (currentTab.url?.startsWith('chrome://') || currentTab.url?.startsWith('chrome-extension://')) {
          await sendResult(command.id, { success: false, error: 'Cannot capture chrome:// pages' });
          return;
        }
        
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        
        // Save screenshot if save_path is provided
        if (command.params?.save_path) {
          // Convert data URL to blob
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          const reader = new FileReader();
          
          reader.onloadend = async () => {
            const base64data = reader.result.split(',')[1];
            await sendResult(command.id, { 
              success: true, 
              result: dataUrl,
              saved_to: command.params.save_path,
              base64: base64data
            });
          };
          reader.readAsDataURL(blob);
        } else {
          await sendResult(command.id, { success: true, result: dataUrl });
        }
        return;
      } catch (error) {
        await sendResult(command.id, { success: false, error: error.message });
        return;
      }
    }
    
    // Handle wait action (doesn't need DOM access)
    if (command.action === 'wait') {
      const duration = command.params?.duration || 1000;
      const startTime = Date.now();
      
      // Poll every 100ms to check abort flag
      while (Date.now() - startTime < duration) {
        if (shouldAbort) {
          console.log('[BrowserController] Wait aborted by user');
          await sendResult(command.id, { success: false, error: 'Aborted' });
          executionHistory.push({
            id: command.id,
            action: command.action,
            description: command.description || command.action,
            status: 'error',
            error: 'Aborted',
            time: Date.now() - currentExecuting.startTime
          });
          if (executionHistory.length > MAX_HISTORY) executionHistory.shift();
          currentExecuting = null;
          return;
        }
        await new Promise(r => setTimeout(r, Math.min(100, duration - (Date.now() - startTime))));
      }
      
      await sendResult(command.id, { success: true, result: `Waited ${duration}ms` });
      
      // Track success
      executionHistory.push({
        id: command.id,
        action: command.action,
        description: command.description || command.action,
        status: 'success',
        time: Date.now() - currentExecuting.startTime
      });
      if (executionHistory.length > MAX_HISTORY) executionHistory.shift();
      currentExecuting = null;
      return;
    }
    
    // Handle random_scroll action
    if (command.action === 'random_scroll') {
      try {
        const minScrolls = command.params?.min_scrolls || 1;
        const maxScrolls = command.params?.max_scrolls || 3;
        const scrollDelay = command.params?.scroll_delay || 500;
        
        const scrollCount = Math.floor(Math.random() * (maxScrolls - minScrolls + 1)) + minScrolls;
        
        console.log(`[BrowserController] Random scroll: ${scrollCount} times`);
        
        for (let i = 0; i < scrollCount; i++) {
          // Random scroll amount between 200-800px
          const scrollAmount = Math.floor(Math.random() * 600) + 200;
          
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (amount) => {
              window.scrollBy({
                top: amount,
                behavior: 'smooth'
              });
            },
            args: [scrollAmount]
          });
          
          // Wait between scrolls
          if (i < scrollCount - 1) {
            await new Promise(r => setTimeout(r, scrollDelay));
          }
        }
        
        await sendResult(command.id, { 
          success: true, 
          result: `Scrolled ${scrollCount} times` 
        });
        return;
      } catch (error) {
        await sendResult(command.id, { success: false, error: error.message });
        return;
      }
    }
    
    // For other actions that need DOM access, check URL restrictions
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      await sendResult(command.id, { success: false, error: 'Cannot run on chrome:// pages' });
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
    
    // Track success/error
    executionHistory.push({
      id: command.id,
      action: command.action,
      description: command.description || command.action,
      status: result.success ? 'success' : 'error',
      error: result.error,
      time: Date.now() - currentExecuting.startTime
    });
    if (executionHistory.length > MAX_HISTORY) executionHistory.shift();
    currentExecuting = null;
    
  } catch (error) {
    console.error('[BrowserController] Execute error:', error);
    await sendResult(command.id, { success: false, error: error.message });
    
    // Track error
    executionHistory.push({
      id: command.id,
      action: command.action,
      description: currentExecuting?.description || command.action,
      status: 'error',
      error: error.message,
      time: currentExecuting ? Date.now() - currentExecuting.startTime : 0
    });
    if (executionHistory.length > MAX_HISTORY) executionHistory.shift();
    currentExecuting = null;
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
        sendResponse({ token, apiUrl, isConnected, isAutomationPaused: isPaused });
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
        // Check mutual exclusion: Block recording if executing (or not paused?)
        // User said "action đang thực hiện" -> currently executing
        if (currentExecuting) {
             sendResponse({ success: false, error: 'Cannot record while automation is running an action' });
             break;
        }

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
          
          // If delay > 100ms, record a wait command first
          console.log('[Recorder] Diff:', diff);
          if (diff > 100) {
             cmds.push({
                 action: 'wait',
                 params: { duration: diff },
                 description: `Wait ${Math.round(diff/100)/10}s`
             });
          }
          
          cmds.push(message.command);
          await chrome.storage.local.set({ 
              recordedCommands: cmds,
              lastActionTime: now
          });
        }
        break;
        
      case 'GET_EXECUTION_STATUS':
        sendResponse({
          success: true,
          history: executionHistory.slice(-10), // Last 10 completed
          current: currentExecuting,
          isPaused
        });
        break;
        
      case 'PAUSE_AUTOMATION':
        isPaused = true;
        sendResponse({ success: true, isPaused: true });
        break;
        
      case 'RESUME_AUTOMATION':
        isPaused = false;
        shouldAbort = false; // Clear abort flag when resuming
        sendResponse({ success: true, isPaused: false });
        break;
        
      case 'GET_QUEUE':
        try {
          const response = await fetch(`${apiUrl}/extensions`);
          if (response.ok) {
            const data = await response.json();
            const ext = data.extensions?.find(e => e.token === token);
            sendResponse({ 
              success: true, 
              isPaused,
              queueSize: ext?.queueSize || 0,
              queuePreview: ext?.queuePreview || []
            });
          } else {
            sendResponse({ success: false, error: 'Failed to fetch queue' });
          }
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;
        
      case 'CLEAR_QUEUE':
        try {
          console.log('[BrowserController] Stopping all execution...');
          
          // 1. Set abort flag to stop current executing command
          shouldAbort = true;
          
          // 2. Pause to stop fetching new commands
          isPaused = true;
          
          // 3. Wait for current command to finish aborting and send result
          await new Promise(r => setTimeout(r, 500));
          
          // 4. Clear queue on server and re-register
          if (token && isConnected) {
            try {
              // Delete old registration
              await fetch(`${apiUrl}/extensions/${token}`, { method: 'DELETE' });
              
              // Small delay before re-registering
              await new Promise(r => setTimeout(r, 200));
              
              // Re-register to create fresh queue
              const registerResponse = await fetch(`${apiUrl}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  token: token,
                  userAgent: navigator.userAgent,
                  timestamp: Date.now()
                })
              });
              
              if (!registerResponse.ok) {
                console.error('[BrowserController] Re-registration failed');
                // If re-register fails, disconnect and prepare for manual reconnect
                isConnected = false;
                await chrome.storage.local.set({ isConnected: false });
                stopPolling();
              }
            } catch (error) {
              console.error('[BrowserController] Clear queue server error:', error);
            }
          }
          
          console.log('[BrowserController] Executing soft reset...');
          
          // 5. Reset all state flags
          shouldAbort = false;
          isPaused = false;  // Ready for new commands
          currentExecuting = null;
          executionHistory = [];
          
          // 6. Ensure polling is active if still connected
          if (isConnected && !pollTimer) {
            startPolling();
          }
          
          console.log('[BrowserController] Stopped and cleared. Ready for new commands.');
          sendResponse({ success: true, message: 'Stopped and cleared. Ready for new batch.' });
          
        } catch (error) {
          console.error('[BrowserController] Clear error:', error);
          // Reset flags even on error
          shouldAbort = false;
          isPaused = false;
          currentExecuting = null;
          sendResponse({ success: false, error: error.message });
        }
        break;
        
      case 'GET_DOWNLOADS':
        const downloads = await chrome.storage.local.get(['downloadHistory']);
        sendResponse({ 
          success: true, 
          downloads: downloads.downloadHistory || [] 
        });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })();
  
  return true; // Keep channel open for async response
});

// Initialize on startup
init();
