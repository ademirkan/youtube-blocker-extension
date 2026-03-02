// Doomscroll Blocker — Test Bridge (runs in MAIN world)
// Exposes __DSB.test in the page context so it's accessible from the DevTools console.
// Forwards calls to the isolated-world listener in content-main.js via postMessage.
//
// Usage:
//   __DSB.test.setMinutes(45)   → forces 45 min session, re-evaluates engines
//   __DSB.test.setMinutes(0)    → clears override, restores real session time
//   __DSB.test.getMinutes()     → logs current effective session minutes
//   __DSB.test.evaluate()       → force engine re-evaluation

window.__DSB = window.__DSB || {};
window.__DSB.test = {
  setMinutes(n) { window.postMessage({ __dsbCmd: true, cmd: 'setMinutes', value: n }, '*'); },
  getMinutes()  { window.postMessage({ __dsbCmd: true, cmd: 'getMinutes' }, '*'); },
  evaluate()    { window.postMessage({ __dsbCmd: true, cmd: 'evaluate' }, '*'); },
};

console.log('[DSB] Test helpers ready → __DSB.test.setMinutes(45)');
