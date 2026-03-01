// YouTube Doomscroll Blocker - Content Script

(function() {
  'use strict';

  // Stats tracking - using hashsets (objects) to track unique videos/shorts
  let stats = {
    videos: {},  // Hashset: { videoId1: true, videoId2: true, ... }
    shorts: {},  // Hashset: { videoId1: true, videoId2: true, ... }
    totalTime: 0 // in seconds
  };

  // Real-time tracking state
  let currentSessionTime = 0; // Time in current session (seconds)
  let isPaused = true; // Track if video is currently paused
  let updateInterval = null; // Interval for real-time updates
  let lastSaveTime = Date.now(); // Track when we last saved to storage

  // Session tracking state
  const SESSION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
  let sessionSavedTime = 0;    // session seconds flushed to storage
  let sessionCurrentTime = 0;  // session seconds accumulated in-flight
  let lastActivityTime = null; // timestamp (ms) of last video play event

  // Migration function to convert old counter-based stats to hashset format
  function migrateStats(oldStats) {
    if (typeof oldStats.videos === 'number' || typeof oldStats.shorts === 'number') {
      // Old format detected - convert to new format
      // Since we can't know which specific videos were watched, we'll just initialize empty hashsets
      // The counts are lost, but this is a one-time migration
      return {
        videos: {},
        shorts: {},
        totalTime: oldStats.totalTime || 0
      };
    }
    // Already in new format or missing fields - ensure structure is correct
    return {
      videos: oldStats.videos || {},
      shorts: oldStats.shorts || {},
      totalTime: oldStats.totalTime || 0
    };
  }

  // Load session state from storage, expiring if cooldown has elapsed
  function loadSessionState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['sessionState'], (result) => {
        const stored = result.sessionState;
        if (stored && stored.lastActivityTime) {
          const elapsed = Date.now() - stored.lastActivityTime;
          if (elapsed < SESSION_COOLDOWN_MS) {
            sessionSavedTime = stored.accumulatedTime || 0;
            lastActivityTime = stored.lastActivityTime;
          } else {
            // Session expired while away — start fresh
            sessionSavedTime = 0;
            lastActivityTime = null;
            chrome.storage.local.set({ sessionState: { accumulatedTime: 0, lastActivityTime: null } });
          }
        }
        resolve();
      });
    });
  }

  function saveSessionState() {
    chrome.storage.local.set({
      sessionState: {
        accumulatedTime: sessionSavedTime,
        lastActivityTime: lastActivityTime
      }
    });
  }

  // Called periodically to expire a session when the tab stays open but user stops watching
  function checkSessionExpiry() {
    if (lastActivityTime && Date.now() - lastActivityTime > SESSION_COOLDOWN_MS) {
      sessionSavedTime = 0;
      sessionCurrentTime = 0;
      lastActivityTime = null;
      saveSessionState();
      updateStatsDisplay();
    }
  }

  // Check for daily reset (called from content script)
  // Returns a Promise that resolves when stats are loaded
  function checkForDailyReset() {
    return new Promise((resolve) => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentDate = now.toDateString();
      
      chrome.storage.local.get(['lastResetDate', 'youtubeStats'], (result) => {
        const lastResetDate = result.lastResetDate;
        const shouldReset = 
          currentHour >= 3 && // Past 3 AM
          lastResetDate !== currentDate; // Different day
        
        if (shouldReset) {
          // Reset stats
          stats = {
            videos: {},
            shorts: {},
            totalTime: 0
          };
          currentSessionTime = 0;
          sessionSavedTime = 0;
          sessionCurrentTime = 0;
          lastActivityTime = null;

          // Update storage
          chrome.storage.local.set({
            youtubeStats: stats,
            lastResetDate: currentDate,
            sessionState: { accumulatedTime: 0, lastActivityTime: null }
          });
          
          // Update display
          updateStatsDisplay();
          console.log('[YouTube Blocker] Daily reset completed at 3 AM');
        } else if (result.youtubeStats) {
          // Load stats normally if no reset needed
          stats = migrateStats(result.youtubeStats);
          updateStatsDisplay();
        }
        
        // Resolve promise after stats are loaded
        resolve();
      });
    });
  }

  // Check if current page is a Short
  function isShortPage() {
    const path = window.location.pathname;
    return path === '/shorts' || path.startsWith('/shorts/');
  }

  // Extract video type and ID from current URL
  function extractVideoInfo() {
    const href = window.location.href;
    const path = window.location.pathname;
    
    // Check for Shorts
    const shortsMatch = href.match(/\/shorts\/([^/?&]+)/);
    if (shortsMatch) {
      return { type: 'short', id: shortsMatch[1] };
    }
    
    // Check for regular video
    const videoMatch = href.match(/[?&]v=([^&]+)/);
    if (videoMatch) {
      return { type: 'video', id: videoMatch[1] };
    }
    
    return null; // Not a video page
  }

  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs >= 1)  return `${hrs}h${String(mins).padStart(2, '0')}m`;
    if (mins >= 1) return `${mins}m`;
    return `${secs}s`;
  }

  // Track scroll prevention handlers to avoid duplicates
  let scrollPreventionActive = false;
  let scrollHandlers = {
    wheel: null,
    keydown: null,
    touchmove: null
  };

  // Disable scrolling on Shorts
  function disableShortsScrolling() {
    if (!isShortPage() || scrollPreventionActive) return;
    
    scrollPreventionActive = true;

    // Disable mouse wheel scrolling - capture at document level
    scrollHandlers.wheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    };
    document.addEventListener('wheel', scrollHandlers.wheel, { passive: false, capture: true });

    // Disable keyboard scrolling (arrow keys, space, page up/down)
    scrollHandlers.keydown = (e) => {
      const scrollKeys = [
        'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown',
        'Home', 'End'
      ];
      // Only prevent Space if not in an input field
      if (scrollKeys.includes(e.key) || 
          (e.key === ' ' && document.activeElement?.tagName !== 'INPUT' && 
           document.activeElement?.tagName !== 'TEXTAREA')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    };
    document.addEventListener('keydown', scrollHandlers.keydown, { capture: true });

    // Disable touch scrolling
    scrollHandlers.touchmove = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    };
    document.addEventListener('touchmove', scrollHandlers.touchmove, { passive: false, capture: true });
  }

  // Re-enable scrolling when leaving Shorts
  function enableScrolling() {
    if (!scrollPreventionActive) return;
    
    scrollPreventionActive = false;
    
    if (scrollHandlers.wheel) {
      document.removeEventListener('wheel', scrollHandlers.wheel, { capture: true });
      scrollHandlers.wheel = null;
    }
    if (scrollHandlers.keydown) {
      document.removeEventListener('keydown', scrollHandlers.keydown, { capture: true });
      scrollHandlers.keydown = null;
    }
    if (scrollHandlers.touchmove) {
      document.removeEventListener('touchmove', scrollHandlers.touchmove, { capture: true });
      scrollHandlers.touchmove = null;
    }
  }

  // Create stats display in header
  function createStatsDisplay() {
    // Remove existing stats display if present
    const existing = document.getElementById('youtube-doomscroll-stats');
    if (existing) {
      existing.remove();
    }

    const statsContainer = document.createElement('div');
    statsContainer.id = 'youtube-doomscroll-stats';
    
    // Get icon paths using chrome.runtime.getURL for extension-relative paths
    const getIconPath = (iconName) => {
      try {
        return chrome.runtime.getURL(`icons/${iconName}`);
      } catch (e) {
        // Fallback to relative path if getURL fails
        return `icons/${iconName}`;
      }
    };
    
    // Load SVG icons inline so currentColor works properly
    const loadSVGIcon = async (iconName, containerId) => {
      try {
        const iconPath = getIconPath(iconName);
        console.log(`[YouTube Blocker] Loading icon: ${iconName} from ${iconPath}`);
        
        const response = await fetch(iconPath);
        if (!response.ok) {
          console.warn(`[YouTube Blocker] Failed to fetch icon: ${iconName}, status: ${response.status}`);
          return;
        }
        
        const svgText = await response.text();
        if (!svgText) {
          console.warn(`[YouTube Blocker] Empty response for icon: ${iconName}`);
          return;
        }
        
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        
        // Check for parsing errors
        const parserError = svgDoc.querySelector('parsererror');
        if (parserError) {
          console.warn(`[YouTube Blocker] SVG parsing error for ${iconName}:`, parserError.textContent);
          return;
        }
        
        const svgElement = svgDoc.documentElement;
        if (!svgElement || svgElement.tagName !== 'svg') {
          console.warn(`[YouTube Blocker] Invalid SVG element for ${iconName}`);
          return;
        }
        
        // Add class for styling
        svgElement.setAttribute('class', 'stats-icon');
        svgElement.setAttribute('width', '16');
        svgElement.setAttribute('height', '16');
        
        // Find container - search within statsContainer first, then document
        let container = statsContainer.querySelector(`#${containerId}`);
        if (!container) {
          container = document.getElementById(containerId);
        }
        
        if (container) {
          // Clear any existing content
          container.innerHTML = '';
          container.appendChild(svgElement);
          console.log(`[YouTube Blocker] Successfully loaded icon: ${iconName}`);
        } else {
          console.warn(`[YouTube Blocker] Container not found: ${containerId}. Stats container:`, statsContainer);
        }
      } catch (e) {
        console.error(`[YouTube Blocker] Failed to load icon: ${iconName}`, e);
      }
    };
    
    statsContainer.innerHTML = `
      <div class="stats-col">
        <div class="stats-item">
          <span class="stats-icon-container" id="icon-container-videos"></span>
          <span class="stats-value" id="stats-videos">0</span>
        </div>
        <div class="stats-item">
          <span class="stats-icon-container" id="icon-container-shorts"></span>
          <span class="stats-value" id="stats-shorts">0</span>
        </div>
      </div>
      <div class="stats-col stats-col--times">
        <div class="stats-item">
          <span class="stats-label">Session</span>
          <span class="stats-value" id="stats-session">0s</span>
        </div>
        <div class="stats-item">
          <span class="stats-label">Today</span>
          <span class="stats-value" id="stats-time">0s</span>
        </div>
      </div>
    `;
    
    // Load SVG icons asynchronously - will be called after container is inserted
    const loadIcons = () => {
      loadSVGIcon('video-icon.svg', 'icon-container-videos');
      loadSVGIcon('shorts-icon.svg', 'icon-container-shorts');
    };
    
    // Store load function to call after insertion
    statsContainer._loadIcons = loadIcons;

    // Try to find the right-side buttons container in YouTube header
    // YouTube typically has an end-items container or similar for right-side buttons
    const rightSideSelectors = [
      '#end',
      '#buttons',
      '#end-items',
      'ytd-masthead #end',
      '#masthead-container #end',
      'ytd-masthead #container #end',
      '#masthead-container #container #end'
    ];

    let inserted = false;
    
    // First, try to insert before the right-side buttons (Create, notifications, etc.)
    for (const selector of rightSideSelectors) {
      const endContainer = document.querySelector(selector);
      if (endContainer && endContainer.parentElement) {
        // Insert before the end container so stats appear before Create button
        endContainer.parentElement.insertBefore(statsContainer, endContainer);
        inserted = true;
        break;
      }
    }

    // If that didn't work, try to find the main container and insert appropriately
    if (!inserted) {
      const mainContainer = document.querySelector('ytd-masthead #container, #masthead-container #container');
      if (mainContainer) {
        // Try to find search container and insert after it
        const searchContainer = mainContainer.querySelector('#search-container, ytd-searchbox');
        if (searchContainer && searchContainer.nextSibling) {
          mainContainer.insertBefore(statsContainer, searchContainer.nextSibling);
          inserted = true;
        } else if (searchContainer) {
          // Insert after search container
          searchContainer.parentElement.insertBefore(statsContainer, searchContainer.nextSibling);
          inserted = true;
        } else {
          // Append to container
          mainContainer.appendChild(statsContainer);
          inserted = true;
        }
      }
    }

    // Final fallback: insert at top of body
    if (!inserted && document.body) {
      document.body.insertBefore(statsContainer, document.body.firstChild);
    }

    // Load SVG icons after container is inserted
    // Use requestAnimationFrame to ensure DOM is ready
    if (statsContainer._loadIcons) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          statsContainer._loadIcons();
        });
      });
    }

    updateStatsDisplay();
  }

  // Update stats display values
  function updateStatsDisplay() {
    const videosEl = document.getElementById('stats-videos');
    const shortsEl = document.getElementById('stats-shorts');
    const timeEl = document.getElementById('stats-time');
    const sessionEl = document.getElementById('stats-session');

    // Use hashset sizes for counts
    const videoCount = Object.keys(stats.videos || {}).length;
    const shortsCount = Object.keys(stats.shorts || {}).length;

    if (videosEl) videosEl.textContent = videoCount;
    if (shortsEl) shortsEl.textContent = shortsCount;

    if (timeEl) {
      const totalSeconds = stats.totalTime + currentSessionTime;
      timeEl.textContent = formatTime(totalSeconds);
      timeEl.classList.toggle('stats-time-paused', isPaused);
    }

    if (sessionEl) {
      const totalSessionSeconds = sessionSavedTime + sessionCurrentTime;
      sessionEl.textContent = formatTime(totalSessionSeconds);
      sessionEl.classList.toggle('stats-time-paused', isPaused);
    }
  }

  // Start/stop real-time update interval
  function startUpdateInterval() {
    if (updateInterval) return; // Already running
    
    updateInterval = setInterval(() => {
      const video = document.querySelector('video');
      if (video && !video.paused) {
        // Video is playing - increment time counters
        currentSessionTime++;
        sessionCurrentTime++;
        lastActivityTime = Date.now(); // keep refreshing while actively watching
        updateStatsDisplay();

        // Periodically save to storage (every 5 seconds)
        const now = Date.now();
        if (now - lastSaveTime >= 5000) {
          stats.totalTime += currentSessionTime;
          currentSessionTime = 0;
          sessionSavedTime += sessionCurrentTime;
          sessionCurrentTime = 0;
          saveStats();
          saveSessionState();
          lastSaveTime = now;
        }
      }
    }, 1000); // Update every second
  }

  function stopUpdateInterval() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  }

  // Track video consumption
  function trackVideo() {
    const video = document.querySelector('video');
    if (!video) return;

    let hasBeenCounted = false; // Track if this video has been counted
    let currentVideoId = null; // Track the current video to avoid double counting
    let lastPausedState = video.paused;

    // Get video ID from URL or video element
    const getVideoId = () => {
      // Try to get from URL first
      const urlMatch = window.location.href.match(/[?&]v=([^&]+)/);
      if (urlMatch) return urlMatch[1];
      
      // Try to get from video element data
      const videoSrc = video.src || video.currentSrc;
      if (videoSrc) {
        const srcMatch = videoSrc.match(/[?&]v=([^&]+)/);
        if (srcMatch) return srcMatch[1];
      }
      
      // Fallback: use current time as unique identifier
      return `temp_${Date.now()}`;
    };

    // Check video state periodically and update accordingly
    const checkVideoState = () => {
      if (!video) return;
      
      const currentlyPaused = video.paused;
      
      // If state changed, handle it
      if (currentlyPaused !== lastPausedState) {
        if (!currentlyPaused) {
          // Video started playing
          handlePlay();
        } else {
          // Video paused
          handlePause();
        }
        lastPausedState = currentlyPaused;
      }
      
      // Update pause state for UI
      isPaused = currentlyPaused;
      updateStatsDisplay();
    };

    const handlePlay = () => {
      // Check if this starts a new session
      const now = Date.now();
      if (!lastActivityTime || (now - lastActivityTime > SESSION_COOLDOWN_MS)) {
        sessionSavedTime = 0;
        sessionCurrentTime = 0;
        saveSessionState();
      }
      lastActivityTime = now;

      // Check if this is a new video (different from last one)
      const videoId = getVideoId();
      if (videoId !== currentVideoId) {
        // New video - save previous session time if any
        if (currentSessionTime > 0) {
          stats.totalTime += currentSessionTime;
          currentSessionTime = 0;
        }
        currentVideoId = videoId;
        hasBeenCounted = false;
      }

      // Note: Video/short counting is now handled by URL change detection (handleUrlChange)
      // No need to increment counters here

      // Start real-time updates
      isPaused = false;
      startUpdateInterval();
    };

    const handlePause = () => {
      // Stop real-time updates
      isPaused = true;
      stopUpdateInterval();

      // Accumulate current session time into total
      if (currentSessionTime > 0) {
        stats.totalTime += currentSessionTime;
        currentSessionTime = 0;
      }
      if (sessionCurrentTime > 0) {
        sessionSavedTime += sessionCurrentTime;
        sessionCurrentTime = 0;
      }
      saveStats();
      saveSessionState();
      updateStatsDisplay();
    };

    const handleEnded = () => {
      // Video ended - accumulate session time and stop updates
      isPaused = true;
      stopUpdateInterval();

      if (currentSessionTime > 0) {
        stats.totalTime += currentSessionTime;
        currentSessionTime = 0;
      }
      if (sessionCurrentTime > 0) {
        sessionSavedTime += sessionCurrentTime;
        sessionCurrentTime = 0;
      }
      saveStats();
      saveSessionState();
      updateStatsDisplay();
    };

    // Track when user navigates away or video element is removed
    const handleBeforeUnload = () => {
      if (currentSessionTime > 0) {
        stats.totalTime += currentSessionTime;
        currentSessionTime = 0;
      }
      if (sessionCurrentTime > 0) {
        sessionSavedTime += sessionCurrentTime;
        sessionCurrentTime = 0;
      }
      saveStats();
      saveSessionState();
    };

    // Initialize state
    if (!video.paused) {
      handlePlay();
    } else {
      isPaused = true;
      updateStatsDisplay();
    }

    // Check video state every 500ms to catch play/pause events
    const stateCheckInterval = setInterval(checkVideoState, 500);

    // Also listen to events for immediate response
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function
    return () => {
      stopUpdateInterval();
      clearInterval(stateCheckInterval);

      if (currentSessionTime > 0) {
        stats.totalTime += currentSessionTime;
        currentSessionTime = 0;
      }
      if (sessionCurrentTime > 0) {
        sessionSavedTime += sessionCurrentTime;
        sessionCurrentTime = 0;
      }
      saveStats();
      saveSessionState();

      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }

  // Save stats to storage
  function saveStats() {
    chrome.storage.local.set({ youtubeStats: stats });
  }

  // Handle URL change to track videos/shorts in hashsets
  function handleUrlChange() {
    const videoInfo = extractVideoInfo();
    if (videoInfo) {
      const { type, id } = videoInfo;
      const hashsetKey = type + 's'; // 'video' -> 'videos', 'short' -> 'shorts'
      
      // Add to hashset if not already present
      if (!stats[hashsetKey][id]) {
        stats[hashsetKey][id] = true;
        saveStats();
        updateStatsDisplay();
      }
    }
  }

  // Initialize on page load
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(init, 200);
      });
      return;
    }

    // Disable Shorts scrolling
    disableShortsScrolling();

    // Create stats display
    createStatsDisplay();

    // Track video consumption
    let cleanup = null;
    let lastVideoElement = null;
    
    const checkForVideo = () => {
      const video = document.querySelector('video');
      // Only re-track if video element actually changed
      if (video && video !== lastVideoElement) {
        if (cleanup) cleanup();
        lastVideoElement = video;
        cleanup = trackVideo();
      } else if (!video && lastVideoElement) {
        // Video was removed, cleanup
        if (cleanup) cleanup();
        cleanup = null;
        lastVideoElement = null;
        // Stop update interval and save any remaining session time
        stopUpdateInterval();
        if (currentSessionTime > 0) {
          stats.totalTime += currentSessionTime;
          currentSessionTime = 0;
          saveStats();
        }
        isPaused = true;
        updateStatsDisplay();
      }
    };
    
    const observer = new MutationObserver(() => {
      checkForVideo();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });

    // Initial tracking
    setTimeout(() => {
      checkForVideo();
    }, 1000);
    
    // Also check periodically for video changes (useful for Shorts auto-advance)
    setInterval(checkForVideo, 2000);

    // Check for daily reset periodically (every hour)
    setInterval(checkForDailyReset, 60 * 60 * 1000); // 1 hour

    // Check for session expiry every minute (handles open tab, stopped watching)
    setInterval(checkSessionExpiry, 60 * 1000);

    // Re-disable scrolling when navigating (for SPA)
    let lastUrl = location.href;
    let lastPath = location.pathname;
    new MutationObserver(() => {
      const url = location.href;
      const path = location.pathname;
      if (url !== lastUrl || path !== lastPath) {
        lastUrl = url;
        lastPath = path;
        
        // Track video/short in hashset
        handleUrlChange();
        
        // Enable scrolling if leaving Shorts, disable if entering
        if (!isShortPage()) {
          enableScrolling();
        }
        
        setTimeout(() => {
          if (isShortPage()) {
            disableShortsScrolling();
          }
          createStatsDisplay();
          checkForVideo();
        }, 1000);
      }
    }).observe(document, { subtree: true, childList: true });
    
    // Also listen to popstate for back/forward navigation
    window.addEventListener('popstate', () => {
      // Track video/short in hashset
      handleUrlChange();
      
      setTimeout(() => {
        if (isShortPage()) {
          disableShortsScrolling();
        } else {
          enableScrolling();
        }
        createStatsDisplay();
        checkForVideo();
      }, 500);
    });
    
    // Initial check for current page
    handleUrlChange();
  }

  // Start initialization after stats and session state are loaded
  checkForDailyReset().then(() => {
    return loadSessionState();
  }).then(() => {
    init();
  });
})();
