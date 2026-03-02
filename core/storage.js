// Doomscroll Blocker — Storage Module
// Single source of truth for all chrome.storage reads/writes, parameterised by siteId.

(function () {
  'use strict';

  window.__DSB = window.__DSB || {};

  const SESSION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

  // In-memory state
  let _siteId = null;
  let _storageKey = null;
  let _stats = { videos: {}, shorts: {}, totalTime: 0 };
  let _session = { accumulatedTime: 0, lastActivityTime: null };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _migrateStats(old) {
    if (typeof old.videos === 'number' || typeof old.shorts === 'number') {
      return { videos: {}, shorts: {}, totalTime: old.totalTime || 0 };
    }
    return {
      videos: old.videos || {},
      shorts: old.shorts || {},
      totalTime: old.totalTime || 0,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.__DSB.storage = {
    SESSION_COOLDOWN_MS,

    /**
     * Load stats + session state for this site from chrome.storage.
     * Also performs the daily 3 AM reset if needed.
     * Returns a Promise that resolves when everything is ready.
     */
    load(storageKey, siteId) {
      _siteId = siteId;
      _storageKey = storageKey;

      return new Promise((resolve) => {
        chrome.storage.local.get(
          ['lastResetDates', 'lastResetDate', storageKey, 'sessions', 'sessionState'],
          (result) => {
            const now = new Date();
            const currentDate = now.toDateString();

            // ── Daily reset ─────────────────────────────────────────────
            // Migrate old flat lastResetDate → nested lastResetDates
            let lastResetDates = result.lastResetDates || {};
            if (!lastResetDates[siteId] && result.lastResetDate) {
              lastResetDates[siteId] = result.lastResetDate;
            }

            const shouldReset =
              now.getHours() >= 3 && lastResetDates[siteId] !== currentDate;

            if (shouldReset) {
              _stats = { videos: {}, shorts: {}, totalTime: 0 };
              _session = { accumulatedTime: 0, lastActivityTime: null };
              lastResetDates[siteId] = currentDate;
              const update = { lastResetDates };
              update[storageKey] = _stats;
              update.sessions = _buildSessionsUpdate(result.sessions, siteId, _session);
              chrome.storage.local.set(update);
            } else {
              // Load existing stats
              if (result[storageKey]) {
                _stats = _migrateStats(result[storageKey]);
              }

              // ── Session state ──────────────────────────────────────────
              // Migrate old flat sessionState → nested sessions
              let sessions = result.sessions || {};
              if (!sessions[siteId] && result.sessionState) {
                sessions[siteId] = result.sessionState;
              }

              const stored = sessions[siteId];
              if (stored && stored.lastActivityTime) {
                const elapsed = Date.now() - stored.lastActivityTime;
                if (elapsed < SESSION_COOLDOWN_MS) {
                  _session = {
                    accumulatedTime: stored.accumulatedTime || 0,
                    lastActivityTime: stored.lastActivityTime,
                  };
                } else {
                  // Session expired while away — start fresh
                  _session = { accumulatedTime: 0, lastActivityTime: null };
                  sessions[siteId] = _session;
                  chrome.storage.local.set({ sessions });
                }
              }
            }

            resolve();
          }
        );
      });
    },

    // ── Reads ──────────────────────────────────────────────────────────────

    getStats() {
      return _stats;
    },

    getSession() {
      return _session;
    },

    /**
     * Returns session minutes for engine evaluation.
     * If window.__DSB_TEST.sessionMinutes is set, returns that override instead.
     * Usage: window.__DSB_TEST = { sessionMinutes: 45 }
     */
    getSessionMinutes() {
      const test = window.__DSB_TEST;
      if (test && typeof test.sessionMinutes === 'number') return test.sessionMinutes;
      const tracker = window.__DSB.timeTracker;
      const unflushed = tracker ? tracker.currentTime : 0;
      return ((_session.accumulatedTime || 0) + unflushed) / 60;
    },

    // ── Writes ─────────────────────────────────────────────────────────────

    /** Add a content item (video/short/post) to the deduplication hashset. */
    recordContent(type, id) {
      const key = type + 's'; // 'video' → 'videos', 'short' → 'shorts'
      if (!_stats[key]) _stats[key] = {};
      if (!_stats[key][id]) {
        _stats[key][id] = true;
        this.saveStats();
        return true; // newly added
      }
      return false;
    },

    addTime(seconds) {
      _stats.totalTime += seconds;
    },

    addSessionTime(seconds) {
      _session.accumulatedTime = (_session.accumulatedTime || 0) + seconds;
    },

    refreshActivity() {
      _session.lastActivityTime = Date.now();
    },

    resetSession() {
      _session = { accumulatedTime: 0, lastActivityTime: null };
    },

    saveStats() {
      const update = {};
      update[_storageKey] = _stats;
      chrome.storage.local.set(update);
    },

    saveSession() {
      chrome.storage.local.get(['sessions'], (result) => {
        const sessions = _buildSessionsUpdate(result.sessions, _siteId, _session);
        chrome.storage.local.set({ sessions });
      });
    },

    /**
     * Expire session if cooldown has elapsed since last activity.
     * Returns true if session was expired.
     */
    checkSessionExpiry() {
      if (_session.lastActivityTime &&
          Date.now() - _session.lastActivityTime > SESSION_COOLDOWN_MS) {
        _session = { accumulatedTime: 0, lastActivityTime: null };
        this.saveSession();
        return true;
      }
      return false;
    },
  };

  function _buildSessionsUpdate(existing, siteId, sessionData) {
    const sessions = existing || {};
    sessions[siteId] = sessionData;
    return sessions;
  }
})();
