/**
 * InfoBlend AI — Lightweight Bootstrap
 * ~80 lines. Only registers event listeners.
 * Heavy modules (UI, palette, autofill) are injected on first user interaction
 * via chrome.scripting.executeScript in the background service worker.
 */
(() => {
  // Shared namespace for dynamically injected modules
  window.__ib = window.__ib || {
    modulesLoaded: false,
    _loadingPromise: null
  };

  const isContextValid = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); }
    catch { return false; }
  };

  const sendMessage = async (msg, cb) => {
    try {
      if (!isContextValid()) { cb?.({ success: false, error: 'Context invalidated' }); return; }
      const response = await chrome.runtime.sendMessage(msg);
      cb?.(response);
    } catch (e) {
      console.warn('[InfoBlend] Messaging error:', e.message);
      cb?.({ success: false, error: e.message || 'Context Invalid' });
    }
  };

  const getStorage = async (keys) => (await chrome.storage.local.get(keys)) || {};
  const setStorage = async (data) => chrome.storage.local.set(data);

  // Expose shared utilities to injected modules
  Object.assign(window.__ib, { isContextValid, sendMessage, getStorage, setStorage });

  /**
   * Lazily injects heavy modules on first user interaction.
   * Subsequent calls resolve instantly. Concurrent calls share the same promise.
   */
  function ensureModules() {
    const ib = window.__ib;
    if (ib.modulesLoaded) return Promise.resolve(true);
    if (ib._loadingPromise) return ib._loadingPromise;

    ib._loadingPromise = new Promise((resolve) => {
      sendMessage({ type: 'INJECT_MODULES' }, (response) => {
        if (response?.success) {
          ib.modulesLoaded = true;
          resolve(true);
        } else {
          console.error('[InfoBlend] Module injection failed.');
          resolve(false);
        }
        ib._loadingPromise = null;
      });
    });
    return ib._loadingPromise;
  }

  // --- Event Listeners (the only code that runs on every page) ---

  // Ctrl+K / Cmd+K → Command Palette
  document.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (await ensureModules()) window.__ib.togglePalette();
    }
  });

  // Text selection → Auto-definition (1-2 words only)
  document.addEventListener('mouseup', async (event) => {
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host')) return;

    const selection = window.getSelection().toString().trim();
    const wordCount = selection.split(/\s+/).filter(w => w.length > 0).length;

    if (selection && wordCount > 0 && wordCount <= 2 && selection.length < 50) {
      const settings = await getStorage(['definitionsEnabled']);
      if (settings.definitionsEnabled !== false) {
        if (await ensureModules()) {
          window.__ib.showLoadingOverlay();
          sendMessage({ type: 'FETCH_DEFINITION', word: selection }, (response) => {
            if (response?.success) {
              window.__ib.updateOverlay(response.data.title, response.data.content, response.data.source, response.data);
            } else {
              window.__ib.updateOverlay('Notice', response?.error || 'No definition found.', 'InfoBlend');
            }
          });
        }
      }
    }
  });

  // Messages from background script or popup
  chrome.runtime.onMessage.addListener(async (message) => {
    const routableTypes = ['SHOW_DEFINITION', 'SHOW_ERROR', 'SHOW_LOADING', 'SUMMARIZE_PAGE', 'SUMMARIZE_SELECTION'];
    if (routableTypes.includes(message.type)) {
      if (await ensureModules()) window.__ib.handleMessage(message);
    }
  });

  // Lazy autofill — only inject modules if autofill is actually enabled
  getStorage(['autofillEnabled']).then(async (settings) => {
    if (settings.autofillEnabled) {
      if (await ensureModules()) window.__ib.autofillForms?.();
    }
  });
})();
