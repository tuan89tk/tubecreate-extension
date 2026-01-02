/**
 * TubeCreate Browser Controller - Content Script
 * Executes DOM operations on web pages
 */

// Listen for commands from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE') {
    executeCommand(message.command)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async
  }
});

// Main command executor
async function executeCommand(command) {
  const { action, selectorType, selector, params } = command;
  
  try {
    switch (action) {
      case 'click':
        return await doClick(selectorType, selector);
        
      case 'type':
        return await doType(selectorType, selector, params?.text || '');
        
      case 'getText':
        return await doGetText(selectorType, selector);
        
      case 'getAttribute':
        return await doGetAttribute(selectorType, selector, params?.attribute);
        
      case 'evaluate':
        return await doEvaluate(params?.script);
        
      case 'scroll':
        return await doScroll(params?.x || 0, params?.y || 0);
        
      case 'wait':
        return await doWait(selectorType, selector, params?.timeout || 5000);
        
      case 'focus':
        return await doFocus(selectorType, selector);
        
      case 'hover':
        return await doHover(selectorType, selector);
        
      case 'getElements':
        return await doGetElements(selectorType, selector, params?.attributes);
        
      case 'loop':
        return await doLoop(selectorType, selector, params?.commands || []);
        
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Find element by selector
function findElement(selectorType, selector) {
  switch (selectorType) {
    case 'css':
      return document.querySelector(selector);
      
    case 'xpath':
      return document.evaluate(
        selector, document, null, 
        XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
      
    case 'match':
      // Match by HTML content pattern
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.outerHTML.includes(selector)) {
          return el;
        }
      }
      return null;
      
    default:
      return document.querySelector(selector);
  }
}

// Find all elements by selector
function findElements(selectorType, selector) {
  switch (selectorType) {
    case 'css':
      return Array.from(document.querySelectorAll(selector));
      
    case 'xpath':
      const result = [];
      const xpathResult = document.evaluate(
        selector, document, null,
        XPathResult.ORDERED_NODE_ITERATOR_TYPE, null
      );
      let node;
      while (node = xpathResult.iterateNext()) {
        result.push(node);
      }
      return result;
      
    case 'match':
      const allElements = document.querySelectorAll('*');
      const matched = [];
      for (const el of allElements) {
        if (el.outerHTML.includes(selector)) {
          matched.push(el);
        }
      }
      return matched;
      
    default:
      return Array.from(document.querySelectorAll(selector));
  }
}

// Action implementations
async function doClick(selectorType, selector) {
  const el = findElement(selectorType, selector);
  if (!el) return { success: false, error: 'Element not found' };
  
  el.click();
  return { success: true, result: 'Clicked' };
}

async function doType(selectorType, selector, text) {
  const el = findElement(selectorType, selector);
  if (!el) return { success: false, error: 'Element not found' };
  
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  
  return { success: true, result: 'Typed' };
}

async function doGetText(selectorType, selector) {
  const el = findElement(selectorType, selector);
  if (!el) return { success: false, error: 'Element not found' };
  
  return { success: true, result: el.textContent || el.innerText };
}

async function doGetAttribute(selectorType, selector, attribute) {
  const el = findElement(selectorType, selector);
  if (!el) return { success: false, error: 'Element not found' };
  
  return { success: true, result: el.getAttribute(attribute) };
}

async function doEvaluate(script) {
  if (!script) return { success: false, error: 'No script provided' };
  
  try {
    const result = eval(script);
    return { success: true, result: String(result) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function doScroll(x, y) {
  // Use smooth scroll behavior
  const targetX = x || 0;
  const targetY = y || 0;
  
  // Smooth scroll using scrollTo with behavior option
  window.scrollTo({
    top: targetY,
    left: targetX,
    behavior: 'smooth'
  });
  
  // Wait for scroll to complete (estimated time based on distance)
  const distance = Math.abs(targetY - window.scrollY) + Math.abs(targetX - window.scrollX);
  const scrollDuration = Math.min(Math.max(distance / 2, 300), 1500); // 300ms to 1500ms
  await new Promise(r => setTimeout(r, scrollDuration));
  
  return { success: true, result: `Scrolled to ${window.scrollX}, ${window.scrollY}` };
}

async function doWait(selectorType, selector, timeout) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const el = findElement(selectorType, selector);
    if (el) {
      return { success: true, result: 'Element found' };
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  return { success: false, error: 'Timeout waiting for element' };
}

async function doFocus(selectorType, selector) {
  const el = findElement(selectorType, selector);
  if (!el) return { success: false, error: 'Element not found' };
  
  el.focus();
  return { success: true, result: 'Focused' };
}

async function doHover(selectorType, selector) {
  const el = findElement(selectorType, selector);
  if (!el) return { success: false, error: 'Element not found' };
  
  const event = new MouseEvent('mouseover', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  el.dispatchEvent(event);
  
  return { success: true, result: 'Hovered' };
}

async function doGetElements(selectorType, selector, attributes) {
  const elements = findElements(selectorType, selector);
  
  if (!attributes || attributes.length === 0) {
    const result = elements.map((el, index) => ({
      index,
      tagName: el.tagName,
      text: (el.textContent || '').substring(0, 100),
      id: el.id,
      className: el.className
    }));
    return { success: true, result, count: elements.length };
  }

  const result = elements.map((el, index) => {
    const data = { index };
    for (const attr of attributes) {
      if (attr === 'text' || attr === 'innerText' || attr === 'textContent') {
        data[attr] = el.textContent || el.innerText;
      } else if (attr === 'innerHTML') {
        data[attr] = el.innerHTML;
      } else if (attr === 'outerHTML') {
        data[attr] = el.outerHTML;
      } else if (attr === 'href' || attr === 'src') {
         // Get absolute URL for href/src
         data[attr] = el[attr] || el.getAttribute(attr);
      } else {
        data[attr] = el.getAttribute(attr);
      }
    }
    return data;
  });
  
  return { success: true, result, count: elements.length };
}

async function doLoop(selectorType, selector, commands) {
  const elements = findElements(selectorType, selector);
  
  if (elements.length === 0) {
    return { success: false, error: 'No elements found' };
  }
  
  const results = [];
  
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const elementResults = [];
    
    for (const cmd of commands) {
      // For loop commands, execute on the current element directly
      let result;
      
      switch (cmd.action) {
        case 'click':
          el.click();
          result = { success: true, result: 'Clicked' };
          break;
          
        case 'getText':
          result = { success: true, result: el.textContent || el.innerText };
          break;
          
        case 'getAttribute':
          result = { success: true, result: el.getAttribute(cmd.params?.attribute) };
          break;
          
        case 'wait':
          await new Promise(r => setTimeout(r, cmd.params?.timeout || 500));
          result = { success: true, result: 'Waited' };
          break;
          
        default:
          // For other actions, use selector if provided
          result = await executeCommand({
            ...cmd,
            selectorType: cmd.selectorType || 'css',
            selector: cmd.selector || `[data-loop-index="${i}"]`
          });
      }
      
      elementResults.push(result);
    }
    
    results.push({ elementIndex: i, results: elementResults });
  }
  
  return { success: true, result: results, count: elements.length };
}

console.log('[BrowserController] Content script loaded');

// --- Macro Recorder Logic ---

let isRecording = false;

// Generate robust selector
function generateSelector(element) {
  // 1. ID
  if (element.id) {
    return `#${element.id}`;
  }
  
  // 2. Structural Attributes (name, placeholder, data-testid) - likely stable
  const structAttributes = ['name', 'placeholder', 'data-testid', 'data-id', 'for'];
  for (const attr of structAttributes) {
    if (element.hasAttribute(attr)) {
      return `${element.tagName.toLowerCase()}[${attr}="${element.getAttribute(attr)}"]`;
    }
  }
  
  // 3. Class (priority over content attributes)
  if (element.className && typeof element.className === 'string' && element.className.trim() !== '') {
    const classes = element.className.split(/\s+/).filter(c => c && !c.includes('active') && !c.includes('hover') && !c.includes('focus') && !c.includes('ng-'));
    if (classes.length > 0) {
      // Try combinations of classes
      for (const cls of classes) {
        const classSelector = `.${cls}`;
        if (document.querySelectorAll(classSelector).length === 1) {
          return classSelector;
        }
      }
      
      // Try closest parent with id + class
      // ... (keep simple for now)
    }
  }

  // 4. Content Attributes (title, alt, aria-label) - use only if short and needed
  const contentAttributes = ['title', 'alt', 'aria-label'];
  for (const attr of contentAttributes) {
    if (element.hasAttribute(attr)) {
      const val = element.getAttribute(attr);
      if (val && val.length < 30) { // Only use if short
        return `${element.tagName.toLowerCase()}[${attr}="${val}"]`;
      }
    }
  }
  
  // 5. XPath fallback (Text content) - only if very short
  if (element.innerText && element.innerText.length < 20) {
    const text = element.innerText.trim();
    if (text) {
      // Check if unique
      const xpath = `//${element.tagName.toLowerCase()}[contains(text(), '${text.replace(/'/g, "\\'")}')]`;
      try {
        const count = document.evaluate(xpath, document, null, XPathResult.NUMBER_TYPE, null).numberValue; // count not easy in xpath 1.0 logic here without iteration
        // Simplified: just return it if short
        return xpath; 
      } catch(e) {}
    }
  }
  
  // 6. Full Path Fallback (Structural position)
  let path = [];
  let curr = element;
  while (curr && curr.nodeType === Node.ELEMENT_NODE) {
    let selector = curr.nodeName.toLowerCase();
    if (curr.id) {
      selector += '#' + curr.id;
      path.unshift(selector);
      break; // Found an ID, good anchor
    } else {
      let sib = curr, nth = 1;
      while (sib = sib.previousElementSibling) {
        if (sib.nodeName.toLowerCase() == selector) nth++;
      }
      if (nth != 1) selector += ":nth-of-type("+nth+")";
      
      // Optimization: if class is unique among siblings, use it
      if (curr.className && typeof curr.className === 'string') {
          const classes = curr.className.split(/\s+/).filter(c => c && !c.startsWith('ng-'));
          if (classes.length > 0) {
              selector += `.${classes[0]}`;
          }
      }
    }
    path.unshift(selector);
    curr = curr.parentNode;
  }
  return path.join(" > ");
}

// Event handlers
function handleRecordClick(e) {
  if (!isRecording) return;
  
  // Ignore clicks on extension popup/iframe if any (though content script shouldn't see popup)
  
  const selector = generateSelector(e.target);
  const isXPath = selector.startsWith('//');
  
  chrome.runtime.sendMessage({
    type: 'RECORD_ACTION',
    command: {
      action: 'click',
      selectorType: isXPath ? 'xpath' : 'css',
      selector: selector
    }
  });
}

function handleRecordInput(e) {
  if (!isRecording) return;
  const selector = generateSelector(e.target);
  const isXPath = selector.startsWith('//');
  
  // Debounce could be added here, but simple version for now
  chrome.runtime.sendMessage({
    type: 'RECORD_ACTION',
    command: {
      action: 'type',
      selectorType: isXPath ? 'xpath' : 'css',
      selector: selector,
      params: { text: e.target.value } 
    }
  });
}

// Scroll recording with debounce
// Scroll recording with debounce
let scrollTimeout;
let lastScrollParams = null; // Store last scroll to flush

function handleRecordScroll(e) {
  if (!isRecording) return;
  
  lastScrollParams = { x: window.scrollX, y: window.scrollY };
  
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    if (lastScrollParams) {
      chrome.runtime.sendMessage({
        type: 'RECORD_ACTION',
        command: {
          action: 'scroll',
          params: lastScrollParams
        }
      });
      lastScrollParams = null;
    }
  }, 500); // 500ms debounce (faster response)
}

// Start/Stop Logic
function enableRecording() {
  if (isRecording) return;
  isRecording = true;
  document.addEventListener('click', handleRecordClick, true); // Capture phase
  document.addEventListener('change', handleRecordInput, true);
  document.addEventListener('scroll', handleRecordScroll, true);
  console.log('[TubeCreate] Recording started');
}

function disableRecording() {
  isRecording = false;
  
  // Flush pending scroll
  if (scrollTimeout && lastScrollParams) {
    clearTimeout(scrollTimeout);
    console.log('[TubeCreate] Flushing pending scroll...');
    chrome.runtime.sendMessage({
      type: 'RECORD_ACTION',
      command: {
        action: 'scroll',
        params: lastScrollParams
      }
    });
    lastScrollParams = null;
  }
  
  document.removeEventListener('click', handleRecordClick, true);
  document.removeEventListener('change', handleRecordInput, true);
  document.removeEventListener('scroll', handleRecordScroll, true);
  console.log('[TubeCreate] Recording stopped');
}

// Listen for recording messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_RECORDING') {
    enableRecording();
  } else if (message.type === 'STOP_RECORDING') {
    disableRecording();
  }
});

