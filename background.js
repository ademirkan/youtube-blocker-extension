// YouTube Doomscroll Blocker - Background Service Worker

// Helper function to get next 3 AM timestamp
function getNext3AM() {
  const now = new Date();
  const next3AM = new Date();
  next3AM.setHours(3, 0, 0, 0);
  
  // If it's already past 3 AM today, set for tomorrow
  if (now.getHours() >= 3) {
    next3AM.setDate(next3AM.getDate() + 1);
  }
  
  return next3AM.getTime();
}

const SESSION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// Expire session if cooldown has elapsed since last activity
function checkAndExpireSession() {
  chrome.storage.local.get(['sessionState'], (result) => {
    const stored = result.sessionState;
    if (stored && stored.lastActivityTime) {
      if (Date.now() - stored.lastActivityTime > SESSION_COOLDOWN_MS) {
        chrome.storage.local.set({
          sessionState: { accumulatedTime: 0, lastActivityTime: null }
        });
      }
    }
  });
}

// Check and reset stats daily at 3 AM
function checkAndResetDaily() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDate = now.toDateString(); // e.g., "Mon Jan 01 2024"
  
  chrome.storage.local.get(['lastResetDate', 'youtubeStats'], (result) => {
    const lastResetDate = result.lastResetDate;
    const shouldReset = 
      currentHour >= 3 && // Past 3 AM
      lastResetDate !== currentDate; // Different day
    
    if (shouldReset) {
      chrome.storage.local.set({
        youtubeStats: {
          videos: {},
          shorts: {},
          totalTime: 0
        },
        lastResetDate: currentDate
      });
      console.log('[YouTube Blocker] Daily reset completed at 3 AM');
    }
  });
}

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['youtubeStats', 'lastResetDate'], (result) => {
    if (!result.youtubeStats) {
      chrome.storage.local.set({
        youtubeStats: {
          videos: {},  // Hashset: { videoId1: true, videoId2: true, ... }
          shorts: {},  // Hashset: { videoId1: true, videoId2: true, ... }
          totalTime: 0
        }
      });
    }
    
    // Initialize lastResetDate if not set
    if (!result.lastResetDate) {
      chrome.storage.local.set({
        lastResetDate: new Date().toDateString()
      });
    }

    // Initialize sessionState if not set
    if (!result.sessionState) {
      chrome.storage.local.set({
        sessionState: { accumulatedTime: 0, lastActivityTime: null }
      });
    }
    
    // Check for reset on install
    checkAndResetDaily();
    
    // Set up alarm to check every hour
    chrome.alarms.create('hourlyResetCheck', {
      periodInMinutes: 60
    });
  });
});

// Check for reset on browser startup
chrome.runtime.onStartup.addListener(() => {
  checkAndResetDaily();
  checkAndExpireSession();
});

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'hourlyResetCheck') {
    checkAndResetDaily();
  }
});
