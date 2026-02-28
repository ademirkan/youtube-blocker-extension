// YouTube Doomscroll Blocker - Background Service Worker

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['youtubeStats'], (result) => {
    if (!result.youtubeStats) {
      chrome.storage.local.set({
        youtubeStats: {
          videos: 0,
          shorts: 0,
          totalTime: 0
        }
      });
    }
  });
});

// Optional: Add context menu or other background features here
