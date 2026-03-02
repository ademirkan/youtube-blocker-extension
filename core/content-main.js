// Doomscroll Blocker — Content Script Entry Point
// Always loaded last via the manifest js array.
// Boots the adapter and wires all engines together.

(function () {
  'use strict';

  const dsb               = window.__DSB;
  const adapter           = dsb.adapter;
  const storage           = dsb.storage;
  const timeTracker       = dsb.timeTracker;
  const statsWidget       = dsb.statsWidget;
  const degradationEngine = dsb.degradationEngine;
  const blockingEngine    = dsb.blockingEngine;

  let _currentPage = null;
  let _lastVideoElement = null;

  // ── Tick callback (called every second while playing, and on play/pause) ──

  function _onTick() {
    _evaluate();
  }

  // ── URL change handling ───────────────────────────────────────────────────

  function _onUrlChange() {
    const page = adapter.classifyPage();
    _currentPage = page;

    // Record video/short into the deduplication hashset
    if (page) {
      storage.recordContent(page.type, page.id);
    }

    // Re-evaluate both engines immediately (page type may have changed)
    _evaluate();

    // Recreate the widget and recheck the video element after SPA rendering
    setTimeout(() => {
      _ensureWidget();
      statsWidget.update();
      _checkForVideo();
    }, 1000);

    if (adapter.onUrlChange) adapter.onUrlChange(page);
  }

  // ── Video element tracking ────────────────────────────────────────────────

  function _checkForVideo() {
    const video = adapter.findVideoElement();
    if (video && video !== _lastVideoElement) {
      _lastVideoElement = video;
      timeTracker.attachVideo(video);
    } else if (!video && _lastVideoElement) {
      _lastVideoElement = null;
      timeTracker.detachVideo();
      statsWidget.update();
    }
  }

  // ── Widget insertion with retry ───────────────────────────────────────────

  function _ensureWidget() {
    const existing = document.getElementById('dsb-stats-widget');
    if (existing) return; // already present
    const anchor = adapter.findHeaderAnchor();
    if (anchor) {
      statsWidget.create(adapter);
    } else {
      // Header not ready yet — retry shortly
      setTimeout(_ensureWidget, 500);
    }
  }

  // ── SPA navigation detection ──────────────────────────────────────────────

  function _setupUrlChangeDetection() {
    let lastUrl = location.href;

    // MutationObserver catches YouTube's pushState-based navigation
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        _onUrlChange();
      }
    }).observe(document, { subtree: true, childList: true });

    // Also handle back/forward navigation
    window.addEventListener('popstate', () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        _onUrlChange();
      }
    });
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  function _init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(_init, 200));
      return;
    }

    if (adapter.onInit) adapter.onInit();

    // Wire tick callback before any video attaches
    timeTracker.setTickCallback(_onTick);

    // Insert stats widget (with retry until header is ready)
    _ensureWidget();

    // Classify initial page and evaluate engines
    _currentPage = adapter.classifyPage();
    if (_currentPage) storage.recordContent(_currentPage.type, _currentPage.id);
    _evaluate();

    // Start tracking any video already on the page
    setTimeout(_checkForVideo, 1000);
    setInterval(_checkForVideo, 2000);

    // Session expiry check (every minute)
    setInterval(() => {
      if (storage.checkSessionExpiry()) _evaluate();
    }, 60 * 1000);

    // Daily reset check (every hour, in addition to background.js alarms)
    setInterval(() => {
      storage.load(adapter.storageKey, adapter.siteId).then(_evaluate);
    }, 60 * 60 * 1000);

    // Re-insert widget if YouTube's SPA removes it
    new MutationObserver(() => {
      if (!document.getElementById('dsb-stats-widget')) {
        _ensureWidget();
      }
    }).observe(document.body, { childList: true, subtree: false });

    _setupUrlChangeDetection();

    // Track page visibility to flush on tab hide
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) timeTracker.flush();
    });
  }

  // ── Test helpers ──────────────────────────────────────────────────────────
  // Content scripts run in an isolated JS world where chrome.* APIs work but
  // the DevTools console can't reach window.__DSB directly.
  // Solution: inject a thin proxy into the page world that forwards calls via
  // postMessage to this isolated-world listener.
  //
  // Usage from the DevTools console (no context switching needed):
  //   __DSB.test.setMinutes(45)   → forces 45 min session, re-evaluates engines
  //   __DSB.test.setMinutes(0)    → clears override, restores real session time
  //   __DSB.test.getMinutes()     → logs current effective session minutes
  //   __DSB.test.evaluate()       → force engine re-evaluation

  // Isolated-world side: handle commands received via postMessage
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__dsbCmd !== true) return;
    const { cmd, value } = e.data;
    if (cmd === 'setMinutes') {
      if (value === 0 || value == null) {
        delete window.__DSB_TEST;
      } else {
        window.__DSB_TEST = { sessionMinutes: value };
      }
      _evaluate();
      console.log(`[DSB test] sessionMinutes override → ${value ?? 'cleared'}`);
    } else if (cmd === 'getMinutes') {
      console.log(`[DSB test] sessionMinutes = ${storage.getSessionMinutes()}`);
    } else if (cmd === 'evaluate') {
      _evaluate();
    }
  });


  function _evaluate() {
    statsWidget.update();
    degradationEngine.evaluate(adapter);
    blockingEngine.evaluate(adapter, _currentPage);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  storage.load(adapter.storageKey, adapter.siteId).then(_init);
})();
