/**
 * InfoBlend AI — Bootstrap
 * Double-click → single word definition.
 * Select 2-3 words → compound term definition (debounced, cancelled by dblclick).
 * Ctrl+K → command palette.
 */
(() => {
  window.__ib = window.__ib || { modulesLoaded: false, _loadingPromise: null };

  const sendMessage = async (msg, cb) => {
    try {
      if (!chrome.runtime?.id) { cb?.({ success: false, error: 'Context invalidated' }); return; }
      const response = await chrome.runtime.sendMessage(msg);
      cb?.(response);
    } catch (e) {
      cb?.({ success: false, error: e.message || 'Context Invalid' });
    }
  };

  const getStorage = async (keys) => (await chrome.storage.local.get(keys)) || {};

  Object.assign(window.__ib, { sendMessage, getStorage });

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

  async function triggerDefinition(text, rect) {
    const settings = await getStorage(['definitionsEnabled']);
    if (settings.definitionsEnabled === false) return;

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
  }

  // Ctrl+K → Command Palette
  document.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (await ensureModules()) window.__ib.togglePalette();
    }
  });

  // --- Selection handling: dblclick for single words, debounced mouseup for compound terms ---
  // Mouseup is debounced by 300ms. If a dblclick fires within that window, the mouseup is cancelled.
  let mouseupTimer = null;

  document.addEventListener('dblclick', async (event) => {
    // Cancel any pending compound-term lookup
    clearTimeout(mouseupTimer);

    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host')) return;
    const sel = window.getSelection();
    const text = sel.toString().trim();
    if (!text || text.length > 40 || text.includes(' ')) return;

    triggerDefinition(text, sel.getRangeAt(0).getBoundingClientRect());
  });

  document.addEventListener('mouseup', (event) => {
    clearTimeout(mouseupTimer);
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host')) return;

    // Delay to let dblclick fire and cancel if needed
    mouseupTimer = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (!text) return;

      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount < 2 || wordCount > 3 || text.length > 60) return;

      triggerDefinition(text, sel.getRangeAt(0).getBoundingClientRect());
    }, 300);
  });

  // Messages from background / popup
  chrome.runtime.onMessage.addListener((message) => {
    const routable = ['SHOW_DEFINITION', 'SHOW_ERROR', 'SHOW_LOADING', 'SUMMARIZE_PAGE', 'SUMMARIZE_SELECTION'];
    if (routable.includes(message.type)) {
      ensureModules().then(ok => { if (ok) window.__ib.handleMessage(message); });
    }
  });
})();
