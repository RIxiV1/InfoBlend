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

  // --- Position ---
  function positionOverlay(container) {
    if (!_anchor || _anchor.mode === 'panel') {
      container.classList.add('ib-mode-panel');
      return;
    }

    container.classList.add('ib-mode-tooltip');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = 320;

    const left = Math.max(8, Math.min(_anchor.x - w / 2, vw - w - 8));
    let top = _anchor.y;

    if (top + 200 > vh) {
      top = _anchor.y - 56;
      container.classList.add('ib-flip-up');
    }

    container.style.position = 'fixed';
    container.style.top = `${top}px`;
    container.style.left = `${left}px`;
    container.style.right = 'auto';
    container.style.width = `${w}px`;
  }

  // --- Loading ---
  function showLoadingOverlay(anchor) {
    if (_activeAudio) { _activeAudio.pause(); _activeAudio = null; }
    if (overlayHost) { overlayHost.remove(); overlayHost = null; }
    if (_dismissHandler) { document.removeEventListener('mousedown', _dismissHandler, true); _dismissHandler = null; }
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

    // Click-outside dismiss for tooltips
    if (_anchor.mode === 'tooltip') {
      _dismissHandler = (e) => {
        if (!e.composedPath().some(el => el.id === 'infoblend-shadow-host')) {
          closeOverlay(host, container);
        }
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
      // Move focus into the overlay for keyboard users
      const firstBtn = container.querySelector('button');
      if (firstBtn) firstBtn.focus();
    }, 10);
    return container;
  }

  // --- Tag row builder (synonyms/antonyms) ---
  function buildTagRow(label, words, type, clickable = false) {
    const row = el('div', 'ib-def-tags');
    row.appendChild(el('span', 'ib-def-tag-label', label));
    for (const w of words) {
      const tag = el('span', `ib-def-tag ib-tag-${type}`, w);
      if (clickable) tag.onclick = () => ib.sendMessage({ type: 'FETCH_DEFINITION', word: w });
      row.appendChild(tag);
    }
    return row;
  }

  // --- Render Definition (rich structured data) ---
  function renderDefinition(data, container) {
    if (!data.meanings?.length) return;
    const def = el('div', 'ib-definition');

    // Phonetic + audio
    if (data.phonetic || data.audioUrl) {
      const row = el('div', 'ib-def-phonetic-row');

      if (data.phonetic) {
        row.appendChild(el('span', 'ib-def-phonetic', data.phonetic));
      }

      if (data.audioUrl) {
        const audioBtn = el('button', 'infoblend-btn ib-def-audio');
        audioBtn.setAttribute('aria-label', 'Play pronunciation');
        audioBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
        audioBtn.onclick = (e) => {
          e.stopPropagation();
          if (_activeAudio) {
            _activeAudio.pause();
            if (_activeAudio.parentNode) _activeAudio.remove();
            _activeAudio = null;
          }
          audioBtn.classList.add('ib-audio-playing');
          // Fetch audio via background script to bypass page CSP
          ib.sendMessage({ type: 'FETCH_AUDIO', url: data.audioUrl }, (resp) => {
            if (!resp?.success || !resp.dataUrl) {
              audioBtn.classList.remove('ib-audio-playing');
              return;
            }
            const audio = document.createElement('audio');
            audio.src = resp.dataUrl;
            audio.style.display = 'none';
            document.body.appendChild(audio);
            _activeAudio = audio;
            audio.play().catch(() => {
              audioBtn.classList.remove('ib-audio-playing');
              if (audio.parentNode) audio.remove();
              _activeAudio = null;
            });
            audio.onended = () => {
              audioBtn.classList.remove('ib-audio-playing');
              if (audio.parentNode) audio.remove();
              _activeAudio = null;
            };
          });
        };
        row.appendChild(audioBtn);
      }

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

      // Per-meaning synonyms / antonyms
      if (meaning.synonyms?.length) block.appendChild(buildTagRow('Synonyms', meaning.synonyms, 'syn', true));
      if (meaning.antonyms?.length) block.appendChild(buildTagRow('Antonyms', meaning.antonyms, 'ant'));

      def.appendChild(block);
    }

    // Top-level synonyms / antonyms
    if (data.synonyms?.length) {
      const row = buildTagRow('Similar', data.synonyms, 'syn');
      row.classList.add('ib-def-tags-section');
      def.appendChild(row);
    }
    if (data.antonyms?.length) {
      const row = buildTagRow('Opposite', data.antonyms, 'ant');
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
      // Plain text (summaries, Wiktionary/Wikipedia fallback, AI context definitions)
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
    const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ib-accent-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const copyBtn = el('button', 'infoblend-btn infoblend-copy');
    copyBtn.setAttribute('aria-label', 'Copy');
    copyBtn.innerHTML = copyIcon;

    // Build plain text for clipboard
    const copyText = extra.isRich
      ? extra.meanings.map(m => `${m.partOfSpeech}: ${m.definitions.map(d => d.text).join('; ')}`).join('\n')
      : content;

    copyBtn.onclick = (e) => {
      e.stopPropagation();
      try {
        navigator.clipboard.writeText(copyText);
      } catch {
        // Fallback for Firefox or permission-denied contexts
        const ta = document.createElement('textarea');
        ta.value = copyText;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      copyBtn.innerHTML = checkIcon;
      copyBtn.classList.add('ib-copied');
      setTimeout(() => { copyBtn.innerHTML = copyIcon; copyBtn.classList.remove('ib-copied'); }, 2000);
    };
    controls.insertBefore(copyBtn, controls.firstChild);
  }

  function closeOverlay(host, container) {
    if (_activeAudio) { _activeAudio.pause(); _activeAudio = null; }
    if (_dismissHandler) {
      document.removeEventListener('mousedown', _dismissHandler, true);
      _dismissHandler = null;
    }
    container.classList.add('ib-fade-out');
    setTimeout(() => {
      if (host.parentNode) host.remove();
      if (overlayHost === host) overlayHost = null;
      _anchor = null;
    }, 250);
  }

  // --- Page Extraction (Readability-inspired heuristics) ---
  function extractArticleContent() {
    // Phase 1: Try semantic selectors (most precise)
    let area = document.querySelector('article, main, [role="main"], .post-content, .entry-content, #content, .article-body, .story-body');

    // Phase 2: Score candidate containers by text density (limit depth for perf)
    if (!area) {
      let bestScore = 0;
      for (const cand of document.querySelectorAll('div, section')) {
        // Skip deeply nested or tiny containers
        const pCount = cand.querySelectorAll(':scope > p, :scope > * > p').length;
        if (pCount < 2) continue;
        const textLen = cand.textContent.length;
        if (textLen < 200) continue;
        const linkDensity = (cand.querySelectorAll('a').length + 1) / (pCount + 1);
        const score = (pCount * 10 + textLen / 100) / (linkDensity + 1);
        if (score > bestScore) { bestScore = score; area = cand; }
      }
    }

    area = area || document.body;

    const junk = 'nav,footer,header,script,style,noscript,template,aside,[role="complementary"],[role="navigation"],[role="banner"],.sidebar,#sidebar,[class*="ad-"],[id*="ad-"],[class*="social"],[class*="share"],[class*="comment"],[class*="related"],[class*="recommend"],[class*="newsletter"],[class*="subscribe"],[class*="popup"],[class*="modal"],[class*="cookie"],[class*="banner"],.social-share,.comments-area,.related-posts,.breadcrumb,.pagination,.toc';
    const prose = Array.from(area.querySelectorAll('p, h1, h2, h3, h4, li, blockquote, figcaption'))
      .filter(node => {
        if (node.closest(junk)) return false;
        if (node.offsetHeight === 0) return false; // hidden — cheaper than getComputedStyle
        const text = node.innerText;
        if (node.tagName === 'LI' && text.length < 15) return false;
        if (node.tagName === 'LI') {
          const linkLen = node.querySelectorAll('a').length ? Array.from(node.querySelectorAll('a')).reduce((s, a) => s + a.textContent.length, 0) : 0;
          if (linkLen > text.length * 0.6) return false;
        }
        return true;
      })
      .map(node => node.innerText.trim())
      .filter(t => t.length > 25 && !t.includes('function(') && !t.includes('var ') && t.split('|').length <= 3);

    const content = Array.from(new Set(prose)).join('\n\n');
    return content.length > 100 ? content.substring(0, 12000) : null;
  }

  // --- Summarization ---
  function handlePageSummarization() {
    showLoadingOverlay({ mode: 'panel' });
    const content = extractArticleContent();
    if (!content) return updateOverlay('Notice', 'No readable content found on this page.', 'InfoBlend');
    runSummarizer(content, 'Page Summary');
  }

  function runSummarizer(text, title = 'Summary') {
    if (!text?.trim()) return updateOverlay('Notice', 'No readable content found.', 'InfoBlend');
    ib.sendMessage({ type: 'PERFORM_SUMMARIZATION', text }, (r) => {
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
      case 'SHOW_DEFINITION': updateOverlay(message.data.title, message.data.content, message.data.source, message.data); break;
      case 'SHOW_ERROR': updateOverlay('Error', message.message, 'InfoBlend'); break;
      case 'SHOW_LOADING': showLoadingOverlay({ mode: 'panel' }); break;
      case 'SHOW_RETRYING': showRetryingStatus(); break;
      case 'SUMMARIZE_PAGE': handlePageSummarization(); break;
      case 'SUMMARIZE_SELECTION': showLoadingOverlay({ mode: 'panel' }); runSummarizer(message.text, 'Selection Summary'); break;
    }
  }

  Object.assign(ib, { showLoadingOverlay, updateOverlay, handlePageSummarization, handleMessage, showRetryingStatus });
})();
