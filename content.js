// YouTube Doomscroll Blocker - Content Script

(function() {
  'use strict';

  // Stats tracking
  let stats = {
    videos: 0,
    shorts: 0,
    totalTime: 0 // in seconds
  };

  // Real-time tracking state
  let currentSessionTime = 0; // Time in current session (seconds)
  let isPaused = true; // Track if video is currently paused
  let updateInterval = null; // Interval for real-time updates
  let lastSaveTime = Date.now(); // Track when we last saved to storage

  // Load stats from storage
  chrome.storage.local.get(['youtubeStats'], (result) => {
    if (result.youtubeStats) {
      stats = result.youtubeStats;
      updateStatsDisplay();
    }
  });

  // Check if current page is a Short
  function isShortPage() {
    const path = window.location.pathname;
    return path === '/shorts' || path.startsWith('/shorts/');
  }

  // Format time in HH:MM:SS format (or MM:SS if < 1 hour, or SS if < 1 minute)
  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else if (mins > 0) {
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      return `${String(secs).padStart(2, '0')}s`;
    }
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
    statsContainer.innerHTML = `
      <div class="stats-item">
        <span class="stats-label">Videos:</span>
        <span class="stats-value" id="stats-videos">0</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">Shorts:</span>
        <span class="stats-value" id="stats-shorts">0</span>
      </div>
      <div class="stats-item">
        <span class="stats-label">Time:</span>
        <span class="stats-value" id="stats-time">0m</span>
      </div>
    `;

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

    updateStatsDisplay();
  }

  // Update stats display values
  function updateStatsDisplay() {
    const videosEl = document.getElementById('stats-videos');
    const shortsEl = document.getElementById('stats-shorts');
    const timeEl = document.getElementById('stats-time');

    if (videosEl) videosEl.textContent = stats.videos;
    if (shortsEl) shortsEl.textContent = stats.shorts;
    if (timeEl) {
      // Display total time + current session time
      const totalSeconds = stats.totalTime + currentSessionTime;
      timeEl.textContent = formatTime(totalSeconds);
      
      // Update pause state styling
      if (isPaused) {
        timeEl.classList.add('stats-time-paused');
      } else {
        timeEl.classList.remove('stats-time-paused');
      }
    }
  }

  // Start/stop real-time update interval
  function startUpdateInterval() {
    if (updateInterval) return; // Already running
    
    updateInterval = setInterval(() => {
      const video = document.querySelector('video');
      if (video && !video.paused) {
        // Video is playing - increment session time
        currentSessionTime++;
        updateStatsDisplay();
        
        // Periodically save to storage (every 5 seconds)
        const now = Date.now();
        if (now - lastSaveTime >= 5000) {
          // Accumulate current session time into total
          stats.totalTime += currentSessionTime;
          currentSessionTime = 0;
          saveStats();
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
      
      // Count the video/short when it starts playing (if not already counted)
      if (!hasBeenCounted) {
        const isShort = isShortPage();
        if (isShort) {
          stats.shorts++;
        } else {
          stats.videos++;
        }
        hasBeenCounted = true;
        saveStats();
        updateStatsDisplay();
      }
      
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
        saveStats();
      }
      updateStatsDisplay();
    };

    const handleEnded = () => {
      // Video ended - accumulate session time and stop updates
      isPaused = true;
      stopUpdateInterval();
      
      if (currentSessionTime > 0) {
        stats.totalTime += currentSessionTime;
        currentSessionTime = 0;
        saveStats();
      }
      updateStatsDisplay();
    };

    // Track when user navigates away or video element is removed
    const handleBeforeUnload = () => {
      // Save any accumulated time
      if (currentSessionTime > 0) {
        stats.totalTime += currentSessionTime;
        currentSessionTime = 0;
        saveStats();
      }
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
      
      // Save any remaining session time
      if (currentSessionTime > 0) {
        stats.totalTime += currentSessionTime;
        currentSessionTime = 0;
        saveStats();
      }
      
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

    // Re-disable scrolling when navigating (for SPA)
    let lastUrl = location.href;
    let lastPath = location.pathname;
    new MutationObserver(() => {
      const url = location.href;
      const path = location.pathname;
      if (url !== lastUrl || path !== lastPath) {
        lastUrl = url;
        lastPath = path;
        
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
  }

  // Start initialization
  init();
})();
