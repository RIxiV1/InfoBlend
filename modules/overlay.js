/**
 * InfoBlend AI — Overlay Module
 * Manages the definition/summary overlay, page extraction, and YouTube transcripts.
 * Injected dynamically on first user interaction.
 */
(() => {
  const ib = window.__ib;
  let overlayHost = null;
  let autoCloseTimer = null;

  // --- Theme Application ---
  function applyTheme(container) {
    ib.getStorage(['theme']).then(settings => {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isLight = settings.theme === 'light' || (settings.theme === 'system' && !isSystemDark);
      if (isLight) container.classList.add('ib-light-theme');

      const accent = ib.getThemeColor();
      container.style.setProperty('--ib-accent-color', accent);

      const alpha = isLight ? '0.15' : '0.25';
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = accent;
      const [r, g, b] = ctx.fillStyle.match(/\d+/g) || [245, 166, 35];
      container.style.setProperty('--ib-accent-low', `rgba(${r}, ${g}, ${b}, ${alpha})`);
    });
  }

  // --- Loading Overlay ---
  function showLoadingOverlay() {
    if (overlayHost) { overlayHost.remove(); overlayHost = null; }
    clearTimeout(autoCloseTimer);

    const { host, shadow } = ib.createShadowHost('infoblend-shadow-host');
    overlayHost = host;

    const container = document.createElement('div');
    container.className = 'infoblend-overlay';
    applyTheme(container);

    // Header
    const header = document.createElement('div');
    header.className = 'infoblend-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'infoblend-title';
    titleSpan.textContent = 'InfoBlend AI';

    const controls = document.createElement('div');
    controls.className = 'infoblend-controls';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'infoblend-btn infoblend-pin';
    pinBtn.title = 'Pin Overlay';
    pinBtn.setAttribute('aria-label', 'Pin Overlay');
    pinBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 2h6l-1.5 6.5L18 12H6l4.5-3.5z"/></svg>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'infoblend-btn infoblend-close';
    closeBtn.title = 'Close';
    closeBtn.setAttribute('aria-label', 'Close Overlay');
    closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    controls.appendChild(pinBtn);
    controls.appendChild(closeBtn);
    header.appendChild(titleSpan);
    header.appendChild(controls);

    // Skeleton loading
    const loading = document.createElement('div');
    loading.className = 'infoblend-loading';
    const skeletonGroup = document.createElement('div');
    skeletonGroup.className = 'ib-skeleton-group';
    ['ib-sk-title', 'ib-sk-line', 'ib-sk-line', 'ib-sk-line-short'].forEach(cls => {
      const sk = document.createElement('div');
      sk.className = `ib-skeleton ${cls}`;
      skeletonGroup.appendChild(sk);
    });
    loading.appendChild(skeletonGroup);

    // Progress bar
    const progressContainer = document.createElement('div');
    progressContainer.className = 'infoblend-progress-container';
    const progressBar = document.createElement('div');
    progressBar.className = 'infoblend-progress-bar';
    progressContainer.appendChild(progressBar);

    container.appendChild(header);
    container.appendChild(loading);
    container.appendChild(progressContainer);
    shadow.appendChild(container);

    setupOverlayEvents(overlayHost, container);
    startAutoCloseTimer(overlayHost, container);
    setTimeout(() => container.classList.add('open'), 10);

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

    setTimeout(() => container.classList.add('open'), 10);

    container.querySelector('.infoblend-title').textContent = title;
    container.querySelector('.infoblend-content')?.remove();
    container.querySelector('.infoblend-loading')?.remove();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'infoblend-content';

    const isNotice = title === 'Notice' || title === 'Error';
    if (isNotice) {
      // Styled empty/error state instead of dumping text in a card
      const emptyState = document.createElement('div');
      emptyState.className = 'ib-empty-state';
      emptyState.innerHTML = title === 'Error'
        ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
        : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
      const msg = document.createElement('div');
      msg.className = 'ib-empty-state-text';
      msg.textContent = content;
      emptyState.appendChild(msg);
      contentDiv.appendChild(emptyState);
    } else {
      try {
        ib.BentoRenderer.render(content, contentDiv);
      } catch (e) {
        const fallback = document.createElement('div');
        fallback.className = 'ib-bento-card';
        fallback.appendChild(ib.smartHighlight(content));
        contentDiv.appendChild(fallback);
      }
    }

    // Source line — safe DOM construction (no innerHTML)
    const sourceDiv = document.createElement('div');
    sourceDiv.className = 'infoblend-source';
    if (extra.isNotFound && extra.url) {
      sourceDiv.textContent = 'Source: ';
      const link = document.createElement('a');
      link.href = extra.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${source} \u2197`;
      Object.assign(link.style, { color: 'var(--ib-accent-color)', textDecoration: 'none', fontWeight: '600' });
      sourceDiv.appendChild(link);
    } else {
      sourceDiv.textContent = `Source: ${source}`;
    }
    contentDiv.appendChild(sourceDiv);

    const progressContainer = container.querySelector('.infoblend-progress-container');
    container.insertBefore(contentDiv, progressContainer);

    // Copy button (deduplicated)
    const controls = container.querySelector('.infoblend-controls');
    const copyIconSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const checkIconSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ib-accent-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    if (!controls.querySelector('.infoblend-copy')) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'infoblend-btn infoblend-copy';
      copyBtn.title = 'Copy to clipboard';
      copyBtn.setAttribute('aria-label', 'Copy to clipboard');
      copyBtn.innerHTML = copyIconSVG;
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(content);
        copyBtn.innerHTML = checkIconSVG;
        copyBtn.classList.add('ib-copied');
        setTimeout(() => { copyBtn.innerHTML = copyIconSVG; copyBtn.classList.remove('ib-copied'); }, 2000);
      };
      controls.insertBefore(copyBtn, controls.lastChild);
    }

    if (title.toLowerCase().includes('summary')) saveToHistory(title, content);

    setupOverlayEvents(overlayHost, container);

    // Mouse tracking (deduplicated)
    if (!container._hasMouseTracking) {
      container._hasMouseTracking = true;
      container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        container.style.setProperty('--ib-mouse-x', `${e.clientX - rect.left}px`);
        container.style.setProperty('--ib-mouse-y', `${e.clientY - rect.top}px`);
      });
    }

    const wordCount = content.split(/\s+/).length;
    const delay = Math.max(10000, (wordCount / 200) * 60 * 1000 + 5000);
    startAutoCloseTimer(overlayHost, container, delay);
    container.setAttribute('tabindex', '-1');
    container.focus();
  }

  // --- Auto-close Timer ---
  function startAutoCloseTimer(host, container, delay = 10000) {
    if (host._stopTimer) host._stopTimer();
    let startTime = Date.now();
    let isPaused = false;
    let animationFrameId = null;
    const progressBar = container.querySelector('.infoblend-progress-bar');

    const update = () => {
      if (isPaused || host._isPinned || !host.parentNode || !progressBar) {
        if (!isPaused && !host._isPinned) cancelAnimationFrame(animationFrameId);
        return;
      }
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, delay - elapsed);
      progressBar.style.width = `${(remaining / delay) * 100}%`;
      if (remaining <= 0) closeOverlay(host, container);
      else animationFrameId = requestAnimationFrame(update);
    };

    const handleMouseEnter = () => { isPaused = true; };
    const handleMouseLeave = () => {
      isPaused = false;
      if (!host._isPinned) {
        const currentWidth = parseFloat(progressBar.style.width) || 100;
        startTime = Date.now() - (delay - (currentWidth / 100 * delay));
        animationFrameId = requestAnimationFrame(update);
      }
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    animationFrameId = requestAnimationFrame(update);

    host._stopTimer = () => {
      isPaused = true;
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }

  function closeOverlay(host, container) {
    if (host._stopTimer) host._stopTimer();
    container.classList.add('ib-fade-out');
    window.getSelection().removeAllRanges();
    setTimeout(() => {
      if (host.parentNode) host.remove();
      if (overlayHost === host) overlayHost = null;
    }, 400);
  }

  function setupOverlayEvents(host, container) {
    const closeBtn = container.querySelector('.infoblend-close');
    if (closeBtn) {
      closeBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); closeOverlay(host, container); };
    }
    const pinBtn = container.querySelector('.infoblend-pin');
    if (pinBtn) {
      pinBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        host._isPinned = !host._isPinned;
        pinBtn.classList.toggle('active', host._isPinned);
        const pb = container.querySelector('.infoblend-progress-bar');
        if (host._isPinned) { if (pb) pb.style.width = '100%'; }
        else startAutoCloseTimer(host, container);
      };
    }
  }

  // --- Page Content Extraction ---
  function extractArticleContent() {
    const mainContentSelectors = [
      'article', 'main', '[role="main"]', '.post-content', '.entry-content',
      '#content', '.article-body', '.story-body', '.tg-article-content'
    ];
    let mainArea = null;
    for (const selector of mainContentSelectors) {
      mainArea = document.querySelector(selector);
      if (mainArea) break;
    }
    mainArea = mainArea || document.body;

    const junkSelectors = [
      'nav', 'footer', 'header', 'script', 'style', 'noscript', 'template',
      'aside', '[role="complementary"]', '.sidebar', '#sidebar',
      '[class*="ad-"]', '[id*="ad-"]', '.nav-menu', '.footer-links',
      '.social-share', '.comments-area', '.related-posts'
    ].join(', ');

    const elements = mainArea.querySelectorAll('p, h1, h2, h3, h4, li, section');
    const prose = Array.from(elements)
      .filter(el => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (el.closest(junkSelectors)) return false;
        if (el.tagName === 'LI' && el.innerText.length < 15) return false;
        return true;
      })
      .map(el => el.innerText.trim())
      .filter(text => {
        const isCode = text.includes('function(') || text.includes('var ') || (text.match(/{/g) || []).length > 3;
        const isMenu = text.split('|').length > 3 || text.split('\u2022').length > 4;
        return text.length > 25 && !isCode && !isMenu;
      });

    const uniqueProse = Array.from(new Set(prose));
    const finalContent = uniqueProse.join('\n\n');
    return finalContent.length > 100 ? finalContent.substring(0, 12000) : null;
  }

  // --- Summarization Orchestration ---
  function handlePageSummarization() {
    showLoadingOverlay();
    if (window.location.hostname.includes('youtube.com') && window.location.pathname.includes('/watch')) {
      handleYouTubeSummarization();
      return;
    }
    const content = extractArticleContent();
    if (!content) {
      updateOverlay('Notice', 'No readable article content found on this page.', 'InfoBlend');
      return;
    }
    runSummarizer(content, 'Page Summary');
  }

  function handleYouTubeSummarization() {
    showLoadingOverlay();
    const scriptContent = Array.from(document.scripts).find(s => s.textContent.includes('ytInitialPlayerResponse'))?.textContent;
    const playerResponseRegex = /ytInitialPlayerResponse\s*=\s*({.+?});\s*(?:var|<\/script)/s;
    const match = scriptContent?.match(playerResponseRegex);

    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks?.length > 0) {
          ib.sendMessage({ type: 'PROCESS_YOUTUBE_TRACKS', tracks }, (resp) => {
            if (resp?.success) runSummarizer(resp.transcript, 'Video Summary');
            else updateOverlay('Notice', resp?.error || 'Failed to process transcript.', 'YouTube Insights');
          });
          return;
        }
      } catch { /* fall through to background fetch */ }
    }

    ib.sendMessage({ type: 'FETCH_YOUTUBE_TRANSCRIPT', url: window.location.href }, (resp) => {
      if (resp?.success && resp.transcript) runSummarizer(resp.transcript, 'Video Summary');
      else updateOverlay('Notice', resp?.error || 'Could not extract video transcript.', 'YouTube Insights');
    });
  }

  function runSummarizer(text, title = 'Summary') {
    if (!text?.trim()) {
      updateOverlay('Notice', 'No readable content found to summarize.', 'InfoBlend');
      return;
    }
    ib.sendMessage({ type: 'PERFORM_SUMMARIZATION', text }, (response) => {
      if (response?.success) updateOverlay(title, response.summary, response.method || 'InfoBlend AI');
      else updateOverlay('Notice', response?.error || 'Summarization failed.', 'InfoBlend');
    });
  }

  async function saveToHistory(title, content) {
    const data = await ib.getStorage(['summaryHistory']);
    const history = data.summaryHistory || [];
    history.push({
      title: document.title,
      content: content.substring(0, 100) + '...',
      timestamp: Date.now()
    });
    if (history.length > 10) history.shift();
    ib.setStorage({ summaryHistory: history });
  }

  // --- Message Router ---
  function handleMessage(message) {
    switch (message.type) {
      case 'SHOW_DEFINITION':
        updateOverlay(message.data.title, message.data.content, message.data.source, message.data);
        break;
      case 'SHOW_ERROR':
        updateOverlay('Error', message.message, 'InfoBlend');
        break;
      case 'SHOW_LOADING':
        showLoadingOverlay();
        break;
      case 'SUMMARIZE_PAGE':
        handlePageSummarization();
        break;
      case 'SUMMARIZE_SELECTION':
        showLoadingOverlay();
        runSummarizer(message.text, 'Selection Summary');
        break;
    }
  }

  // Expose to bootstrap and other modules
  Object.assign(ib, {
    showLoadingOverlay,
    updateOverlay,
    closeOverlay,
    handlePageSummarization,
    handleMessage
  });
})();
