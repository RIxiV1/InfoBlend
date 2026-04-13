/**
 * InfoBlend — Bootstrap
 * Double-click → word/phrase definition (with context).
 * Select text → floating "Define" button for multi-word.
 * Ctrl+K → command palette.
 */
(() => {
  // After extension reload, old __ib may have stale flags but missing functions
  if (window.__ib && (
    typeof window.__ib.showLoadingOverlay !== 'function' ||
    typeof window.__ib.togglePalette !== 'function' ||
    typeof window.__ib.handleMessage !== 'function'
  )) {
    window.__ib.modulesLoaded = false;
    window.__ib._loadingPromise = null;
  }
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

  let _defTimer = null;
  let _defineBtn = null;

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

  // Detect if the page area around the selection is light or dark
  function detectPageTheme(x, y) {
    let el = document.elementFromPoint(x, y);
    while (el && el !== document.documentElement) {
      const bg = window.getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        const match = bg.match(/\d+/g);
        if (match) {
          const [r, g, b] = match.map(Number);
          return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? 'light' : 'dark';
        }
      }
      el = el.parentElement;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Extract surrounding context (sentence or nearby text) for the selected word
  function extractContext(selection) {
    if (!selection.rangeCount) return '';
    const range = selection.getRangeAt(0);
    let container = range.startContainer;
    // Walk up to the nearest block-level element (p, div, li, etc.)
    while (container && container.nodeType !== 1) container = container.parentNode;
    if (!container) return '';
    const blockEls = ['P', 'DIV', 'LI', 'TD', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
    while (container && !blockEls.includes(container.tagName)) {
      container = container.parentElement;
    }
    const fullText = (container || range.startContainer.parentElement)?.innerText || '';
    // Return up to 300 chars of surrounding context
    return fullText.substring(0, 300).trim();
  }

  async function triggerDefinition(text, rect, context) {
    const settings = await getStorage(['definitionsEnabled']);
    if (settings.definitionsEnabled === false) return;

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const anchor = { x: cx, y: rect.bottom + 8, mode: 'tooltip', pageTheme: detectPageTheme(cx, cy) };
    if (await ensureModules()) {
      window.__ib.showLoadingOverlay(anchor);
      const msg = { type: 'FETCH_DEFINITION', word: text };
      if (context) msg.context = context;
      sendMessage(msg, (response) => {
        if (response?.success) {
          window.__ib.updateOverlay(response.data.title, response.data.content, response.data.source, response.data);
        } else {
          window.__ib.updateOverlay('Notice', response?.error || 'No definition found.', 'InfoBlend');
        }
      });
    }
  }

  // --- Floating "Define" button for multi-word selections ---
  function removeDefineBtn() {
    if (_defineBtn) {
      _defineBtn.remove();
      _defineBtn = null;
    }
  }

  function showDefineBtn(rect, text, context) {
    removeDefineBtn();
    const btn = document.createElement('button');
    btn.textContent = 'Define';
    btn.setAttribute('aria-label', `Define "${text.substring(0, 20)}"`);
    Object.assign(btn.style, {
      position: 'fixed',
      top: `${rect.bottom + 6}px`,
      left: `${rect.left + rect.width / 2 - 32}px`,
      zIndex: '2147483647',
      padding: '4px 12px',
      fontSize: '12px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      fontWeight: '600',
      color: '#fff',
      background: '#5e9cff',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      transition: 'opacity 0.15s, transform 0.15s',
      opacity: '0',
      transform: 'translateY(2px)'
    });
    document.body.appendChild(btn);
    _defineBtn = btn;

    // Animate in
    requestAnimationFrame(() => {
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(0)';
    });

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeDefineBtn();
      triggerDefinition(text, rect, context);
    });
  }

  // Ctrl+K → Command Palette
  document.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (await ensureModules()) window.__ib.togglePalette();
    }
  });

  // Double-click → word definition (single or multi-word, with context)
  document.addEventListener('dblclick', async (event) => {
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host')) return;
    removeDefineBtn();
    const sel = window.getSelection();
    const text = sel.toString().trim();
    if (!text || text.length > 80) return;
    // Allow up to 5 words for double-click
    if (text.split(/\s+/).length > 5) return;

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const context = extractContext(sel);
    clearTimeout(_defTimer);
    _defTimer = setTimeout(() => triggerDefinition(text, rect, context), 150);
  });

  // Text selection → show floating "Define" button for multi-word selections
  document.addEventListener('mouseup', (event) => {
    // Skip if inside our own UI
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host' || el === _defineBtn)) return;

    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel.toString().trim();

      // Only show for multi-word selections (2-5 words) that weren't from double-click
      if (!text || text.split(/\s+/).length < 2 || text.split(/\s+/).length > 5 || text.length > 120) {
        removeDefineBtn();
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { removeDefineBtn(); return; }

      const context = extractContext(sel);
      showDefineBtn(rect, text, context);
    }, 10);
  });

  // Remove floating button on click elsewhere or scroll
  document.addEventListener('mousedown', (e) => {
    if (_defineBtn && e.target !== _defineBtn) removeDefineBtn();
  });
  document.addEventListener('scroll', removeDefineBtn, true);

  // Messages from background / popup
  chrome.runtime.onMessage.addListener((message) => {
    const routable = ['SHOW_DEFINITION', 'SHOW_ERROR', 'SHOW_LOADING', 'SHOW_RETRYING', 'SUMMARIZE_PAGE', 'SUMMARIZE_SELECTION'];
    if (routable.includes(message.type)) {
      ensureModules().then(ok => { if (ok) window.__ib.handleMessage(message); });
    }
  });
})();
