/**
 * InfoBlend AI — Lightweight Bootstrap
 * Registers event listeners. Heavy modules injected on first interaction.
 */
(() => {
  window.__ib = window.__ib || { modulesLoaded: false, _loadingPromise: null };

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

  Object.assign(window.__ib, { isContextValid, sendMessage, getStorage, setStorage });

  function ensureModules() {
    const ib = window.__ib;
    if (ib.modulesLoaded) return Promise.resolve(true);
    if (ib._loadingPromise) return ib._loadingPromise;

    ib._loadingPromise = new Promise((resolve) => {
      sendMessage({ type: 'INJECT_MODULES' }, (response) => {
        ib.modulesLoaded = !!response?.success;
        if (!ib.modulesLoaded) console.error('[InfoBlend] Module injection failed.');
        ib._loadingPromise = null;
        resolve(ib.modulesLoaded);
      });
    });
    return ib._loadingPromise;
  }

  // Ctrl+K / Cmd+K → Command Palette
  document.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (await ensureModules()) window.__ib.togglePalette();
    }
  });

  // Text selection → Auto-definition (1-2 words)
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

  // Messages from background / popup
  chrome.runtime.onMessage.addListener(async (message) => {
    const routable = ['SHOW_DEFINITION', 'SHOW_ERROR', 'SHOW_LOADING', 'SUMMARIZE_PAGE', 'SUMMARIZE_SELECTION'];
    if (routable.includes(message.type)) {
      if (await ensureModules()) window.__ib.handleMessage(message);
    }
  });
})();
