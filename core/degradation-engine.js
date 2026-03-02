// Doomscroll Blocker — Degradation Engine
// Sets a single data-dsb-level attribute on <html> based on session minutes.
// All visual changes are handled by CSS rules in styles/degradation.css.

(function () {
  'use strict';

  window.__DSB = window.__DSB || {};

  let _currentAttr = null;

  window.__DSB.degradationEngine = {
    /**
     * Re-evaluate the current degradation level for the adapter and update
     * the data-dsb-level attribute on <html> if it has changed.
     */
    evaluate(adapter) {
      const storage = window.__DSB.storage;

      const minutes = storage.getSessionMinutes();

      const levels = adapter.degradationLevels || [];

      let active = null;
      for (const level of levels) {
        if (minutes >= level.minutes) active = level;
      }

      const newAttr = active ? `${adapter.siteId}-${active.label}` : null;

      if (newAttr !== _currentAttr) {
        _currentAttr = newAttr;
        if (newAttr) {
          document.documentElement.setAttribute('data-dsb-level', newAttr);
        } else {
          document.documentElement.removeAttribute('data-dsb-level');
        }
        if (adapter.onDegradationLevelChange) {
          adapter.onDegradationLevelChange(active);
        }
      }
    },
  };
})();
