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

// Helper to check if a class name looks like a random hash (obfuscated)
function isValidClass(cls) {
  if (!cls) return false;
  // Ignore common state classes
  if (['active', 'hover', 'focus', 'selected', 'open', 'show', 'hide'].includes(cls)) return false;
  // Ignore Angular/Framework internal classes
  if (cls.startsWith('ng-') || cls.startsWith('css-')) return false;
  
  // Refined: MUI/Emotion generated classes often start with 'mui-' followed by random
  // Real MUI classes are like MuiButton-root, Mui-selected (CamelCase)
  // Bad: mui-ttq2zu (all lower/numbers)
  if (cls.startsWith('mui-') && /^[a-z0-9-]+$/.test(cls) && !/[A-Z]/.test(cls)) {
      return false; 
  }

  // Pattern for random hashes: 
  // 1. Short (4-8 chars)
  // 2. Mixed case letters, maybe numbers
  // 3. No hyphens or underscores usually (frameworks often use kebab-case which is good)
  // e.g. "xKcayf", "dMNVAe", "AcKKx"
  const randomHashPattern = /^[a-zA-Z0-9]{4,8}$/;
  
  // If it matches hash pattern AND doesn't look like a word (no vowels or too random)
  if (randomHashPattern.test(cls)) {
      // Heuristic: mixed case is a strong indicator of React/StyledComponents hashes
      const hasUpper = /[A-Z]/.test(cls);
      const hasLower = /[a-z]/.test(cls);
      const hasNumber = /[0-9]/.test(cls);
      
      if (hasUpper && hasLower) return false; // "xKcayf" -> bad
      if (hasNumber && (hasUpper || hasLower)) return false; // "jss123" -> bad
  }
  
  return true;
}

// Helper to escape XPath string
function escapeXPathString(str) {
    if (!str.includes("'")) return `'${str}'`;
    if (!str.includes('"')) return `"${str}"`;
    return "concat('" + str.replace(/'/g, "', \"'\", '") + "')";
}

