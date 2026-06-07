/**
 * InfoBlend — Bootstrap
 * Double-click → word/phrase definition (with context).
 * Select text → floating "Define" button for multi-word.
 * Ctrl+K → command palette.
 */
(() => {
  // Firefox compatibility — duplicates utils/compat.js because content scripts
  // are not ES modules and can't import. Keep both in sync.
  if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
    globalThis.chrome = globalThis.browser;
  }
  // After extension reload, old __ib may have stale flags but missing functions
  if (window.__ib && (
    typeof window.__ib.showLoadingOverlay !== 'function' ||
    typeof window.__ib.togglePalette !== 'function' ||
    typeof window.__ib.handleMessage !== 'function'
  )) {
    window.__ib.modulesLoaded = false;
    window.__ib._loadingPromise = null;
    // Functions are gone → the listeners that referenced them are dead too.
    // Clear the bootstrap-attached flag so this run re-attaches fresh ones
    // (otherwise the page silently has no working listeners after reload).
    window.__ib._bootstrapAttached = false;
  }
  window.__ib = window.__ib || { modulesLoaded: false, _loadingPromise: null };

  // Bootstrap idempotency: extension reload re-runs the content scripts in
  // the same long-lived tab, and the inner module guards (_overlayLoaded,
  // _paletteLoaded, etc.) are intentionally reset above so functions get
  // replaced. But document-level listeners (mouseup, dblclick, keydown,
  // mousedown, scroll, keyup, message) added below are NOT idempotent —
  // each reload appends a fresh copy. Old ones short-circuit via
  // chrome.runtime?.id checks, but their closures retain the old module
  // state and they accumulate per reload. This guard skips re-attaching.
  if (window.__ib._bootstrapAttached) return;
  window.__ib._bootstrapAttached = true;

  // Mirror of utils/constants.js (content scripts can't import ES modules).
  // Keep both in sync — divergence becomes a silent send/listen mismatch.
  window.__ib.MSG = Object.freeze({
    FETCH_DEFINITION: 'FETCH_DEFINITION',
    FETCH_AUDIO: 'FETCH_AUDIO',
    PERFORM_SUMMARIZATION: 'PERFORM_SUMMARIZATION',
    PERFORM_TRANSLATION: 'PERFORM_TRANSLATION',
    SHOW_DEFINITION: 'SHOW_DEFINITION',
    SHOW_ERROR: 'SHOW_ERROR',
    SHOW_LOADING: 'SHOW_LOADING',
    SHOW_RETRYING: 'SHOW_RETRYING',
    SUMMARIZE_PAGE: 'SUMMARIZE_PAGE',
    SUMMARIZE_SELECTION: 'SUMMARIZE_SELECTION',
    TRANSLATE_SELECTION: 'TRANSLATE_SELECTION',
    GET_SELECTION_CONTEXT: 'GET_SELECTION_CONTEXT'
  });
  const MSG = window.__ib.MSG;

  const sendMessage = async (msg, cb) => {
    try {
      if (!chrome.runtime?.id) { cb?.({ success: false, error: 'Context invalidated' }); return; }
      const response = await chrome.runtime.sendMessage(msg);
      cb?.(response);
    } catch (e) {
      cb?.({ success: false, error: e.message || 'Context Invalid' });
    }
  };

  // Read across both storage areas — keys that live in sync (settings) end up
  // alongside keys that live in local (cache, savedWords). Sync wins on
  // conflict so a user who later changed a setting in a synced browser sees
  // the up-to-date value.
  const getStorage = async (keys) => {
    try {
      if (!chrome.runtime?.id) return {};
      const [local, sync] = await Promise.all([
        chrome.storage.local.get(keys).catch(() => ({})),
        chrome.storage.sync.get(keys).catch(() => ({}))
      ]);
      return { ...local, ...sync };
    } catch { return {}; }
  };

  let _defTimer = null;
  let _selKbTimer = null;
  let _selMouseTimer = null;

  Object.assign(window.__ib, { sendMessage, getStorage });

  // Eager settings cache. Sync UI paths (palette theme, floating Define button gating)
  // read from this rather than awaiting storage on every interaction — which is what
  // caused (1) the palette light/dark FOUC on first open and (2) made it impossible
  // to gate the floating Define button on the auto-definitions toggle without a flicker.
  // Settings now live in chrome.storage.sync for cross-device portability
  // (with chrome.storage.local as a fallback for pre-migration installs). The
  // synced key list MUST match utils/storage.js SYNCED_KEYS; content scripts
  // can't import ES modules so it's duplicated here. Keep in sync.
  const SYNCED_SETTING_KEYS = ['definitionsEnabled', 'theme', 'accentColor', 'summaryStyle', 'disabledSites', 'triggerModifier'];
  window.__ib._settings = window.__ib._settings || {};
  if (chrome.runtime?.id) {
    Promise.all([
      chrome.storage.sync.get(SYNCED_SETTING_KEYS).catch(() => ({})),
      chrome.storage.local.get(SYNCED_SETTING_KEYS).catch(() => ({}))
    ]).then(([syncRes, localFallback]) => {
      // Sync wins when both have a value; local provides values during the
      // first run after a user upgrades from a pre-sync version.
      Object.assign(window.__ib._settings, localFallback, syncRes);
    }).catch(() => { /* storage unavailable */ });
    chrome.storage.onChanged?.addListener((changes, area) => {
      // Sync is authoritative for these settings; we only read from local
      // during bootstrap as a one-time migration fallback. If we also
      // listened to local-area changes here, a stray local write (or a
      // future code path) could silently overwrite the synced value with
      // a stale one and clobber the user's actual preference.
      if (area !== 'sync') return;
      for (const k of SYNCED_SETTING_KEYS) {
        if (k in changes) window.__ib._settings[k] = changes[k].newValue;
      }
    });
  }

  // Per-site disable: user-maintained hostname list. Match against BOTH
  // location.host (includes port — "localhost:3000") AND location.hostname
  // (port stripped — "localhost") so the user can disable either way. Adding
  // "slack.com" silences app.slack.com via the endsWith path; adding
  // "localhost:3000" exact-matches against location.host for dev work.
  function isSiteDisabled() {
    const list = window.__ib._settings?.disabledSites;
    if (!Array.isArray(list) || !list.length) return false;
    const host = (location.host || '').toLowerCase();
    const hostname = (location.hostname || '').toLowerCase();
    if (!host && !hostname) return false;
    for (const raw of list) {
      const entry = String(raw || '').trim().toLowerCase().replace(/^\*\./, '');
      if (!entry) continue;
      if (host === entry || hostname === entry) return true;
      if (host.endsWith('.' + entry) || hostname.endsWith('.' + entry)) return true;
    }
    return false;
  }
  window.__ib.isSiteDisabled = isSiteDisabled;

  // Discoverability toast: after the page settles, check whether we should
  // show the Ctrl+K hint. Guarded by isSiteDisabled and a one-time storage
  // flag so users see it at most once. Deferred 2s so it doesn't fight with
  // the page's own load animations.
  function scheduleDiscoveryToasts() {
    if (isSiteDisabled()) return;
    setTimeout(() => {
      if (typeof window.__ib.maybeShowCtrlKToast === 'function') {
        window.__ib.maybeShowCtrlKToast();
      }
    }, 2000);
  }
  if (document.readyState === 'complete') scheduleDiscoveryToasts();
  else window.addEventListener('load', scheduleDiscoveryToasts, { once: true });

  // Modules pre-load via the manifest's content_scripts.js array (alongside
  // this bootstrap), so they should always be ready by the time any user event
  // fires. The previous dynamic-injection path via background+scripting.executeScript
  // required activeTab, which is granted only for extension actions (toolbar
  // click, context menu, declared command) — never for DOM events like dblclick.
  function modulesReady() {
    return typeof window.__ib.showLoadingOverlay === 'function'
      && typeof window.__ib.togglePalette === 'function'
      && typeof window.__ib.handleMessage === 'function';
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
    const block = container || range.startContainer.parentElement;
    if (!block) return '';

    // Use textContent (raw, includes all whitespace) so the Range offset and
    // the indexed string agree. We collapse whitespace at the very end for
    // a clean snippet — but only after we've already found the right span.
    const fullText = block.textContent || '';
    const MAX = 300;
    const selected = selection.toString();
    const collapse = (s) => s.replace(/\s+/g, ' ').trim();
    if (fullText.length <= MAX) return collapse(fullText);

    // Compute the exact character offset of the selection's start within the
    // block's textContent. Previously this used fullText.indexOf(selected),
    // which always found the FIRST occurrence — wrong when the user selected
    // (say) the third "apple" in a paragraph. The Range trick below uses the
    // same offset model the browser uses to track the cursor, so we always
    // pick the right instance.
    let idx = -1;
    if (selected) {
      try {
        const pre = document.createRange();
        pre.selectNodeContents(block);
        pre.setEnd(range.startContainer, range.startOffset);
        idx = pre.toString().length;
      } catch { idx = fullText.indexOf(selected); }
    }
    if (idx < 0) return collapse(fullText.substring(0, MAX));

    const halfBudget = Math.max(80, Math.floor((MAX - selected.length) / 2));
    const start = Math.max(0, idx - halfBudget);
    const end = Math.min(fullText.length, idx + selected.length + halfBudget);
    let snippet = collapse(fullText.substring(start, end));
    if (start > 0) snippet = '…' + snippet;
    if (end < fullText.length) snippet = snippet + '…';
    return snippet;
  }

  async function triggerDefinition(text, rect, context) {
    if (isSiteDisabled()) return;
    const settings = await getStorage(['definitionsEnabled']);
    if (settings.definitionsEnabled === false) return;

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // rectTop lets the overlay flip ABOVE the word when the tooltip would overflow
    // the viewport bottom. Without it, the overlay can only fall back to clamping.
    const anchor = { x: cx, y: rect.bottom + 8, rectTop: rect.top, mode: 'tooltip', pageTheme: detectPageTheme(cx, cy) };
    if (!modulesReady()) return;
    window.__ib.showLoadingOverlay(anchor);
    const msg = { type: MSG.FETCH_DEFINITION, word: text };
    if (context) msg.context = context;
    sendMessage(msg, (response) => {
      if (response?.success) {
        window.__ib.updateOverlay(response.data.title, response.data.content, response.data.source, response.data);
      } else {
        window.__ib.updateOverlay('Notice', response?.error || 'No definition found.', 'InfoBlend');
      }
    });
  }

  // --- Floating "Define" button (Shadow DOM isolated) ---
  let _defineBtnHost = null;

  function removeDefineBtn() {
    if (_defineBtnHost) {
      _defineBtnHost.remove();
      _defineBtnHost = null;
    }
  }

  function showDefineBtn(rect, text, context) {
    // Respect the same auto-definitions toggle that gates double-click in
    // triggerDefinition. Previously the floating button ignored the setting,
    // so toggling auto-definitions off still surfaced the button on every
    // multi-word selection.
    if (window.__ib._settings?.definitionsEnabled === false) return;
    if (isSiteDisabled()) return;

    removeDefineBtn();

    // Approximate button dimensions for viewport clamping. The button is sized
    // by its content; these are conservative upper bounds.
    const BTN_W = 84;
    const BTN_H = 26;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - BTN_W / 2, vw - BTN_W - 8));
    // Prefer below the selection; flip above if it would overflow the bottom edge.
    const wouldOverflowBelow = rect.bottom + 6 + BTN_H > vh - 8;
    const top = wouldOverflowBelow
      ? Math.max(8, rect.top - BTN_H - 6)
      : rect.bottom + 6;

    // Create shadow-isolated host
    const host = document.createElement('div');
    host.id = 'infoblend-define-host';
    Object.assign(host.style, {
      all: 'initial',
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      zIndex: '2147483647',
      pointerEvents: 'auto'
    });
    const shadow = host.attachShadow({ mode: 'open' });

    const isDark = detectPageTheme(rect.left + rect.width / 2, rect.top) === 'dark';

    // CSP-safe: inline <style> in shadow DOM is blocked by strict style-src
    // policies (GitHub, banks, secure web apps). adoptedStyleSheets bypasses
    // that — it's a programmatic CSSStyleSheet, not parsed as inline.
    const css = `
      :host { display: block; }
      .ib-define-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.01em;
        color: ${isDark ? '#f0f0f0' : '#1d1d1f'};
        background: ${isDark ? 'rgba(44, 44, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
        border: 1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'};
        border-radius: 8px;
        cursor: pointer;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 4px 16px rgba(0,0,0,${isDark ? '0.4' : '0.12'}), 0 1px 4px rgba(0,0,0,0.08);
        opacity: 0;
        transform: translateY(4px) scale(0.95);
        animation: ib-pop-in 0.15s ease forwards;
        transition: background 0.1s, border-color 0.1s;
      }
      .ib-define-btn:hover {
        background: ${isDark ? 'rgba(74, 144, 255, 0.15)' : 'rgba(74, 144, 255, 0.1)'};
        border-color: rgba(74, 144, 255, 0.4);
      }
      .ib-define-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px rgba(74, 144, 255, 0.35);
      }
      .ib-define-btn svg {
        color: #4a90ff;
        flex-shrink: 0;
      }
      @keyframes ib-pop-in {
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .ib-define-btn {
          animation: none;
          opacity: 1;
          transform: none;
          transition: none;
        }
      }
    `;
    try {
      // Preferred path. CSSStyleSheet+replaceSync is supported in Chrome 73+
      // and Firefox 101+, neither of which we're targeting below.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      // Defensive: if a browser somehow lacks Constructable Stylesheets, fall
      // back to inline <style>. CSP will block it on strict sites, but the
      // button at least exists (just unstyled) instead of failing entirely.
      const style = document.createElement('style');
      style.textContent = css;
      shadow.appendChild(style);
    }

    const btnEl = document.createElement('button');
    btnEl.className = 'ib-define-btn';
    btnEl.setAttribute('aria-label', 'Define selection');
    btnEl.innerHTML = `<svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Define`;
    shadow.appendChild(btnEl);

    // document.body is null on standalone XML/SVG documents and certain
    // framesets — fall back to the document element so the button still
    // mounts. Mirrors the same guard in modules/core.js.
    (document.body || document.documentElement).appendChild(host);
    _defineBtnHost = host;

    const activate = () => {
      removeDefineBtn();
      triggerDefinition(text, rect, context);
    };
    btnEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activate();
    });
    // Keyboard activation: button is focusable but mousedown-only handler missed Enter/Space
    btnEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
  }

  // Ctrl+K → Command Palette. Skip when user is typing in an editor — Ctrl+K
  // is the universal "insert link" shortcut in Google Docs, Slack, Notion,
  // GitHub PR composer, etc. Hijacking it there breaks workflows.
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
    const active = document.activeElement;
    const tag = active?.tagName;
    const inEditor = tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable;
    if (inEditor) return; // let native Ctrl+K run
    if (isSiteDisabled()) return; // honor per-site mute
    e.preventDefault();
    if (modulesReady()) window.__ib.togglePalette();
  });

  // Double-click → word definition (single or multi-word, with context)
  // Modifier-key gate: when triggerModifier is set, the user must hold the
  // matching key during the double-click for the lookup to fire. Cuts
  // accidental triggers from "double-click to select" muscle memory. 'none'
  // (the default) preserves the original instant behavior.
  function modifierMatches(event) {
    const mod = window.__ib._settings?.triggerModifier;
    if (!mod || mod === 'none') return true;
    if (mod === 'alt') return event.altKey;
    if (mod === 'ctrl') return event.ctrlKey || event.metaKey; // treat Cmd as Ctrl on macOS
    if (mod === 'shift') return event.shiftKey;
    if (mod === 'meta') return event.metaKey;
    return true;
  }

  document.addEventListener('dblclick', (event) => {
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host')) return;
    if (!modifierMatches(event)) return;
    removeDefineBtn();
    // mouseup fires synchronously before dblclick and queues evaluateSelection
    // on a 10ms timer. For 2-word double-clicks the wordCount check inside
    // evaluateSelection would still match, briefly flashing the floating
    // "Define" button at the same time the tooltip is being prepared. Cancel
    // that pending evaluation here.
    clearTimeout(_selMouseTimer);
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

  // Text selection → show floating "Define" button for multi-word selections.
  // Triggered by mouseup (mouse selection) and keyup (keyboard selection via
  // Shift+Arrow / Shift+Home/End). Both paths route through evaluateSelection.
  function evaluateSelection() {
    const sel = window.getSelection();
    const text = sel.toString().trim();

    // Only show for multi-word selections (2-5 words)
    const wordCount = text ? text.split(/\s+/).length : 0;
    if (!text || wordCount < 2 || wordCount > 5 || text.length > 120) {
      removeDefineBtn();
      return;
    }
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { removeDefineBtn(); return; }

    const context = extractContext(sel);
    showDefineBtn(rect, text, context);
  }

  document.addEventListener('mouseup', (event) => {
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host' || el.id === 'infoblend-define-host')) return;
    clearTimeout(_selMouseTimer);
    _selMouseTimer = setTimeout(evaluateSelection, 10);
  });

  document.addEventListener('keyup', (event) => {
    // Selection-affecting keys only. Pressing arrows without Shift collapses
    // the selection, in which case evaluateSelection will simply remove any
    // visible button.
    const isSelectionKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Shift'].includes(event.key);
    if (!isSelectionKey) return;
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host' || el.id === 'infoblend-define-host')) return;
    clearTimeout(_selKbTimer);
    _selKbTimer = setTimeout(evaluateSelection, 200);
  });

  // Remove floating button on click elsewhere or scroll
  document.addEventListener('mousedown', (e) => {
    if (_defineBtnHost && !e.composedPath().some(el => el.id === 'infoblend-define-host')) removeDefineBtn();
  });
  document.addEventListener('scroll', removeDefineBtn, true);

  // Messages from background / popup
  const ROUTABLE = new Set([
    MSG.SHOW_DEFINITION, MSG.SHOW_ERROR, MSG.SHOW_LOADING, MSG.SHOW_RETRYING,
    MSG.SUMMARIZE_PAGE, MSG.SUMMARIZE_SELECTION
  ]);
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Synchronous request/response: extract context around the active
    // selection. Background uses this for context-menu translate/define so
    // those flows are context-aware (chrome.contextMenus.onClicked doesn't
    // expose surrounding text). Returning true keeps the channel open.
    if (message?.type === MSG.GET_SELECTION_CONTEXT) {
      try {
        const sel = window.getSelection();
        const context = sel?.rangeCount ? extractContext(sel) : '';
        sendResponse({ context });
      } catch { sendResponse({ context: '' }); }
      // Sync sendResponse — do NOT return true. Returning true tells Chrome
      // we'll respond later, which keeps the port open and triggers
      // "message port closed" warnings in some Chromium versions.
      return;
    }
    if (!ROUTABLE.has(message.type) || !modulesReady()) return;
    // Per-site disable also silences popup/context-menu actions on this tab.
    // Without this gate, a disabled site would still pop the panel when the
    // user clicked Summarize from the popup or right-clicked → Define.
    if (isSiteDisabled()) return;
    window.__ib.handleMessage(message);
  });
})();
