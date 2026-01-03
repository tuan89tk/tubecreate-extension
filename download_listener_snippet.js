// Download tracking
let downloadHistory = [];

// Listen for download changes
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
        
        // Keep only last 50 downloads
        if (downloadHistory.length > 50) {
          downloadHistory.shift();
        }
        
        // Store in chrome.storage
        chrome.storage.local.set({ downloadHistory });
      }
    });
  }
});

// Listen for download created (optional: track start)
chrome.downloads.onCreated.addListener((downloadItem) => {
  console.log('[Downloads] Started:', downloadItem.filename);
});
