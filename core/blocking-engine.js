// Doomscroll Blocker — Blocking Engine
// Manages the enable/disable lifecycle of JS-based blocking features defined in each adapter.
// Re-evaluated on every URL change and every session time tick.

(function () {
  'use strict';

  window.__DSB = window.__DSB || {};

  const _active = new Set(); // currently enabled feature IDs

  window.__DSB.blockingEngine = {
    /**
     * Evaluate all features for the adapter against current page + session context.
     * Enables or disables each feature as needed.
     */
    evaluate(adapter, page) {
      const storage = window.__DSB.storage;

      const sessionMinutes = storage.getSessionMinutes();
      const pageType = page ? page.type : null;

      for (const feature of (adapter.features || [])) {
        const shouldBeActive = feature.activateWhen({ pageType, sessionMinutes });
        const isActive = _active.has(feature.id);

        if (shouldBeActive && !isActive) {
          feature.enable();
          _active.add(feature.id);
        } else if (!shouldBeActive && isActive) {
          feature.disable();
          _active.delete(feature.id);
        }
      }
    },

    /** Disable all currently active features (e.g. on unload or site switch). */
    disableAll(adapter) {
      for (const feature of (adapter.features || [])) {
        if (_active.has(feature.id)) {
          feature.disable();
          _active.delete(feature.id);
        }
      }
    },
  };
})();
