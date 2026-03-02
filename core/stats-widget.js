// Doomscroll Blocker — Stats Widget
// Creates and updates the header stats display.
// The adapter provides findHeaderAnchor() for DOM placement.

(function () {
  'use strict';

  window.__DSB = window.__DSB || {};

  const WIDGET_ID = 'dsb-stats-widget';

  function _formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs >= 1) return `${hrs}h${String(mins).padStart(2, '0')}m`;
    if (mins >= 1) return `${mins}m`;
    return `${secs}s`;
  }

  async function _loadSVGIcon(iconName, container) {
    try {
      const url = chrome.runtime.getURL(`icons/${iconName}`);
      const response = await fetch(url);
      if (!response.ok) return;
      const svgText = await response.text();
      if (!svgText) return;
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      if (svgDoc.querySelector('parsererror')) return;
      const svgEl = svgDoc.documentElement;
      if (!svgEl || svgEl.tagName !== 'svg') return;
      svgEl.setAttribute('class', 'stats-icon');
      svgEl.setAttribute('width', '16');
      svgEl.setAttribute('height', '16');
      container.innerHTML = '';
      container.appendChild(svgEl);
    } catch (_) {
      // Silently skip icon load failures
    }
  }

  function _insertWidget(container, adapter) {
    const anchor = adapter.findHeaderAnchor();
    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(container, anchor);
      return true;
    }
    if (document.body) {
      document.body.insertBefore(container, document.body.firstChild);
      return true;
    }
    return false;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.__DSB.statsWidget = {
    /**
     * Create the widget DOM and insert it via the adapter's anchor.
     * Removes any existing widget first (safe to call on SPA navigation).
     */
    create(adapter) {
      const existing = document.getElementById(WIDGET_ID);
      if (existing) existing.remove();

      const container = document.createElement('div');
      container.id = WIDGET_ID;
      container.innerHTML = `
        <div class="stats-col">
          <div class="stats-item">
            <span class="stats-icon-container" id="dsb-icon-videos"></span>
            <span class="stats-value" id="dsb-stat-videos">0</span>
          </div>
          <div class="stats-item">
            <span class="stats-icon-container" id="dsb-icon-shorts"></span>
            <span class="stats-value" id="dsb-stat-shorts">0</span>
          </div>
        </div>
        <div class="stats-col stats-col--times">
          <div class="stats-item">
            <span class="stats-label">Session</span>
            <span class="stats-value" id="dsb-stat-session">0s</span>
          </div>
          <div class="stats-item">
            <span class="stats-label">Today</span>
            <span class="stats-value" id="dsb-stat-today">0s</span>
          </div>
        </div>
      `;

      _insertWidget(container, adapter);

      // Load SVG icons after the element is in the DOM
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const iconVideos = document.getElementById('dsb-icon-videos');
          const iconShorts = document.getElementById('dsb-icon-shorts');
          if (iconVideos) _loadSVGIcon('video-icon.svg', iconVideos);
          if (iconShorts) _loadSVGIcon('shorts-icon.svg', iconShorts);
        });
      });

      this.update();
    },

    /** Update stat values in the existing widget (no DOM restructuring). */
    update() {
      const storage = window.__DSB.storage;
      const tracker = window.__DSB.timeTracker;

      const stats = storage.getStats();
      const session = storage.getSession();
      const unflushed = tracker ? tracker.currentTime : 0;
      const isPaused = tracker ? tracker.isPaused : true;

      const videoCount = Object.keys(stats.videos || {}).length;
      const shortsCount = Object.keys(stats.shorts || {}).length;
      const totalSeconds = stats.totalTime + unflushed;
      const sessionSeconds = (session.accumulatedTime || 0) + unflushed;

      const setEl = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      const togglePaused = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('stats-time-paused', isPaused);
      };

      setEl('dsb-stat-videos', videoCount);
      setEl('dsb-stat-shorts', shortsCount);
      setEl('dsb-stat-today', _formatTime(totalSeconds));
      setEl('dsb-stat-session', _formatTime(sessionSeconds));
      togglePaused('dsb-stat-today');
      togglePaused('dsb-stat-session');
    },
  };
})();