// Check status on load
chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
  if (response && response.isRecording) {
    enableRecording();
  }
});

// --- Context Menu Selector Picker ---
let lastRightClickedElement = null;

document.addEventListener('contextmenu', (e) => {
  lastRightClickedElement = e.target;
}, true);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CTX_ELEMENT') {
    if (lastRightClickedElement) {
      const mode = message.mode || 'css';
      let resultSelector = '';
      
      const cssSelector = generateSelector(lastRightClickedElement);
      
      // Generate XPath
      let xpath = '';
      const text = lastRightClickedElement.innerText ? lastRightClickedElement.innerText.trim() : '';
      if (text && text.length < 50) {
        xpath = `//${lastRightClickedElement.tagName.toLowerCase()}[contains(text(), '${text.replace(/'/g, "\\'")}')]`;
      } else {
         xpath = `//${lastRightClickedElement.tagName.toLowerCase()}[@id='${lastRightClickedElement.id}']`; 
         if (!lastRightClickedElement.id) xpath = `//${lastRightClickedElement.tagName.toLowerCase()}`;
      }
      
      // Generate Match (HTML snippet)
      let match = lastRightClickedElement.outerHTML;
      if (match.length > 50) {
          // Verify if unique enough? roughly
          match = `<${lastRightClickedElement.tagName.toLowerCase()} ...>${text.substring(0,20)}...`;
      }

      // Determine what to return/copy
      // Determine what to return/copy
      if (mode === 'xpath') resultSelector = xpath;
      else if (mode === 'match') resultSelector = match;
      else if (mode === 'parent-selector') {
        if (lastRightClickedElement.parentElement) {
            resultSelector = generateSelector(lastRightClickedElement.parentElement);
        } else {
            resultSelector = cssSelector; // Fallback
        }
      }
      else resultSelector = cssSelector;

      // Copy to clipboard
      // Note: This requires the document to be focused usually, but in content script triggered by context menu it works
      // Copy to clipboard
      const copyToClipboard = async (text) => {
          try {
            await navigator.clipboard.writeText(text);
            console.log('[TubeCreate] Copied to clipboard:', text);
          } catch (err) {
            console.warn('[TubeCreate] Native copy failed, trying fallback:', err);
            // Fallback
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed"; // Avoid scrolling to bottom
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
              document.execCommand('copy');
              console.log('[TubeCreate] Fallback copied to clipboard');
            } catch (fallbackErr) {
              console.error('[TubeCreate] Copy failed completely:', fallbackErr);
            }
            document.body.removeChild(textArea);
          }
      }
      copyToClipboard(resultSelector);

      sendResponse({
        selector: cssSelector,
        xpath: xpath,
        match: match,
        tagName: lastRightClickedElement.tagName,
        text: (lastRightClickedElement.innerText || '').substring(0, 30)
      });
    } else {
      sendResponse({ error: 'No element selected' });
    }
  }
});
