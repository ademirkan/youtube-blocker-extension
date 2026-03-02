// Doomscroll Blocker — Background Service Worker
// Handles daily reset scheduling and session expiry across all tracked sites.

const SESSION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// All sites whose stats are managed. Extend this list when adding new adapters.
const TRACKED_SITES = [
  { siteId: 'youtube', storageKey: 'youtubeStats' },
];

// ── Daily reset ───────────────────────────────────────────────────────────

function checkAndResetDaily() {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDate = now.toDateString();

  if (currentHour < 3) return; // Not yet 3 AM

  const keys = ['lastResetDates', ...TRACKED_SITES.map(s => s.storageKey)];
  chrome.storage.local.get(keys, (result) => {
    const lastResetDates = result.lastResetDates || {};
    const updates = {};
    let needsUpdate = false;

    for (const site of TRACKED_SITES) {
      if (lastResetDates[site.siteId] !== currentDate) {
        updates[site.storageKey] = { videos: {}, shorts: {}, totalTime: 0 };
        lastResetDates[site.siteId] = currentDate;
        needsUpdate = true;
        console.log(`[Doomscroll Blocker] Daily reset: ${site.siteId}`);
      }
    }

    if (needsUpdate) {
      updates.lastResetDates = lastResetDates;
      chrome.storage.local.set(updates);
    }
  });
}

// ── Session expiry ────────────────────────────────────────────────────────

function checkAndExpireSessions() {
  chrome.storage.local.get(['sessions'], (result) => {
    const sessions = result.sessions || {};
    let changed = false;

    for (const siteId of Object.keys(sessions)) {
      const s = sessions[siteId];
      if (s && s.lastActivityTime && Date.now() - s.lastActivityTime > SESSION_COOLDOWN_MS) {
        sessions[siteId] = { accumulatedTime: 0, lastActivityTime: null };
        changed = true;
      }
    }

    if (changed) chrome.storage.local.set({ sessions });
  });
}

// ── Migration: old flat keys → new nested schema ──────────────────────────

function migrateStorage() {
  chrome.storage.local.get(
    ['lastResetDate', 'sessionState', 'lastResetDates', 'sessions'],
    (result) => {
      const updates = {};

      if (result.lastResetDate && !result.lastResetDates) {
        updates.lastResetDates = { youtube: result.lastResetDate };
      }

      if (result.sessionState && !result.sessions) {
        updates.sessions = { youtube: result.sessionState };
      }

      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates);
        console.log('[Doomscroll Blocker] Migrated storage to v2 schema');
      }
    }
  );
}

// ── Lifecycle hooks ───────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'update') {
    migrateStorage();
  }

  chrome.storage.local.get(
    ['lastResetDates', ...TRACKED_SITES.map(s => s.storageKey)],
    (result) => {
      const updates = {};

      for (const site of TRACKED_SITES) {
        if (!result[site.storageKey]) {
          updates[site.storageKey] = { videos: {}, shorts: {}, totalTime: 0 };
        }
      }

      if (!result.lastResetDates) {
        const dates = {};
        for (const site of TRACKED_SITES) {
          dates[site.siteId] = new Date().toDateString();
        }
        updates.lastResetDates = dates;
      }

      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates);
      }
    }
  );

  checkAndResetDaily();

  chrome.alarms.create('hourlyCheck', { periodInMinutes: 60 });
});

chrome.runtime.onStartup.addListener(() => {
  checkAndResetDaily();
  checkAndExpireSessions();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'hourlyCheck') {
    checkAndResetDaily();
    checkAndExpireSessions();
  }
});