function generateSmartXPath(element) {
    // 1. Text Content (Strongest semantic signal)
    // Only if text is reasonably short and meaningful
    const text = element.innerText ? element.innerText.trim() : '';
    const tagName = element.tagName.toLowerCase();
    
    if (text && text.length < 50 && text.length > 2) {
        const safeText = escapeXPathString(text);
        
        // Exact match
        const exactXpath = `//${tagName}[normalize-space()=${safeText}]`;
        try {
            const matches = document.evaluate(exactXpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            if (matches.snapshotLength === 1) return exactXpath;
        } catch(e) {}
        
        // Contains match (if exact fails or for buttons/links)
        if (['a', 'button', 'span', 'h1', 'h2', 'h3', 'label'].includes(tagName)) {
             const containsXpath = `//${tagName}[contains(normalize-space(), ${safeText})]`;
             try {
                const matches = document.evaluate(containsXpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                if (matches.snapshotLength === 1) return containsXpath;
             } catch(e) {}
        }
    }
    
    // 2. Critical Attributes (that might not be unique globally but unique for tag)
    // e.g. type="submit", name="email"
    const attributes = ['name', 'placeholder', 'type', 'aria-label', 'title', 'role'];
    for (const attr of attributes) {
        if (element.hasAttribute(attr)) {
            const val = element.getAttribute(attr);
            if (val && val.length < 50) {
                 const attrXpath = `//${tagName}[@${attr}=${escapeXPathString(val)}]`;
                 try {
                    const matches = document.evaluate(attrXpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                    if (matches.snapshotLength === 1) return attrXpath;
                 } catch(e) {}
            }
        }
    }
    
    // 3. Parent + Text/Attr (e.g. div[@class='row']//button[text()='Submit'])
    // If the element itself isn't unique, maybe its relation to a close parent text is?
    // (Skipped for now to avoid complexity/brittleness)
    
    return null;
}

// Generate robust selector
function generateSelector(element) {
  // 0. Smart XPath (Prioritize Text/Semantics over random CSS classes)
  // User asked for "workflow compatible logic" which heavily relies on XPaths for text.
  // We check this BEFORE falling back to generic CSS chains.
  const smartXpath = generateSmartXPath(element);
  
  // 1. ID - Only if it doesn't look random
  const badIdPattern = /^(_|:|[0-9])|(:)|(_r_)/;
  if (element.id && !badIdPattern.test(element.id) && !/^[a-zA-Z0-9]{4,10}$/.test(element.id)) { 
    return `#${element.id}`;
  }
  
  // If we have a semantic XPath, prefer it over generic CSS unless we find a specific Unique Attribute
  
  // 2. Structural Attributes (name, placeholder, data-testid)
  const structAttributes = ['name', 'placeholder', 'data-testid', 'data-id', 'for', 'data-cy'];
  for (const attr of structAttributes) {
    if (element.hasAttribute(attr)) {
      // CSS is cleaner for attributes
      return `${element.tagName.toLowerCase()}[${attr}="${element.getAttribute(attr)}"]`;
    }
  }
  
  // 3. Class (filtered)
  let bestClassSelector = null;
  if (element.className && typeof element.className === 'string' && element.className.trim() !== '') {
    const classes = element.className.split(/\s+/).filter(isValidClass);
    if (classes.length > 0) {
      for (const cls of classes) {
        const classSelector = `.${cls}`;
        // If unique class found, it's usually good. 
        if (document.querySelectorAll(classSelector).length === 1) {
          return classSelector;
        }
      }
    }
  }
  
  // DECISION: If we have a Smart XPath (text based), and we didn't find a Unique ID or Unique Attribute or Unique Class...
  // Use the XPath instead of falling down to "Content Attributes" or "Full Path Fallback"
  if (smartXpath) {
      return smartXpath;
  }

  // 4. Content Attributes (title, alt, aria-label)
  const contentAttributes = ['title', 'alt', 'aria-label', 'role'];
  for (const attr of contentAttributes) {
    if (element.hasAttribute(attr)) {
      const val = element.getAttribute(attr);
      if (val && val.length < 30) { 
        return `${element.tagName.toLowerCase()}[${attr}="${val}"]`;
      }
    }
  }
  
  // 5. Full Path Fallback
  // (Note: Removed Logic 5 old XPath fallback as it's covered by SmartXPath now)
  
  // 6. Full Path Fallback (Structural position with Valid Classes)
  let path = [];
  let curr = element;
  while (curr && curr.nodeType === Node.ELEMENT_NODE) {
    let selector = curr.nodeName.toLowerCase();
    
    // Check ID against same rules + duplicates
    if (curr.id && !badIdPattern.test(curr.id) && !/^[a-zA-Z0-9]{4,10}$/.test(curr.id)) {
      selector += '#' + curr.id;
      path.unshift(selector);
      break; 
    } else {
      let sib = curr, nth = 1;
      while (sib = sib.previousElementSibling) {
        if (sib.nodeName.toLowerCase() == selector) nth++;
      }
      
      // Add valid classes to current node selector to make it specific, BUT only if valid
      if (curr.className && typeof curr.className === 'string') {
          const classes = curr.className.split(/\s+/).filter(isValidClass);
          if (classes.length > 0) {
              selector += `.${classes[0]}`; // Use first valid class
          }
      }
      
      if (nth != 1 || !selector.includes('.')) {
          selector += `:nth-of-type(${nth})`;
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

function handleRecordKeydown(e) {
  if (!isRecording) return;
  
  // Only handle Enter for now
  if (e.key === 'Enter') {
      const target = e.target;
      
      // If inside a form, try to record as submit click
      if (target.form) {
          const form = target.form;
          // Find submit button (input[type=submit] or button[type=submit] or just button inside form)
          let submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
          
          if (!submitBtn) {
              // Try finding general button (often used as submit)
              const buttons = form.querySelectorAll('button');
              if (buttons.length > 0) {
                  // Heuristic: Last button or one with "submit" text? 
                  // Let's pick the first submit-type or fallback to first button if valid
                  submitBtn = buttons[0]; 
              }
          }
          
          if (submitBtn) {
              console.log('[Recorder] Enter key detected, recording as Submit Click on:', submitBtn);
              const selector = generateSelector(submitBtn);
              const isXPath = selector.startsWith('//');
              
              chrome.runtime.sendMessage({
                type: 'RECORD_ACTION',
                command: {
                  action: 'click',
                  selectorType: isXPath ? 'xpath' : 'css',
                  selector: selector,
                  description: 'Click Submit (via Enter)'
                }
              });
              return; // Handled as click
          }
      }
      
      // Fallback: Record as key press (if we support it later, strictly user said "record as click submit")
      // Since user specifically asked for "click submit", and we failed to find one, 
      // we can optionally record a generic "press Enter" or just ignore if strict.
      // Let's record a "press_key" action for completeness if user validates it later.
      const selector = generateSelector(target);
      chrome.runtime.sendMessage({
            type: 'RECORD_ACTION',
            command: {
              action: 'press_key',
              selectorType: selector.startsWith('//') ? 'xpath' : 'css',
              selector: selector,
              params: { key: 'Enter' },
              description: 'Press Enter'
            }
      });
  }
}

// Start/Stop Logic
function enableRecording() {
  if (isRecording) return;
  isRecording = true;
  document.addEventListener('click', handleRecordClick, true); // Capture phase
  document.addEventListener('change', handleRecordInput, true);
  document.addEventListener('keydown', handleRecordKeydown, true);
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
  document.removeEventListener('keydown', handleRecordKeydown, true);
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
