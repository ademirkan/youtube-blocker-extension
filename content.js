// YouTube Doomscroll Blocker - Content Script

(function() {
  'use strict';

  // Stats tracking
  let stats = {
    videos: 0,
    shorts: 0,
    totalTime: 0 // in seconds
  };

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

    // Try multiple strategies to find the right place in YouTube header
    const selectors = [
      'ytd-masthead #container',
      'ytd-masthead #content',
      '#masthead-container #container',
      'ytd-masthead',
      '#masthead-container'
    ];

    let inserted = false;
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        // Try to insert after the logo/search area
        const searchContainer = element.querySelector('#search-container, ytd-searchbox');
        if (searchContainer && searchContainer.parentElement) {
          searchContainer.parentElement.appendChild(statsContainer);
          inserted = true;
          break;
        } else {
          // Fallback: append to the element
          element.appendChild(statsContainer);
          inserted = true;
          break;
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
      const minutes = Math.floor(stats.totalTime / 60);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) {
        timeEl.textContent = `${hours}h ${minutes % 60}m`;
      } else {
        timeEl.textContent = `${minutes}m`;
      }
    }
  }

  // Track video consumption
  function trackVideo() {
    const video = document.querySelector('video');
    if (!video) return;

    const isShort = isShortPage();
    let startTime = Date.now();
    let wasPlaying = false;

    const handlePlay = () => {
      if (!wasPlaying) {
        wasPlaying = true;
        startTime = Date.now();
      }
    };

    const handlePause = () => {
      if (wasPlaying) {
        const watchTime = Math.floor((Date.now() - startTime) / 1000);
        stats.totalTime += watchTime;
        wasPlaying = false;
        saveStats();
        updateStatsDisplay();
      }
    };

    const handleEnded = () => {
      if (wasPlaying) {
        const watchTime = Math.floor((Date.now() - startTime) / 1000);
        stats.totalTime += watchTime;
        wasPlaying = false;
        
        if (isShort) {
          stats.shorts++;
        } else {
          stats.videos++;
        }
        
        saveStats();
        updateStatsDisplay();
      }
    };

    // Track when user navigates away
    const handleBeforeUnload = () => {
      if (wasPlaying) {
        const watchTime = Math.floor((Date.now() - startTime) / 1000);
        stats.totalTime += watchTime;
        saveStats();
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function
    return () => {
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
        setTimeout(init, 1000);
      });
      return;
    }

    // Disable Shorts scrolling
    disableShortsScrolling();

    // Create stats display
    createStatsDisplay();

    // Track video consumption
    let cleanup = null;
    const observer = new MutationObserver(() => {
      if (cleanup) cleanup();
      cleanup = trackVideo();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial tracking
    setTimeout(() => {
      cleanup = trackVideo();
    }, 2000);

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
          if (cleanup) cleanup();
          cleanup = trackVideo();
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
        if (cleanup) cleanup();
        cleanup = trackVideo();
      }, 500);
    });
  }

  // Start initialization
  init();
})();
