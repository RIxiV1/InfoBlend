/**
 * InfoBlend AI — Bootstrap
 * Registers listeners. Modules injected on first interaction.
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
      sendMessage({ type: 'INJECT_MODULES' }, (response) => {
        ib.modulesLoaded = !!response?.success;
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

  // Text selection → Tooltip definition near the word
  document.addEventListener('mouseup', async (event) => {
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host')) return;

    const sel = window.getSelection();
    const text = sel.toString().trim();
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

    if (text && wordCount > 0 && wordCount <= 2 && text.length < 50) {
      const settings = await getStorage(['definitionsEnabled']);
      if (settings.definitionsEnabled !== false) {
        // Capture position of the selected word BEFORE any async work
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const anchor = {
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8,
          mode: 'tooltip'
        };

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
      }
    }
  });

  // Messages from background / popup (summaries use centered mode)
  // Not async — async listeners cause "message channel closed" warnings in Chrome
  chrome.runtime.onMessage.addListener((message) => {
    const routable = ['SHOW_DEFINITION', 'SHOW_ERROR', 'SHOW_LOADING', 'SUMMARIZE_PAGE', 'SUMMARIZE_SELECTION'];
    if (routable.includes(message.type)) {
      ensureModules().then(ok => { if (ok) window.__ib.handleMessage(message); });
    }
  });
})();
