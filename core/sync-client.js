// Doomscroll Blocker — Sync Client (Phase 3 stub)
// Will send stats to the background service worker for backend sync.

(function () {
  'use strict';

  window.__DSB = window.__DSB || {};

  window.__DSB.syncClient = {
    /** Push stats for a site to the background queue (no-op until Phase 3). */
    push(_siteId, _stats) {
      // Phase 3: chrome.runtime.sendMessage({ type: 'STATS_PUSH', siteId: _siteId, stats: _stats });
    },
  };
})();
