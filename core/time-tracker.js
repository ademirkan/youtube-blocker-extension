// Doomscroll Blocker — Time Tracker
// Manages the 1-second tick interval and attaches/detaches from a video element.
// Stores unflushed seconds in-memory; flushes to storage every 5 seconds.

(function () {
  'use strict';

  window.__DSB = window.__DSB || {};

  let _interval = null;
  let _unflushed = 0;        // seconds accumulated since last flush
  let _isPaused = true;
  let _lastSaveTime = Date.now();
  let _lastVideoElement = null;
  let _videoCleanup = null;
  let _tickCallback = null;  // called each second while playing, and on pause/play events

  // ── Internal ──────────────────────────────────────────────────────────────

  function _startInterval() {
    if (_interval) return;
    _interval = setInterval(() => {
      const storage = window.__DSB.storage;
      _unflushed++;
      storage.refreshActivity();

      if (_tickCallback) _tickCallback();

      // Flush to storage every 5 seconds
      const now = Date.now();
      if (now - _lastSaveTime >= 5000) {
        _flush();
        _lastSaveTime = now;
      }
    }, 1000);
  }

  function _stopInterval() {
    if (_interval) {
      clearInterval(_interval);
      _interval = null;
    }
  }

  function _flush() {
    if (_unflushed === 0) return;
    const storage = window.__DSB.storage;
    storage.addTime(_unflushed);
    storage.addSessionTime(_unflushed);
    _unflushed = 0;
    storage.saveStats();
    storage.saveSession();
  }

  function _detach() {
    if (_videoCleanup) {
      _videoCleanup();
      _videoCleanup = null;
    }
    _stopInterval();
    _flush();
    _lastVideoElement = null;
    _isPaused = true;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.__DSB.timeTracker = {
    get isPaused() { return _isPaused; },
    get currentTime() { return _unflushed; },

    /** Register a callback invoked on each tick and on play/pause transitions. */
    setTickCallback(fn) {
      _tickCallback = fn;
    },

    /**
     * Attach to a video element. Idempotent — safe to call with the same element.
     * Automatically detaches from any previously attached element.
     */
    attachVideo(video) {
      if (!video || video === _lastVideoElement) return;
      _detach();
      _lastVideoElement = video;

      const storage = window.__DSB.storage;
      const SESSION_COOLDOWN_MS = storage.SESSION_COOLDOWN_MS;

      const handlePlay = () => {
        const session = storage.getSession();
        const now = Date.now();
        if (!session.lastActivityTime || now - session.lastActivityTime > SESSION_COOLDOWN_MS) {
          storage.resetSession();
          storage.saveSession();
        }
        storage.refreshActivity();
        _isPaused = false;
        _startInterval();
        if (_tickCallback) _tickCallback();
      };

      const handlePause = () => {
        _isPaused = true;
        _stopInterval();
        _flush();
        if (_tickCallback) _tickCallback();
      };

      const handleEnded = () => {
        _isPaused = true;
        _stopInterval();
        _flush();
        if (_tickCallback) _tickCallback();
      };

      const handleBeforeUnload = () => {
        _flush();
      };

      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('ended', handleEnded);
      window.addEventListener('beforeunload', handleBeforeUnload);

      _videoCleanup = () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('ended', handleEnded);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };

      // Sync initial state
      if (!video.paused) {
        handlePlay();
      } else {
        _isPaused = true;
        if (_tickCallback) _tickCallback();
      }
    },

    detachVideo() {
      _detach();
      if (_tickCallback) _tickCallback();
    },

    /** Force a flush without detaching (e.g. on page hide). */
    flush() {
      _flush();
    },
  };
})();
