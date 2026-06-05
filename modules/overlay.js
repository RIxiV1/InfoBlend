/**
 * InfoBlend — Overlay Module
 * tooltip mode: definitions near the word
 * panel mode: summaries in side panel
 */
(() => {
  if (window.__ib?._overlayLoaded && typeof window.__ib.showLoadingOverlay === 'function') return;

  const ib = window.__ib;
  ib._overlayLoaded = true;

  let overlayHost = null;
  let _anchor = null;
  let _dismissHandler = null;
  let _activeAudio = null;
  let _prevFocus = null;
  let _resizeObserver = null;
  // Synonym-chain back navigation. _currentDef is what's visible right now;
  // _navHistory is the stack we can step back through. Cleared whenever the
  // overlay opens fresh (showLoadingOverlay) or closes.
  let _currentDef = null;
  let _navHistory = [];
  // Count of currently-pinned (detached) overlays, used to cascade-offset
  // newly-pinned panels so they don't stack at the same screen position.
  let _pinnedCount = 0;

  // DOM helper — reduces createElement + className boilerplate
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };

  // --- Theme ---
  // Tooltip mode: auto-detect from page background (anchor.pageTheme)
  // Panel mode: use stored setting (fallback to system preference)
  // Eagerly resolve from storage; default to system preference to avoid flash
  let _storedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  ib.getStorage(['theme']).then(s => { _storedTheme = s.theme || _storedTheme; });

  function resolveTheme() {
    // Tooltip mode — use detected page theme
    if (_anchor?.pageTheme) return _anchor.pageTheme;
    // Panel mode — use stored setting
    if (_storedTheme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return _storedTheme;
  }

  // --- Global Escape dismiss ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayHost) {
      const container = overlayHost.shadowRoot?.querySelector('.infoblend-overlay');
      if (container) closeOverlay(overlayHost, container);
    }
  });

  // --- Theme hot-reload ---
  // If the user changes the theme setting in the popup while an overlay is
  // open, update the open overlay in place rather than requiring a page
  // refresh. Tooltips opt out because their theme is anchored to the page
  // background, not the user's preference.
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !('theme' in changes)) return;
    _storedTheme = changes.theme.newValue || _storedTheme;
    const container = overlayHost?.shadowRoot?.querySelector('.infoblend-overlay');
    if (!container || _anchor?.mode === 'tooltip') return;
    container.classList.toggle('ib-light-theme', resolveTheme() === 'light');
  });

  // --- Position ---
  // Tooltip position is set once on open (below the word, anchor.y = rect.bottom + 8)
  // and then refined by repositionTooltip() any time the container's size changes
  // (skeleton → content load, synonym tap re-fetch, etc.). The reflow handles the
  // flip-above-the-word case correctly because we measure the actual rendered height
  // rather than guessing.
  function positionOverlay(container) {
    if (!_anchor || _anchor.mode === 'panel') {
      container.classList.add('ib-mode-panel');
      return;
    }

    container.classList.add('ib-mode-tooltip');
    const vw = window.innerWidth;
    const w = 320;
    const left = Math.max(8, Math.min(_anchor.x - w / 2, vw - w - 8));

    container.style.position = 'fixed';
    container.style.top = `${_anchor.y}px`;
    container.style.left = `${left}px`;
    container.style.right = 'auto';
    container.style.width = `${w}px`;
  }

  function repositionTooltip(container) {
    if (!_anchor || _anchor.mode !== 'tooltip') return;
    const vh = window.innerHeight;
    const rect = container.getBoundingClientRect();
    if (!rect.height) return;

    const belowTop = _anchor.y; // already rect.bottom + 8
    const fitsBelow = belowTop + rect.height <= vh - 8;
    // rectTop is the top of the selected text. Fall back gracefully if older
    // call sites don't pass it (no flip happens — same as current behavior).
    const canFlip = typeof _anchor.rectTop === 'number';

    if (fitsBelow) {
      container.style.top = `${belowTop}px`;
      container.classList.remove('ib-flip-up');
      return;
    }
    if (canFlip) {
      const aboveTop = Math.max(8, _anchor.rectTop - rect.height - 8);
      container.style.top = `${aboveTop}px`;
      container.classList.add('ib-flip-up');
    } else {
      // No rectTop — best we can do is clamp to viewport so we don't run off-screen
      container.style.top = `${Math.max(8, vh - rect.height - 8)}px`;
    }
  }

  // --- Loading ---
  function showLoadingOverlay(anchor) {
    stopAllAudio();
    if (overlayHost) { overlayHost.remove(); overlayHost = null; }
    if (_dismissHandler) { document.removeEventListener('mousedown', _dismissHandler, true); _dismissHandler = null; }
    // Save focus only on first open of a session — repeated overlay swaps should still
    // restore to the user's original pre-overlay element, not to the previous overlay.
    if (!_prevFocus) _prevFocus = document.activeElement;
    // Fresh open = fresh navigation chain. (Synonym-chip clicks now route
    // through setOverlayLoading + updateOverlay instead of showLoadingOverlay,
    // so reaching this path means the user started a brand new lookup.)
    _navHistory = [];
    _currentDef = null;
    _anchor = anchor || { mode: 'panel' };

    const { host, shadow } = ib.createShadowHost('infoblend-shadow-host');
    overlayHost = host;

    const container = document.createElement('div');
    container.className = 'infoblend-overlay';
    const themeName = resolveTheme();
    if (themeName === 'light') container.classList.add('ib-light-theme');
    applyAccentToContainer(container, themeName);
    positionOverlay(container);

    // Header
    const header = el('div', 'infoblend-header');
    const title = el('span', 'infoblend-title', 'InfoBlend');
    const controls = el('div', 'infoblend-controls');
    // Pin button — converts this overlay into a "detached" copy that survives
    // the next lookup. After pinning, the next showLoadingOverlay() opens a
    // fresh host alongside, enabling side-by-side comparison. Pinned overlays
    // lose their dismiss-on-outside-click and can't navigate via back/synonym
    // chips (those depend on the singleton state). See pinOverlay() below.
    // Save button — bookmarks the current definition/summary/translation into
    // the Knowledge Vault (chrome.storage.local). Click toggles saved state.
    // Pressed state is recomputed each time updateOverlay re-renders.
    const saveBtn = el('button', 'infoblend-btn infoblend-save');
    saveBtn.setAttribute('aria-label', 'Save to vault');
    saveBtn.setAttribute('aria-pressed', 'false');
    saveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
    saveBtn.onclick = (e) => { e.stopPropagation(); toggleSaveCurrent(saveBtn); };
    controls.appendChild(saveBtn);

    const pinBtn = el('button', 'infoblend-btn infoblend-pin');
    pinBtn.setAttribute('aria-label', 'Pin overlay');
    pinBtn.setAttribute('aria-pressed', 'false');
    pinBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3h-11z"/><path d="M9 14V6a3 3 0 0 1 6 0v8"/></svg>`;
    pinBtn.onclick = (e) => { e.stopPropagation(); pinOverlay(host, container, pinBtn); };
    controls.appendChild(pinBtn);

    const closeBtn = el('button', 'infoblend-btn infoblend-close');
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.onclick = (e) => { e.stopPropagation(); closeOverlay(host, container); };
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);
    attachDrag(header, container);

    // Skeleton
    const loading = el('div', 'infoblend-loading');
    const group = el('div', 'ib-skeleton-group');
    for (const c of ['ib-sk-title', 'ib-sk-line', 'ib-sk-line']) {
      group.appendChild(el('div', `ib-skeleton ${c}`));
    }
    loading.appendChild(group);

    container.appendChild(header);
    container.appendChild(loading);
    shadow.appendChild(container);

    // Click-outside dismiss for tooltips.
    // Direct reference comparison (includes(host)) is more robust than ID
    // matching against 'infoblend-shadow-host' — the old check could fail
    // in edge cases (multiple hosts during re-injection, retargeting
    // quirks in capture phase) and dismiss the overlay on legitimate
    // in-overlay clicks like Copy.
    if (_anchor.mode === 'tooltip') {
      _dismissHandler = (e) => {
        if (e.composedPath().includes(host)) return;
        closeOverlay(host, container);
      };
      setTimeout(() => document.addEventListener('mousedown', _dismissHandler, true), 150);
    }

    // Focus trapping: keep Tab within the overlay
    container.setAttribute('tabindex', '-1');
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', 'InfoBlend overlay');
    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(container.querySelectorAll('button, a, [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      // Defensive: when there's only one focusable element (e.g., overlay is
      // still loading and only the close button exists), any Tab/Shift+Tab
      // should keep focus on it regardless of where document.activeElement
      // currently is — otherwise focus can leak out to the page.
      if (focusable.length === 1) {
        e.preventDefault();
        focusable[0].focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    setTimeout(() => {
      container.classList.add('open');
      // Only steal focus into the overlay when the user got here via the
      // keyboard. Mouse-triggered opens (double-click word, "Define" button,
      // right-click summarize) should leave focus where it was — otherwise
      // a Tab/Arrow after a mouse-peek traps the user inside the tooltip
      // instead of letting them keep scrolling the page.
      if (_anchor?.viaKeyboard) {
        const firstBtn = container.querySelector('button');
        if (firstBtn) firstBtn.focus();
      }
    }, 10);

    // Watch for size changes (skeleton → content load → synonym tap → ...)
    // and re-evaluate whether the tooltip needs to flip above the word.
    if (_anchor.mode === 'tooltip' && typeof ResizeObserver !== 'undefined') {
      if (_resizeObserver) _resizeObserver.disconnect();
      _resizeObserver = new ResizeObserver(() => repositionTooltip(container));
      _resizeObserver.observe(container);
    }
    return container;
  }

  // Render (or remove) the back chevron in the overlay header based on
  // whether there's anything to go back to. Idempotent — safe to call on
  // every updateOverlay. Pop from _navHistory and re-render directly via
  // updateOverlay; don't push the current entry onto history (going BACK
  // shouldn't add to the forward stack).
  function renderBackButton(container) {
    const controls = container.querySelector('.infoblend-controls');
    if (!controls) return;
    let backBtn = controls.querySelector('.infoblend-back');
    if (_navHistory.length === 0) {
      if (backBtn) backBtn.remove();
      return;
    }
    if (backBtn) return; // already rendered
    backBtn = el('button', 'infoblend-btn infoblend-back');
    backBtn.setAttribute('aria-label', 'Back to previous definition');
    backBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
    backBtn.onclick = (e) => {
      e.stopPropagation();
      const prev = _navHistory.pop();
      if (!prev) return;
      updateOverlay(prev.title, prev.content, prev.source, prev.extra);
    };
    controls.insertBefore(backBtn, controls.firstChild);
  }

  // Swap the overlay's content area to a loading skeleton without tearing
  // down the host. Used by synonym-chip navigation so the user keeps the
  // visual frame (and pre-restoration focus chain) of the open overlay
  // instead of seeing it flicker away and rebuild.
  // Returns true on success, false if no overlay is currently open.
  function setOverlayLoading() {
    const container = overlayHost?.shadowRoot?.querySelector('.infoblend-overlay');
    if (!container) return false;

    const titleEl = container.querySelector('.infoblend-title');
    const oldContent = container.querySelector('.infoblend-content');
    if (titleEl) titleEl.textContent = 'InfoBlend';
    if (oldContent) oldContent.remove();

    // Remove the stale copy button — it closes over the previous definition's
    // copyText. updateOverlay will create a fresh one when the new content lands.
    const controls = container.querySelector('.infoblend-controls');
    controls?.querySelector('.infoblend-copy')?.remove();

    if (!container.querySelector('.infoblend-loading')) {
      const loading = el('div', 'infoblend-loading');
      const group = el('div', 'ib-skeleton-group');
      for (const c of ['ib-sk-title', 'ib-sk-line', 'ib-sk-line']) {
        group.appendChild(el('div', `ib-skeleton ${c}`));
      }
      loading.appendChild(group);
      container.appendChild(loading);
    }
    return true;
  }

  // --- Tag row builder (synonyms) ---
  function buildTagRow(label, words, type, clickable = false) {
    const row = el('div', 'ib-def-tags');
    row.appendChild(el('span', 'ib-def-tag-label', label));
    for (const w of words) {
      const tag = el('span', `ib-def-tag ib-tag-${type}`, w);
      if (clickable) {
        tag.setAttribute('role', 'button');
        tag.setAttribute('tabindex', '0');
        const lookup = (e) => {
          e.stopPropagation();
          // Push the currently-visible definition onto the back stack BEFORE
          // navigating forward. The back button on the new overlay header
          // pops this entry to return here.
          if (_currentDef) _navHistory.push(_currentDef);
          // In-place content swap. Previously this called showLoadingOverlay()
          // which destroyed the entire shadow host and rebuilt it — losing
          // the visual frame, focus chain, and any in-flight ResizeObserver
          // state. setOverlayLoading keeps the container, swaps just the
          // content to the skeleton, and updateOverlay then replaces the
          // skeleton with the new definition.
          if (!setOverlayLoading()) {
            // Fallback: no overlay open (shouldn't normally happen since
            // the chip is rendered inside an overlay, but be defensive).
            showLoadingOverlay(_anchor);
          }
          ib.sendMessage({ type: ib.MSG.FETCH_DEFINITION, word: w }, (resp) => {
            if (resp?.success && resp.data) {
              updateOverlay(resp.data.title, resp.data.content, resp.data.source, resp.data);
            } else {
              updateOverlay('Notice', resp?.error || `No definition found for "${w}".`, 'InfoBlend');
            }
          });
        };
        tag.onclick = lookup;
        tag.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lookup(e); } };
      }
      row.appendChild(tag);
    }
    return row;
  }

  // --- Accent color application ---
  // The overlay's CSS uses --ib-accent + --ib-accent-low/mid. Mirrors the math
  // in utils/accent.js (which content scripts can't import). Keep in sync.
  function hexRgb(hex) {
    const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
  }
  function applyAccentToContainer(container, themeName) {
    const stored = ib._settings?.accentColor;
    if (!stored) return;
    const rgb = hexRgb(stored);
    if (!rgb) return;
    const alphas = themeName === 'light'
      ? { lo: 0.08, md: 0.22 }
      : { lo: 0.14, md: 0.28 };
    container.style.setProperty('--ib-accent', stored);
    container.style.setProperty('--ib-accent-low', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alphas.lo})`);
    container.style.setProperty('--ib-accent-mid', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alphas.md})`);
  }

  // --- Drag-to-reposition (Mate Translate pattern, useful for pinned panels) ---
  // Header is the drag handle. We avoid intercepting clicks on the controls
  // (back/pin/close buttons) so their handlers still fire. Position is set via
  // inline `left`/`top` styles, overriding the CSS-driven panel position the
  // first time the user drags. Snapping the container into the viewport on
  // drop prevents pulling it off-screen.
  function attachDrag(handle, container) {
    handle.style.cursor = 'move';
    handle.style.userSelect = 'none';
    handle.addEventListener('mousedown', (e) => {
      // Only left-button drags; ignore clicks on buttons inside the header
      // so existing controls keep working.
      if (e.button !== 0) return;
      if (e.target.closest('button, a, input, select, .infoblend-controls')) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;

      container.classList.add('ib-dragging');

      const onMove = (ev) => {
        const nx = startLeft + (ev.clientX - startX);
        const ny = startTop + (ev.clientY - startY);
        // Constrain inside viewport with a small margin so the header always
        // stays grabbable (can't lose the overlay behind the top edge).
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - 32;
        const clampedX = Math.max(8, Math.min(maxX - 8, nx));
        const clampedY = Math.max(8, Math.min(maxY, ny));
        // Switch to left/top positioning. Clearing `right` is important for
        // panel-mode overlays which default to right:16 — otherwise both
        // sides are anchored and the width collapses.
        container.style.left = `${clampedX}px`;
        container.style.top = `${clampedY}px`;
        container.style.right = 'auto';
      };
      const onUp = () => {
        container.classList.remove('ib-dragging');
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
      };
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    });
  }

  // --- Knowledge Vault: save / unsave the current overlay's content ---
  // Storage shape: { savedItems: Array<{ id, title, content, source, type,
  //   extra, url, pageTitle, savedAt }> }. Lives in chrome.storage.local
  // (sync's 8KB-per-item quota would cap us at ~10 saves). Capped at 500
  // items LRU-style — oldest dropped when full. Identity uses url+title so
  // re-saving the same definition from the same page is idempotent.
  const VAULT_KEY = 'savedItems';
  const VAULT_MAX = 500;

  async function loadVault() {
    try {
      const res = await chrome.storage.local.get([VAULT_KEY]);
      return Array.isArray(res[VAULT_KEY]) ? res[VAULT_KEY] : [];
    } catch { return []; }
  }

  function vaultIdFor(url, title) {
    return `${url}|${String(title || '').toLowerCase()}`;
  }

  async function isCurrentSaved() {
    if (!_currentDef) return false;
    const items = await loadVault();
    const id = vaultIdFor(location.href, _currentDef.title);
    return items.some(it => it.id === id);
  }

  async function refreshSaveBtn() {
    const btn = overlayHost?.shadowRoot?.querySelector('.infoblend-save');
    if (!btn) return;
    const saved = await isCurrentSaved();
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    btn.setAttribute('aria-label', saved ? 'Remove from vault' : 'Save to vault');
  }

  async function toggleSaveCurrent(btn) {
    if (!_currentDef) return;
    const items = await loadVault();
    const id = vaultIdFor(location.href, _currentDef.title);
    const existingIdx = items.findIndex(it => it.id === id);
    if (existingIdx >= 0) {
      items.splice(existingIdx, 1);
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'Save to vault');
    } else {
      // Type discriminator helps the popup vault UI group items.
      const titleLower = String(_currentDef.title || '').toLowerCase();
      let type = 'definition';
      if (titleLower.includes('summary')) type = 'summary';
      else if (titleLower === 'translation') type = 'translation';
      items.unshift({
        id,
        title: _currentDef.title,
        content: _currentDef.content || '',
        source: _currentDef.source || '',
        type,
        extra: _currentDef.extra || {},
        url: location.href,
        pageTitle: document.title || '',
        savedAt: new Date().toISOString()
      });
      if (items.length > VAULT_MAX) items.length = VAULT_MAX;
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-label', 'Remove from vault');
    }
    try { await chrome.storage.local.set({ [VAULT_KEY]: items }); }
    catch { /* quota or storage unavailable — UI state is best-effort */ }
  }

  // --- Pin / detach: turn the current overlay into a free-standing copy ---
  // After pinning, the singleton (overlayHost, _anchor, _dismissHandler,
  // _resizeObserver, _activeAudio) is cleared so the next showLoadingOverlay
  // spawns a fresh host without disturbing the pinned one. The pinned host
  // keeps its own close button wired to its own DOM node, so closing it is
  // independent of the active overlay.
  //
  // Known v1 limitations:
  //   - Synonym chips on a pinned overlay still call updateOverlay, which
  //     mutates singleton state — disabled visually via [data-ib-pinned].
  //   - Back button likewise becomes meaningless once detached — hidden.
  //   - If the pinned overlay is mid-audio when a new lookup fires,
  //     stopAllAudio() in showLoadingOverlay will cut it short. Rare in
  //     practice (audio clips are ~1s); cleanup would require per-host
  //     audio refs which is a bigger refactor.
  function pinOverlay(host, container, btn) {
    if (container.hasAttribute('data-ib-pinned')) return; // already pinned
    container.setAttribute('data-ib-pinned', 'true');
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', 'Pinned');
    btn.disabled = true;

    // Cascade: offset this overlay by step * (existing pinned count) so a
    // second/third pin doesn't land directly under the first. Only nudge if
    // the user hasn't already dragged it — a custom drag position should
    // win over auto-cascade.
    if (!container.style.left && (container.style.right === '' || container.style.right === '16px')) {
      const step = 28;
      const offset = Math.min(_pinnedCount * step, 160);
      if (offset > 0) {
        container.style.top = `${16 + offset}px`;
        container.style.right = `${16 + offset}px`;
      }
    }
    _pinnedCount++;
    // When this pinned overlay is later closed, decrement so subsequent
    // pins re-use the freed slot. closeOverlay reads `data-ib-pinned`.

    // Detach from singleton tracking — the host stays in DOM but the module
    // forgets about it. Close button still works (it's wired directly to
    // this host's closeOverlay call).
    if (overlayHost === host) {
      overlayHost = null;
      _anchor = null;
      _currentDef = null;
      _navHistory = [];
      _activeAudio = null;
      if (_dismissHandler) {
        document.removeEventListener('mousedown', _dismissHandler, true);
        _dismissHandler = null;
      }
      if (_resizeObserver) {
        try { _resizeObserver.disconnect(); } catch { /* no-op */ }
        _resizeObserver = null;
      }
    }

    // Hide back/synonym affordances that depend on singleton state.
    container.querySelector('.infoblend-back')?.remove();
    container.querySelectorAll('.ib-tag-syn').forEach(t => {
      t.style.pointerEvents = 'none';
      t.style.opacity = '0.55';
    });
  }

  // --- Pronunciation: audio file with TTS fallback ---
  // Source priority is recorded audio (Dictionary API) → Web Speech TTS.
  // TTS is the universal fallback: works for any selected word, in any
  // language voice the browser has installed, even when every dictionary
  // source whiffed.
  function stopAllAudio() {
    if (_activeAudio) {
      _activeAudio.pause();
      if (_activeAudio.parentNode) _activeAudio.remove();
      _activeAudio = null;
    }
    if (ib.tts?.isSpeaking?.()) ib.tts.cancel();
  }

  function playPronunciation(spokenText, audioUrl, btn) {
    stopAllAudio();

    // Stale-callback guard: rather than checking `overlayHost === owningHost`
    // (which breaks for pinned/detached overlays), check the button itself.
    // If it's no longer in the DOM, the overlay was closed/removed and we
    // should drop the callback. Works for both singleton and pinned overlays.
    const isLive = () => btn.isConnected;

    const cleanupBtn = () => {
      btn.classList.remove('ib-audio-loading', 'ib-audio-playing');
      btn.removeAttribute('aria-busy');
    };

    const useTTS = () => {
      if (!isLive()) { cleanupBtn(); return; }
      if (!ib.tts?.isSupported() || !spokenText) { cleanupBtn(); return; }
      btn.classList.remove('ib-audio-loading');
      btn.removeAttribute('aria-busy');
      btn.classList.add('ib-audio-playing');
      const issued = ib.tts.speak(spokenText, {
        onEnd: () => {
          if (!isLive()) return;
          btn.classList.remove('ib-audio-playing');
        }
      });
      if (!issued) cleanupBtn();
    };

    // Pure-TTS path: no audio URL on this entry.
    if (!audioUrl) { useTTS(); return; }

    // Recorded-audio path: fetch via background (page CSP blocks direct fetch
    // of cross-origin audio in many contexts) then play, with TTS fallback on
    // any failure along the way.
    btn.classList.add('ib-audio-loading');
    btn.setAttribute('aria-busy', 'true');
    ib.sendMessage({ type: ib.MSG.FETCH_AUDIO, url: audioUrl }, (resp) => {
      if (!isLive()) { cleanupBtn(); return; }
      if (!resp?.success || !resp.dataUrl) { useTTS(); return; }

      btn.classList.remove('ib-audio-loading');
      btn.removeAttribute('aria-busy');
      btn.classList.add('ib-audio-playing');

      const audio = document.createElement('audio');
      audio.src = resp.dataUrl;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      _activeAudio = audio;

      audio.play().catch(() => {
        btn.classList.remove('ib-audio-playing');
        if (audio.parentNode) audio.remove();
        if (_activeAudio === audio) _activeAudio = null;
        // Recorded clip exists but won't play (autoplay policy, codec, etc.)
        // — fall back to TTS so the user still hears something.
        useTTS();
      });
      audio.onended = () => {
        btn.classList.remove('ib-audio-playing');
        if (audio.parentNode) audio.remove();
        if (_activeAudio === audio) _activeAudio = null;
      };
      audio.onerror = () => {
        btn.classList.remove('ib-audio-playing');
        if (audio.parentNode) audio.remove();
        if (_activeAudio === audio) _activeAudio = null;
        useTTS();
      };
    });
  }

  // Returns null if there's literally nothing playable — no audioUrl AND no
  // (TTS-supported + non-empty spokenText). Callers should treat null as
  // "skip the button entirely" rather than rendering disabled UI.
  function buildAudioBtn(spokenText, audioUrl) {
    const canTTS = !!(spokenText && ib.tts?.isSupported());
    if (!audioUrl && !canTTS) return null;
    const btn = el('button', 'infoblend-btn ib-def-audio');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Play pronunciation');
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
    btn.onclick = (e) => {
      e.stopPropagation();
      playPronunciation(spokenText, audioUrl, btn);
    };
    return btn;
  }

  // --- Render Definition (rich structured data) ---
  function renderDefinition(data, container) {
    if (!data.meanings?.length) return;
    const def = el('div', 'ib-definition');

    // Wikipedia thumbnail (rich path now mirrors the plain-text path).
    // Source is filtered server-side against disambiguation pages, so the
    // image is usually a meaningful visual for the word — not a generic icon.
    if (data.thumbnail) {
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'ib-thumbnail-wrap';
      const thumb = document.createElement('img');
      thumb.className = 'ib-thumbnail';
      thumb.src = data.thumbnail;
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumbWrap.appendChild(thumb);
      def.appendChild(thumbWrap);
    }

    // Phonetic only. Audio + CEFR moved to the title row (see updateOverlay).
    if (data.phonetic) {
      const row = el('div', 'ib-def-phonetic-row');
      row.appendChild(el('span', 'ib-def-phonetic', data.phonetic));
      def.appendChild(row);
    }

    // Meanings
    for (const meaning of data.meanings) {
      const block = el('div', 'ib-def-meaning');
      block.appendChild(el('span', 'ib-def-pos', meaning.partOfSpeech));

      const list = el('ol', 'ib-def-list');
      for (const d of meaning.definitions) {
        const li = el('li', null, d.text);
        if (d.example) li.appendChild(el('div', 'ib-def-example', `"${d.example}"`));
        list.appendChild(li);
      }
      block.appendChild(list);

      // Per-meaning synonyms (antonyms were displayed but not clickable —
      // visual filler for a 2-3 second glance. Removed.)
      if (meaning.synonyms?.length) block.appendChild(buildTagRow('Synonyms', meaning.synonyms, 'syn', true));

      def.appendChild(block);
    }

    // Top-level synonyms
    if (data.synonyms?.length) {
      const row = buildTagRow('Similar', data.synonyms, 'syn', true);
      row.classList.add('ib-def-tags-section');
      def.appendChild(row);
    }

    container.appendChild(def);
  }

  // --- Update Overlay ---
  function updateOverlay(title, content, source, extra = {}) {
    let container;
    if (!overlayHost?.shadowRoot) {
      container = showLoadingOverlay(_anchor);
    } else {
      container = overlayHost.shadowRoot.querySelector('.infoblend-overlay');
      if (!container) container = showLoadingOverlay(_anchor);
    }

    if (!container.classList.contains('open')) {
      setTimeout(() => container.classList.add('open'), 10);
    }

    // Remember the visible navigable definition so synonym-chip clicks know
    // what to push onto the back stack. Notice/Error overlays don't count.
    const isNoticeNav = title === 'Notice' || title === 'Error';
    if (!isNoticeNav) {
      _currentDef = { title, content, source, extra };
    }

    // Session-persistent inline highlight of the looked-up term on the page.
    // Skipped for notices/errors (no real term) and for summaries (extra.term
    // is absent on those). Best-effort: errors here are silently swallowed so
    // a flaky page doesn't break the overlay flow.
    if (!isNoticeNav && extra.term && ib.highlights?.highlight) {
      try { ib.highlights.highlight(extra.term); } catch { /* non-critical */ }
    }
    renderBackButton(container);
    // Sync the save button's pressed state to the current item (may already
    // be in the vault from a previous lookup of the same term on this page).
    refreshSaveBtn();
    // Hide save for notice/error overlays — nothing meaningful to vault.
    const saveBtn = container.querySelector('.infoblend-save');
    if (saveBtn) saveBtn.style.display = isNoticeNav ? 'none' : '';

    // Batch DOM queries
    const titleEl = container.querySelector('.infoblend-title');
    const oldContent = container.querySelector('.infoblend-content');
    const oldLoading = container.querySelector('.infoblend-loading');
    if (oldContent) oldContent.remove();
    if (oldLoading) oldLoading.remove();

    // Re-render the title with inline affordances: speaker (click to hear)
    // and CEFR pill (difficulty at a glance). Putting them next to the word
    // makes them maximally discoverable and avoids redundant audio rows in
    // the body. Renders for any definition, suppressed for Notice/Error.
    titleEl.textContent = '';
    const titleText = document.createElement('span');
    titleText.className = 'ib-title-text';
    titleText.textContent = title;
    titleEl.appendChild(titleText);
    if (!isNoticeNav && extra.term) {
      const titleAudioBtn = buildAudioBtn(extra.term, extra.audioUrl);
      if (titleAudioBtn) {
        titleAudioBtn.classList.add('ib-title-audio');
        titleEl.appendChild(titleAudioBtn);
      }
      if (extra.cefr?.level) {
        const cefrPill = el('span', 'ib-title-cefr', extra.cefr.level);
        cefrPill.title = `${extra.cefr.label} (Datamuse word frequency)`;
        titleEl.appendChild(cefrPill);
      }
    }

    const contentDiv = el('div', 'infoblend-content');
    const isNotice = title === 'Notice' || title === 'Error';

    if (isNotice) {
      const state = el('div', 'ib-empty-state');
      state.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      state.appendChild(el('div', 'ib-empty-state-text', content));
      contentDiv.appendChild(state);
    } else if (extra.isRich && extra.meanings) {
      // Structured definition
      renderDefinition(extra, contentDiv);
    } else {
      // Plain text (summaries, Wiktionary/Wikipedia fallback, AI context
      // definitions, Not Found). Pronunciation button now lives next to the
      // title in the header — see updateOverlay's title rendering block.
      if (extra.thumbnail) {
        // Wrap in a masked container so hover-zoom on the img is clipped
        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'ib-thumbnail-wrap';
        const thumb = document.createElement('img');
        thumb.className = 'ib-thumbnail';
        thumb.src = extra.thumbnail;
        thumb.alt = '';
        thumb.loading = 'lazy';
        thumbWrap.appendChild(thumb);
        contentDiv.appendChild(thumbWrap);
      }
      ib.BentoRenderer.render(content, contentDiv);

      // Chat-with-the-Page sources — the AI was given numbered passages and
      // cited them with [N] markers. Render the cited passages as cards so
      // the user can verify the answer against the actual page text.
      if (Array.isArray(extra.sources) && extra.sources.length) {
        const wrap = el('div', 'ib-qa-sources');
        const heading = el('div', 'ib-qa-sources-title', 'Sources');
        wrap.appendChild(heading);
        for (const src of extra.sources) {
          const card = el('div', 'ib-qa-source-card');
          const marker = el('span', 'ib-qa-source-marker', `[${src.marker}]`);
          const body = el('span', 'ib-qa-source-text', src.text || '');
          card.appendChild(marker);
          card.appendChild(body);
          wrap.appendChild(card);
        }
        contentDiv.appendChild(wrap);
      }
    }

    // Context note
    if (extra.contextNote && !isNotice) {
      const ctxEl = el('div', 'ib-context-note');
      ctxEl.appendChild(el('span', 'ib-context-label', 'In context: '));
      const truncated = extra.contextNote.length > 120 ? extra.contextNote.substring(0, 120) + '...' : extra.contextNote;
      ctxEl.appendChild(el('span', null, truncated));
      contentDiv.appendChild(ctxEl);
    }

    // Source
    if (!isNotice) {
      const src = el('div', 'infoblend-source');
      if (extra.isNotFound && extra.url) {
        src.textContent = 'Search ';
        const link = document.createElement('a');
        link.href = extra.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `${source} \u2197`;
        src.appendChild(link);
      } else {
        // Source line: "[~5 min read · ]Source[ · cached]"
        const parts = [];
        if (extra.readMinutes) parts.push(`~${extra.readMinutes} min read`);
        parts.push(source);
        if (extra.fromCache) parts.push('cached');
        src.textContent = parts.join(' · ');
      }
      contentDiv.appendChild(src);
    }

    container.appendChild(contentDiv);

    // Copy button (fresh every time)
    const controls = container.querySelector('.infoblend-controls');
    controls.querySelector('.infoblend-copy')?.remove();

    const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ib-accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const copyBtn = el('button', 'infoblend-btn infoblend-copy');
    copyBtn.setAttribute('aria-label', 'Copy');
    copyBtn.innerHTML = copyIcon;

    // Build plain text for clipboard
    const copyText = extra.isRich
      ? extra.meanings.map(m => `${m.partOfSpeech}: ${m.definitions.map(d => d.text).join('; ')}`).join('\n')
      : content;

    // Insert before the close button so the order stays [back?, copy, close]
    // even when copy is recreated on every updateOverlay call.
    copyBtn.onclick = async (e) => {
      e.stopPropagation();
      let ok = false;
      // Try modern clipboard API. writeText returns a Promise that rejects
      // when the document isn't focused or the page denies clipboard access;
      // we used to fire-and-forget it and unconditionally show success.
      try {
        await navigator.clipboard.writeText(copyText);
        ok = true;
      } catch { /* fall through to execCommand */ }
      // Fallback for Firefox / permission-denied / non-secure contexts
      if (!ok) {
        try {
          const ta = document.createElement('textarea');
          ta.value = copyText;
          ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand('copy');
          ta.remove();
        } catch { ok = false; }
      }
      if (ok) {
        copyBtn.innerHTML = checkIcon;
        copyBtn.classList.add('ib-copied');
        setTimeout(() => { copyBtn.innerHTML = copyIcon; copyBtn.classList.remove('ib-copied'); }, 2000);
      } else {
        copyBtn.classList.add('ib-copy-failed');
        copyBtn.setAttribute('aria-label', 'Copy failed — try selecting the text manually');
        setTimeout(() => {
          copyBtn.classList.remove('ib-copy-failed');
          copyBtn.setAttribute('aria-label', 'Copy');
        }, 2400);
      }
    };
    const closeRef = controls.querySelector('.infoblend-close');
    controls.insertBefore(copyBtn, closeRef);
  }

  function closeOverlay(host, container) {
    // Decrement the pinned counter if this overlay was detached. The active
    // (non-pinned) overlay's close doesn't affect the cascade slot count.
    if (container?.getAttribute('data-ib-pinned') === 'true' && _pinnedCount > 0) {
      _pinnedCount--;
    }
    stopAllAudio();
    if (_dismissHandler) {
      document.removeEventListener('mousedown', _dismissHandler, true);
      _dismissHandler = null;
    }
    if (_resizeObserver) {
      _resizeObserver.disconnect();
      _resizeObserver = null;
    }
    _navHistory = [];
    _currentDef = null;
    container.classList.add('ib-fade-out');
    const restore = _prevFocus;
    _prevFocus = null;
    setTimeout(() => {
      if (host.parentNode) host.remove();
      if (overlayHost === host) overlayHost = null;
      _anchor = null;
      // Restore focus to wherever the user was before the overlay opened so screen-reader
      // and keyboard users don't get stranded on document.body.
      if (restore && typeof restore.focus === 'function' && document.contains(restore)) {
        try { restore.focus(); } catch { /* element may be unfocusable now */ }
      }
    }, 250);
  }

  // --- Summarization ---
  // Article extraction lives in modules/article.js (loaded earlier in the
  // content_scripts array, so ib.extractArticleContent is always available here).
  function handlePageSummarization(opts = {}) {
    showLoadingOverlay({ mode: 'panel', viaKeyboard: !!opts.viaKeyboard });
    const content = ib.extractArticleContent();
    if (!content) return updateOverlay('Notice', 'No readable content found on this page.', 'InfoBlend');
    runSummarizer(content, 'Page Summary');
  }

  function runSummarizer(text, title = 'Summary') {
    if (!text?.trim()) return updateOverlay('Notice', 'No readable content found.', 'InfoBlend');
    // Compute read-time from the ORIGINAL text, not the summary — users care
    // about "how long would this have taken without the summary". 220 wpm is
    // the standard silent-reading average for adults.
    const wordCount = (text.match(/\S+/g) || []).length;
    const readMinutes = Math.max(1, Math.round(wordCount / 220));
    ib.sendMessage({ type: ib.MSG.PERFORM_SUMMARIZATION, text }, (r) => {
      if (r?.success) updateOverlay(title, r.summary, r.method || 'InfoBlend', { readMinutes, wordCount });
      else updateOverlay('Notice', r?.error || 'Summarization failed.', 'InfoBlend');
    });
  }

  function showRetryingStatus() {
    const loading = overlayHost?.shadowRoot?.querySelector('.infoblend-loading');
    if (!loading || loading.querySelector('.ib-retrying')) return;
    loading.appendChild(el('div', 'ib-retrying', 'AI unavailable, falling back to local...'));
  }

  function handleMessage(message) {
    switch (message.type) {
      case ib.MSG.SHOW_DEFINITION: updateOverlay(message.data.title, message.data.content, message.data.source, message.data); break;
      case ib.MSG.SHOW_ERROR: updateOverlay('Error', message.message, 'InfoBlend'); break;
      case ib.MSG.SHOW_LOADING: showLoadingOverlay({ mode: 'panel' }); break;
      case ib.MSG.SHOW_RETRYING: showRetryingStatus(); break;
      case ib.MSG.SUMMARIZE_PAGE: handlePageSummarization(); break;
      case ib.MSG.SUMMARIZE_SELECTION: showLoadingOverlay({ mode: 'panel' }); runSummarizer(message.text, 'Selection Summary'); break;
    }
  }

  Object.assign(ib, { showLoadingOverlay, updateOverlay, handlePageSummarization, handleMessage, showRetryingStatus });
})();
