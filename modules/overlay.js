/**
 * InfoBlend AI — Overlay Module
 * Definition/summary overlay, page extraction, YouTube transcripts.
 */
(() => {
  if (window.__ib?._overlayLoaded) return;

  const ib = window.__ib;
  ib._overlayLoaded = true;

  let overlayHost = null;

  // --- Theme (preloaded, applied synchronously) ---
  let _theme = 'dark';
  ib.getStorage(['theme']).then(s => { _theme = s.theme || 'dark'; });

  function applyTheme(container) {
    const isDark = _theme === 'dark' || (_theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (!isDark) container.classList.add('ib-light-theme');
  }

  // --- Loading Overlay ---
  function showLoadingOverlay() {
    if (overlayHost) { overlayHost.remove(); overlayHost = null; }

    const { host, shadow } = ib.createShadowHost('infoblend-shadow-host');
    overlayHost = host;

    const container = document.createElement('div');
    container.className = 'infoblend-overlay';
    applyTheme(container);

    const header = document.createElement('div');
    header.className = 'infoblend-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'infoblend-title';
    titleSpan.textContent = 'InfoBlend';

    const controls = document.createElement('div');
    controls.className = 'infoblend-controls';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'infoblend-btn infoblend-close';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    controls.appendChild(closeBtn);
    header.appendChild(titleSpan);
    header.appendChild(controls);

    const loading = document.createElement('div');
    loading.className = 'infoblend-loading';
    const skGroup = document.createElement('div');
    skGroup.className = 'ib-skeleton-group';
    ['ib-sk-title', 'ib-sk-line', 'ib-sk-line', 'ib-sk-line-short'].forEach(cls => {
      const sk = document.createElement('div');
      sk.className = `ib-skeleton ${cls}`;
      skGroup.appendChild(sk);
    });
    loading.appendChild(skGroup);

    container.appendChild(header);
    container.appendChild(loading);
    shadow.appendChild(container);

    closeBtn.onclick = (e) => { e.stopPropagation(); closeOverlay(host, container); };

    container.setAttribute('tabindex', '-1');
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeOverlay(host, container);
    });

    setTimeout(() => { container.classList.add('open'); container.focus(); }, 10);
    return container;
  }

  // --- Update Overlay Content ---
  function updateOverlay(title, content, source, extra = {}) {
    let container;
    if (!overlayHost?.shadowRoot) {
      container = showLoadingOverlay();
    } else {
      container = overlayHost.shadowRoot.querySelector('.infoblend-overlay');
      if (!container) container = showLoadingOverlay();
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
      const emptyState = document.createElement('div');
      emptyState.className = 'ib-empty-state';
      emptyState.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      const msg = document.createElement('div');
      msg.className = 'ib-empty-state-text';
      msg.textContent = content;
      emptyState.appendChild(msg);
      contentDiv.appendChild(emptyState);
    } else {
      try { ib.BentoRenderer.render(content, contentDiv); }
      catch {
        const fallback = document.createElement('div');
        fallback.className = 'ib-bento-card';
        fallback.appendChild(ib.smartHighlight(content));
        contentDiv.appendChild(fallback);
      }
    }

    if (!isNotice) {
      const sourceDiv = document.createElement('div');
      sourceDiv.className = 'infoblend-source';
      if (extra.isNotFound && extra.url) {
        sourceDiv.textContent = 'Source: ';
        const link = document.createElement('a');
        link.href = extra.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `${source} \u2197`;
        sourceDiv.appendChild(link);
      } else {
        sourceDiv.textContent = `Source: ${source}`;
      }
      contentDiv.appendChild(sourceDiv);
    }

    container.appendChild(contentDiv);

    // Copy button — always re-create so it captures current content
    const controls = container.querySelector('.infoblend-controls');
    const oldCopy = controls.querySelector('.infoblend-copy');
    if (oldCopy) oldCopy.remove();

    const copyIconSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const checkSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ib-accent-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const copyBtn = document.createElement('button');
    copyBtn.className = 'infoblend-btn infoblend-copy';
    copyBtn.title = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy to clipboard');
    copyBtn.innerHTML = copyIconSVG;
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(content);
      copyBtn.innerHTML = checkSVG;
      copyBtn.classList.add('ib-copied');
      setTimeout(() => { copyBtn.innerHTML = copyIconSVG; copyBtn.classList.remove('ib-copied'); }, 2000);
    };
    controls.insertBefore(copyBtn, controls.firstChild);

    container.setAttribute('tabindex', '-1');
    container.focus();
  }

  function closeOverlay(host, container) {
    container.classList.add('ib-fade-out');
    setTimeout(() => {
      if (host.parentNode) host.remove();
      if (overlayHost === host) overlayHost = null;
    }, 300);
  }

  // --- Page Content Extraction ---
  function extractArticleContent() {
    const selectors = ['article', 'main', '[role="main"]', '.post-content', '.entry-content', '#content', '.article-body', '.story-body'];
    let mainArea = null;
    for (const s of selectors) { mainArea = document.querySelector(s); if (mainArea) break; }
    mainArea = mainArea || document.body;

    const junk = 'nav,footer,header,script,style,noscript,template,aside,[role="complementary"],.sidebar,#sidebar,[class*="ad-"],[id*="ad-"],.social-share,.comments-area,.related-posts';

    const prose = Array.from(mainArea.querySelectorAll('p, h1, h2, h3, h4, li'))
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
    showLoadingOverlay();
    if (window.location.hostname.includes('youtube.com') && window.location.pathname.includes('/watch')) {
      return handleYouTubeSummarization();
    }
    const content = extractArticleContent();
    if (!content) return updateOverlay('Notice', 'No readable article content found on this page.', 'InfoBlend');
    runSummarizer(content, 'Page Summary');
  }

  function handleYouTubeSummarization() {
    const scriptContent = Array.from(document.scripts).find(s => s.textContent.includes('ytInitialPlayerResponse'))?.textContent;
    const match = scriptContent?.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|<\/script)/s);

    if (match) {
      try {
        const tracks = JSON.parse(match[1]).captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks?.length > 0) {
          ib.sendMessage({ type: 'PROCESS_YOUTUBE_TRACKS', tracks }, (resp) => {
            if (resp?.success) runSummarizer(resp.transcript, 'Video Summary');
            else updateOverlay('Notice', resp?.error || 'Failed to process transcript.', 'YouTube');
          });
          return;
        }
      } catch { /* fall through */ }
    }

    ib.sendMessage({ type: 'FETCH_YOUTUBE_TRANSCRIPT', url: window.location.href }, (resp) => {
      if (resp?.success && resp.transcript) runSummarizer(resp.transcript, 'Video Summary');
      else updateOverlay('Notice', resp?.error || 'Could not extract transcript.', 'YouTube');
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
      case 'SHOW_LOADING': showLoadingOverlay(); break;
      case 'SUMMARIZE_PAGE': handlePageSummarization(); break;
      case 'SUMMARIZE_SELECTION': showLoadingOverlay(); runSummarizer(message.text, 'Selection Summary'); break;
    }
  }

  Object.assign(ib, { showLoadingOverlay, updateOverlay, closeOverlay, handlePageSummarization, handleMessage });
})();
