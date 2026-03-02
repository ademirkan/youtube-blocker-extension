// Doomscroll Blocker — YouTube Adapter
// Implements the full adapter interface for youtube.com.
// Assigned to window.__DSB.adapter before content-main.js runs.

(function () {
  'use strict';

  window.__DSB = window.__DSB || {};

  // ── Shorts scroll blocking ────────────────────────────────────────────────

  let _scrollBlockActive = false;
  const _handlers = { wheel: null, keydown: null, touchmove: null };

  function _enableShortsScrollBlock() {
    if (_scrollBlockActive) return;
    _scrollBlockActive = true;

    _handlers.wheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    document.addEventListener('wheel', _handlers.wheel, { passive: false, capture: true });

    _handlers.keydown = (e) => {
      const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (scrollKeys.includes(e.key) ||
          (e.key === ' ' && tag !== 'INPUT' && tag !== 'TEXTAREA')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener('keydown', _handlers.keydown, { capture: true });

    _handlers.touchmove = (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    document.addEventListener('touchmove', _handlers.touchmove, { passive: false, capture: true });
  }

  function _disableShortsScrollBlock() {
    if (!_scrollBlockActive) return;
    _scrollBlockActive = false;

    if (_handlers.wheel) {
      document.removeEventListener('wheel', _handlers.wheel, { capture: true });
      _handlers.wheel = null;
    }
    if (_handlers.keydown) {
      document.removeEventListener('keydown', _handlers.keydown, { capture: true });
      _handlers.keydown = null;
    }
    if (_handlers.touchmove) {
      document.removeEventListener('touchmove', _handlers.touchmove, { capture: true });
      _handlers.touchmove = null;
    }
  }

  // ── Adapter interface ─────────────────────────────────────────────────────

  window.__DSB.adapter = {
    siteId: 'youtube',
    siteName: 'YouTube',
    storageKey: 'youtubeStats',

    /** Parse current URL; return { type, id } or null. */
    classifyPage() {
      const href = window.location.href;
      const shortsMatch = href.match(/\/shorts\/([^/?&]+)/);
      if (shortsMatch) return { type: 'short', id: shortsMatch[1] };
      const videoMatch = href.match(/[?&]v=([^&]+)/);
      if (videoMatch) return { type: 'video', id: videoMatch[1] };
      return null;
    },

    /**
     * Return the element the stats widget inserts before.
     * null means the header is not ready yet — content-main.js will retry.
     */
    findHeaderAnchor() {
      const selectors = [
        '#end',
        '#buttons',
        '#end-items',
        'ytd-masthead #end',
        '#masthead-container #end',
        'ytd-masthead #container #end',
        '#masthead-container #container #end',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.parentElement) return el;
      }
      return null;
    },

    findVideoElement() {
      return document.querySelector('video');
    },

    degradationLevels: [
      { minutes: 30, label: 'hide-shorts' },
      { minutes: 60, label: 'hide-sidebar' },
      { minutes: 120, label: 'hide-recommendations' },
    ],

    features: [
      {
        id: 'block-shorts-scroll',
        activateWhen: ({ pageType }) => pageType === 'short',
        enable: _enableShortsScrollBlock,
        disable: _disableShortsScrollBlock,
      },
    ],

    onInit() {},
    onUrlChange(_page) {},
  };
})();
