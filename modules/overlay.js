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
    if (resolveTheme() === 'light') container.classList.add('ib-light-theme');
    positionOverlay(container);

    // Header
    const header = el('div', 'infoblend-header');
    const title = el('span', 'infoblend-title', 'InfoBlend');
    const controls = el('div', 'infoblend-controls');
    const closeBtn = el('button', 'infoblend-btn infoblend-close');
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.onclick = (e) => { e.stopPropagation(); closeOverlay(host, container); };
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);

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

    // Snapshot the overlay host. If it changes mid-flight (new lookup, close,
    // navigation), every callback below short-circuits — otherwise the user
    // gets ghost audio from a definition they already dismissed.
    const owningHost = overlayHost;

    const cleanupBtn = () => {
      btn.classList.remove('ib-audio-loading', 'ib-audio-playing');
      btn.removeAttribute('aria-busy');
    };

    const useTTS = () => {
      if (overlayHost !== owningHost) { cleanupBtn(); return; }
      if (!ib.tts?.isSupported() || !spokenText) { cleanupBtn(); return; }
      btn.classList.remove('ib-audio-loading');
      btn.removeAttribute('aria-busy');
      btn.classList.add('ib-audio-playing');
      const issued = ib.tts.speak(spokenText, {
        onEnd: () => {
          if (overlayHost !== owningHost) return;
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
      if (overlayHost !== owningHost) { cleanupBtn(); return; }
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

    // Phonetic + audio. Always try to render the speaker — if the source
    // gave us a real audio URL we'll use it (best quality), otherwise TTS
    // speaks the term. buildAudioBtn returns null only when both paths
    // are unavailable (no term to speak AND no audioUrl AND no TTS).
    const audioBtn = buildAudioBtn(data.term || data.title, data.audioUrl);
    if (data.phonetic || audioBtn) {
      const row = el('div', 'ib-def-phonetic-row');
      if (data.phonetic) row.appendChild(el('span', 'ib-def-phonetic', data.phonetic));
      if (audioBtn) row.appendChild(audioBtn);
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
    renderBackButton(container);

    // Batch DOM queries
    const titleEl = container.querySelector('.infoblend-title');
    const oldContent = container.querySelector('.infoblend-content');
    const oldLoading = container.querySelector('.infoblend-loading');
    titleEl.textContent = title;
    if (oldContent) oldContent.remove();
    if (oldLoading) oldLoading.remove();

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
      // Plain text (summaries, Wiktionary/Wikipedia fallback, AI context definitions,
      // Not Found). Show a pronunciation button whenever we have the original
      // selection term — summaries don't carry one, so they correctly skip.
      // Discriminator is `extra.term`, not a title regex: summary titles are
      // user-customizable via i18n down the road.
      if (extra.term) {
        const audioBtn = buildAudioBtn(extra.term, null);
        if (audioBtn) {
          const audioRow = el('div', 'ib-def-audio-row');
          audioRow.appendChild(audioBtn);
          contentDiv.appendChild(audioRow);
        }
      }
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
        src.textContent = extra.fromCache ? `${source} · cached` : source;
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
    ib.sendMessage({ type: ib.MSG.PERFORM_SUMMARIZATION, text }, (r) => {
      if (r?.success) updateOverlay(title, r.summary, r.method || 'InfoBlend');
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
