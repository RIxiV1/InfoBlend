/**
 * InfoBlend AI — Bootstrap
 * Double-click a word → definition tooltip.
 * Ctrl+K → command palette.
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
      sendMessage({ type: 'INJECT_MODULES' }, (r) => {
        ib.modulesLoaded = !!r?.success;
        ib._loadingPromise = null;
        resolve(ib.modulesLoaded);
      });
    });
    return ib._loadingPromise;
  }

  // Ctrl+K → Command Palette
  document.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (await ensureModules()) window.__ib.togglePalette();
    }
  });

  // Double-click a word → definition tooltip
  document.addEventListener('dblclick', async (event) => {
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host')) return;

    const sel = window.getSelection();
    const text = sel.toString().trim();

    // Double-click selects exactly one word — validate it's a real word
    if (!text || text.length > 40 || text.includes(' ')) return;

    const settings = await getStorage(['definitionsEnabled']);
    if (settings.definitionsEnabled === false) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const anchor = { x: rect.left + rect.width / 2, y: rect.bottom + 8, mode: 'tooltip' };

    if (await ensureModules()) {
      window.__ib.showLoadingOverlay(anchor);
      sendMessage({ type: 'FETCH_DEFINITION', word: text }, (response) => {
        if (response?.success) {
          window.__ib.updateOverlay(response.data.title, response.data.content, response.data.source, response.data);
        } else {
          window.__ib.updateOverlay('Notice', response?.error || 'No definition found.', 'InfoBlend');
        }
      });
    }
  });

  // Messages from background / popup
  chrome.runtime.onMessage.addListener((message) => {
    const routable = ['SHOW_DEFINITION', 'SHOW_ERROR', 'SHOW_LOADING', 'SUMMARIZE_PAGE', 'SUMMARIZE_SELECTION'];
    if (routable.includes(message.type)) {
      ensureModules().then(ok => { if (ok) window.__ib.handleMessage(message); });
    }
  });
})();
