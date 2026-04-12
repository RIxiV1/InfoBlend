/**
 * InfoBlend AI — Overlay Module
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

  // --- Theme ---
  // Tooltip mode: auto-detect from page background (anchor.pageTheme)
  // Panel mode: use stored setting (fallback to system preference)
  let _storedTheme = 'dark';
  ib.getStorage(['theme']).then(s => { _storedTheme = s.theme || 'dark'; });

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

    let left = Math.max(8, Math.min(_anchor.x - w / 2, vw - w - 8));
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
    const header = document.createElement('div');
    header.className = 'infoblend-header';
    const title = document.createElement('span');
    title.className = 'infoblend-title';
    title.textContent = 'InfoBlend';
    const controls = document.createElement('div');
    controls.className = 'infoblend-controls';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'infoblend-btn infoblend-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.onclick = (e) => { e.stopPropagation(); closeOverlay(host, container); };
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);

    // Skeleton
    const loading = document.createElement('div');
    loading.className = 'infoblend-loading';
    const group = document.createElement('div');
    group.className = 'ib-skeleton-group';
    ['ib-sk-title', 'ib-sk-line', 'ib-sk-line'].forEach(c => {
      const s = document.createElement('div');
      s.className = `ib-skeleton ${c}`;
      group.appendChild(s);
    });
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

    setTimeout(() => container.classList.add('open'), 10);
    return container;
  }

  // --- Render Definition (rich structured data) ---
  function renderDefinition(data, container) {
    const def = document.createElement('div');
    def.className = 'ib-definition';

    // Phonetic + audio
    if (data.phonetic || data.audioUrl) {
      const row = document.createElement('div');
      row.className = 'ib-def-phonetic-row';

      if (data.phonetic) {
        const phonetic = document.createElement('span');
        phonetic.className = 'ib-def-phonetic';
        phonetic.textContent = data.phonetic;
        row.appendChild(phonetic);
      }

      if (data.audioUrl) {
        const audioBtn = document.createElement('button');
        audioBtn.className = 'infoblend-btn ib-def-audio';
        audioBtn.setAttribute('aria-label', 'Play pronunciation');
        audioBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
        audioBtn.onclick = (e) => {
          e.stopPropagation();
          if (_activeAudio) { _activeAudio.pause(); _activeAudio = null; }
          _activeAudio = new Audio(data.audioUrl);
          _activeAudio.play().catch(() => {});
          audioBtn.classList.add('ib-audio-playing');
          _activeAudio.onended = () => { audioBtn.classList.remove('ib-audio-playing'); _activeAudio = null; };
        };
        row.appendChild(audioBtn);
      }

      def.appendChild(row);
    }

    // Meanings
    for (const meaning of data.meanings) {
      const block = document.createElement('div');
      block.className = 'ib-def-meaning';

      const pos = document.createElement('span');
      pos.className = 'ib-def-pos';
      pos.textContent = meaning.partOfSpeech;
      block.appendChild(pos);

      const list = document.createElement('ol');
      list.className = 'ib-def-list';

      for (const d of meaning.definitions) {
        const li = document.createElement('li');
        li.textContent = d.text;

        if (d.example) {
          const ex = document.createElement('div');
          ex.className = 'ib-def-example';
          ex.textContent = `"${d.example}"`;
          li.appendChild(ex);
        }
        list.appendChild(li);
      }

      block.appendChild(list);
      def.appendChild(block);
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

    container.querySelector('.infoblend-title').textContent = title;
    container.querySelector('.infoblend-content')?.remove();
    container.querySelector('.infoblend-loading')?.remove();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'infoblend-content';

    const isNotice = title === 'Notice' || title === 'Error';

    if (isNotice) {
      const state = document.createElement('div');
      state.className = 'ib-empty-state';
      state.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      const msg = document.createElement('div');
      msg.className = 'ib-empty-state-text';
      msg.textContent = content;
      state.appendChild(msg);
      contentDiv.appendChild(state);
    } else if (extra.isRich && extra.meanings) {
      // Structured definition
      renderDefinition(extra, contentDiv);
    } else {
      // Plain text (summaries, Wiktionary/Wikipedia fallback)
      ib.BentoRenderer.render(content, contentDiv);
    }

    // Source
    if (!isNotice) {
      const src = document.createElement('div');
      src.className = 'infoblend-source';
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
    const copyBtn = document.createElement('button');
    copyBtn.className = 'infoblend-btn infoblend-copy';
    copyBtn.setAttribute('aria-label', 'Copy');
    copyBtn.innerHTML = copyIcon;

    // Build plain text for clipboard
    const copyText = extra.isRich
      ? extra.meanings.map(m => `${m.partOfSpeech}: ${m.definitions.map(d => d.text).join('; ')}`).join('\n')
      : content;

    copyBtn.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(copyText);
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

  // --- Page Extraction ---
  function extractArticleContent() {
    const selectors = ['article', 'main', '[role="main"]', '.post-content', '.entry-content', '#content', '.article-body', '.story-body'];
    let area = null;
    for (const s of selectors) { area = document.querySelector(s); if (area) break; }
    area = area || document.body;

    const junk = 'nav,footer,header,script,style,noscript,template,aside,[role="complementary"],.sidebar,#sidebar,[class*="ad-"],[id*="ad-"],.social-share,.comments-area,.related-posts';
    const prose = Array.from(area.querySelectorAll('p, h1, h2, h3, h4, li'))
      .filter(el => {
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && !el.closest(junk) && !(el.tagName === 'LI' && el.innerText.length < 15);
      })
      .map(el => el.innerText.trim())
      .filter(t => t.length > 25 && !t.includes('function(') && t.split('|').length <= 3);

    const content = Array.from(new Set(prose)).join('\n\n');
    return content.length > 100 ? content.substring(0, 12000) : null;
  }

  // --- Summarization ---
  function handlePageSummarization() {
    showLoadingOverlay({ mode: 'panel' });
    if (window.location.hostname.includes('youtube.com') && window.location.pathname.includes('/watch')) {
      return handleYouTubeSummarization();
    }
    const content = extractArticleContent();
    if (!content) return updateOverlay('Notice', 'No readable content found on this page.', 'InfoBlend');
    runSummarizer(content, 'Page Summary');
  }

  function handleYouTubeSummarization() {
    const scriptContent = Array.from(document.scripts).find(s => s.textContent.includes('ytInitialPlayerResponse'))?.textContent;
    const match = scriptContent?.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|<\/script)/s);
    if (match) {
      try {
        const tracks = JSON.parse(match[1]).captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks?.length > 0) {
          ib.sendMessage({ type: 'PROCESS_YOUTUBE_TRACKS', tracks }, (r) => {
            if (r?.success) runSummarizer(r.transcript, 'Video Summary');
            else updateOverlay('Notice', r?.error || 'Failed to process transcript.', 'YouTube');
          });
          return;
        }
      } catch { /* fall through */ }
    }
    ib.sendMessage({ type: 'FETCH_YOUTUBE_TRANSCRIPT', url: window.location.href }, (r) => {
      if (r?.success && r.transcript) runSummarizer(r.transcript, 'Video Summary');
      else updateOverlay('Notice', r?.error || 'Could not extract transcript.', 'YouTube');
    });
  }

  function runSummarizer(text, title = 'Summary') {
    if (!text?.trim()) return updateOverlay('Notice', 'No readable content found.', 'InfoBlend');
    ib.sendMessage({ type: 'PERFORM_SUMMARIZATION', text }, (r) => {
      if (r?.success) updateOverlay(title, r.summary, r.method || 'InfoBlend AI');
      else updateOverlay('Notice', r?.error || 'Summarization failed.', 'InfoBlend');
    });
  }

  function handleMessage(message) {
    switch (message.type) {
      case 'SHOW_DEFINITION': updateOverlay(message.data.title, message.data.content, message.data.source, message.data); break;
      case 'SHOW_ERROR': updateOverlay('Error', message.message, 'InfoBlend'); break;
      case 'SHOW_LOADING': showLoadingOverlay({ mode: 'panel' }); break;
      case 'SUMMARIZE_PAGE': handlePageSummarization(); break;
      case 'SUMMARIZE_SELECTION': showLoadingOverlay({ mode: 'panel' }); runSummarizer(message.text, 'Selection Summary'); break;
    }
  }

  Object.assign(ib, { showLoadingOverlay, updateOverlay, handlePageSummarization, handleMessage });
})();
