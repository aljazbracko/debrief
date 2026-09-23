import { createStore } from './store.js';

export function startDevtools(api, createCapture = createStore, lifecycle = window) {
  let store;
  // Merely opening another DevTools panel must not attach our page probe.
  api.panels.create('Debrief', 'icons/icon16.png', 'panel.html', panel => {
    panel.onShown.addListener(panelWindow => {
      if (!store) {
        try { store = createCapture(api); }
        catch {
          store = {
            entries: [], errors: [], paused: true, pageContext: false,
            status: 'Capture could not start. Reload Debrief at chrome://extensions, then close and reopen DevTools. Check the extension’s Errors button if this persists.',
            subscribe: () => () => {}, clear() {}, togglePause() {}, setPageContext() {}, close() {},
          };
        }
      }
      panelWindow.contextStore = store;
      panelWindow.dispatchEvent(new Event('context-store-ready'));
    });
  });
  lifecycle.addEventListener('pagehide', () => store?.close(), { once: true });
}

if (typeof chrome !== 'undefined' && chrome.devtools) startDevtools(chrome.devtools);
