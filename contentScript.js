/**
 * Content script for InfoBlend AI.
 * Premium Deep-Tech Web Augmentation.
 */

const Z_INDEX = '2147483647';
const SHADOW_STYLES = `
  :host {
    all: initial;
    display: block;
    --mouse-x: -100px;
    --mouse-y: -100px;
    --ib-accent: #f5a623;
  }
  .infoblend-overlay {
    position: fixed;
    top: 16px;
    right: 16px;
    width: 320px;
    background: #050505 !important;
    color: #ffffff !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 16px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.8);
    z-index: ${Z_INDEX};
    font-family: ui-monospace, 'Geist Mono', monospace !important;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto 0fr;
    transition: grid-template-rows 0.4s ease;
  }
  .infoblend-overlay.open { grid-template-rows: auto 1fr; }
  .ib-bento-card {
    position: relative;
    background: #0a0a0a !important;
    color: #ffffff !important;
    padding: 12px 14px;
    border-radius: 12px;
    margin: 8px;
    font-size: 13px !important;
    font-weight: 500 !important;
    line-height: 1.6 !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    overflow: hidden;
  }
  .ib-bento-card::before {
    content: '';
    position: absolute;
    inset: -1px;
    padding: 1px;
    background: radial-gradient(200px circle at var(--mouse-x) var(--mouse-y), rgba(255,255,255,0.15), transparent 80%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }
  .ib-highlight, b { color: var(--ib-accent) !important; font-weight: 500 !important; }
  .infoblend-content { background: #050505 !important; padding: 4px; overflow-y: auto; }
  .infoblend-header { padding: 10px 12px; display: flex; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); }
  @keyframes ibSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  .infoblend-overlay { animation: ibSlideIn 0.3s ease-out both; }
`;

(async () => {
  /**
   * Validates if the extension context is still active.
   * @returns {boolean}
   */
  const isContextValid = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); } 
    catch (e) { return false; }
  };

  /**
   * Retrieves a safe URL for internal assets.
   * @param {string} path 
   * @returns {string}
   */
  const safeGetURL = (path) => {
    try { return chrome.runtime.getURL(path); } 
    catch (e) { return ''; }
  };

  /**
   * Safely retrieves storage data, handling invalidated contexts.
   * @param {string|string[]} keys 
   * @returns {Promise<Object>}
   */
  const getStorage = async (keys) => {
    try {
      if (!isContextValid()) return {};
      return await chrome.storage.local.get(keys);
    } catch (e) { return {}; }
  };

  /**
   * Dispatches messages to the background script with error handling.
   * @param {Object} msg 
   * @param {Function} [cb] 
   */
  const sendMessage = async (msg, cb) => {
    try {
      if (!isContextValid()) {
        if (cb) cb({ success: false, error: 'Context invalidated' });
        return;
      }
      const response = await chrome.runtime.sendMessage(msg);
      if (cb) cb(response);
    } catch (e) {
      console.warn('[InfoBlend] Messaging error:', e.message);
      if (cb) cb({ success: false, error: e.message || 'Context Invalid' });
    }
  };

  /**
   * Safely updates storage.
   * @param {Object} data 
   */
  const setStorage = async (data) => {
    try {
      if (isContextValid()) await chrome.storage.local.set(data);
    } catch (e) { /* Fail silently */ }
  };

  // Helper to create a Shadow Host reliably
  const createShadowHost = (id) => {
    const host = document.createElement('div');
    host.id = id;
    Object.assign(host.style, {
      all: 'initial',
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      overflow: 'visible',
      zIndex: Z_INDEX
    });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = SHADOW_STYLES;
    shadow.appendChild(style);
    return { host, shadow };
  };

  // Helper to extract brand color and ensure it's readable
  const getThemeColor = () => {
    const getLuminance = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const adjustColor = (color) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color;
      const rgb = ctx.fillStyle.match(/\d+/g);
      if (!rgb) return '#f5a623'; // Default Amber
      const [r, g, b] = rgb.map(Number);
      const L = getLuminance(r, g, b);
      if (L < 0.6) return '#f5a623'; // Even strictier: Use InfoBlend Amber if too dark
      return color;
    };


    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && meta.content) return adjustColor(meta.content);
    
    // Fallback: try to find a dominant color from common brand elements
    const brandSelectors = ['header', 'nav', '.navbar', '[class*="brand"]', '[class*="logo"]'];
    for (const selector of brandSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)' && bg !== 'rgb(0, 0, 0)') {
          return adjustColor(bg);
        }
      }
    }
    return '#f5a623'; // Default InfoBlend Amber
  };

  let overlay = null;
  let palette = null;
  let paletteHost = null;

  async function togglePalette() {
    if (paletteHost) {
      paletteHost.remove();
      paletteHost = null;
      return;
    }

    const { host, shadow } = createShadowHost('infoblend-palette-host');
    paletteHost = host;
    
    // Command Palettes still need the external CSS for deep styling
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = safeGetURL('overlay/overlay.css');
    shadow.appendChild(link);


    const overlayBg = document.createElement('div');
    overlayBg.className = 'ib-palette-overlay';
    overlayBg.onclick = () => togglePalette();

    const paletteDiv = document.createElement('div');
    paletteDiv.className = 'ib-palette';
    paletteDiv.onclick = (e) => e.stopPropagation();

    const searchArea = document.createElement('div');
    searchArea.className = 'ib-palette-search';
    searchArea.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    `;

    const input = document.createElement('input');
    input.className = 'ib-palette-input';
    input.placeholder = 'Search commands or define something...';
    input.spellcheck = false;
    searchArea.appendChild(input);

    const resultsArea = document.createElement('div');
    resultsArea.className = 'ib-palette-results';

    const commands = [
      { id: 'summarize', label: 'Summarize Page', hint: 'Enter', icon: '📝' },
      { id: 'define', label: 'Define...', hint: 'Type word', icon: '📖' },
      { id: 'history', label: 'View History', hint: 'Gallery', icon: '⏳' }
    ];

    let selectedIndex = 0;

    const renderResults = (filter = '') => {
      resultsArea.innerHTML = '';
      const filtered = commands.filter(c => 
        c.label.toLowerCase().includes(filter.toLowerCase()) || 
        filter.startsWith('define ')
      );

      if (filter.startsWith('define ')) {
        const word = filter.replace('define ', '').trim();
        if (word) {
          filtered.unshift({ id: 'define-word', label: `Define "${word}"`, hint: 'Enter', icon: '🔍', word });
        }
      } else if (filter && !filtered.length) {
        filtered.push({ id: 'define-word', label: `Define "${filter}"`, hint: 'Enter', icon: '🔍', word: filter });
      }

      filtered.forEach((cmd, i) => {
        const item = document.createElement('div');
        item.className = `ib-palette-item ${i === selectedIndex ? 'selected' : ''}`;
        item.innerHTML = `
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:14px;">${cmd.icon}</span>
            <span class="ib-palette-label">${cmd.label}</span>
          </div>
          <span class="ib-palette-hint">${cmd.hint}</span>
        `;
        item.onclick = () => executeCommand(cmd);
        resultsArea.appendChild(item);
      });
      return filtered;
    };

    let currentFiltered = renderResults();

    const executeCommand = (cmd) => {
      togglePalette();
      if (cmd.id === 'summarize') {
        handlePageSummarization();
      } else if (cmd.id === 'define-word') {
        showLoadingOverlay();
        sendMessage({ type: 'FETCH_DEFINITION', word: cmd.word }, (response) => {
          if (response && response.success) {
            updateOverlay(response.data.title, response.data.content, response.data.source);
          }
        });
      } else if (cmd.id === 'history') {
        // Future: Show history in palette
        sendMessage({ type: 'OPEN_POPUP' });
      }
    };

    input.oninput = (e) => {
      selectedIndex = 0;
      currentFiltered = renderResults(e.target.value);
    };

    input.onkeydown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % currentFiltered.length;
        currentFiltered = renderResults(input.value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + currentFiltered.length) % currentFiltered.length;
        currentFiltered = renderResults(input.value);
      } else if (e.key === 'Enter') {
        if (currentFiltered[selectedIndex]) {
          executeCommand(currentFiltered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        togglePalette();
      }
    };

    paletteDiv.appendChild(searchArea);
    paletteDiv.appendChild(resultsArea);

    const footer = document.createElement('div');
    footer.className = 'ib-palette-footer';
    footer.innerHTML = `
      <div class="ib-key-hint"><span class="ib-key-box">↑↓</span> to navigate</div>
      <div class="ib-key-hint"><span class="ib-key-box">↵</span> to select</div>
      <div class="ib-key-hint"><span class="ib-key-box">esc</span> to close</div>
    `;
    paletteDiv.appendChild(footer);

    overlayBg.appendChild(paletteDiv);
    shadow.appendChild(overlayBg);

    setTimeout(() => input.focus(), 50);
  }

  // Listen for CMD+K or Ctrl+K to trigger the Command Palette
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      togglePalette();
    }
  });

  // Listen for text selection
  document.addEventListener('mouseup', async (event) => {
    // Ignore events originating from our own overlay
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host')) return;
    
    const selection = window.getSelection().toString().trim();
    const wordCount = selection.split(/\s+/).filter(w => w.length > 0).length;
    
    if (selection && wordCount > 0 && wordCount <= 2 && selection.length < 50) {
      const run = async () => {
        const settings = await getStorage(['definitionsEnabled']);
        if (settings.definitionsEnabled !== false) {
          showLoadingOverlay();
          sendMessage({ type: 'FETCH_DEFINITION', word: selection }, (response) => {
            if (response && response.success) {
              updateOverlay(response.data.title, response.data.content, response.data.source);
            } else {
              updateOverlay('Notice', response?.error || 'No definition found.', 'InfoBlend');
            }
          });
        }
      };
      run();
    }
  });

  // Listen for messages from background script or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_DEFINITION') {
      updateOverlay(message.data.title, message.data.content, message.data.source);
    } else if (message.type === 'SHOW_ERROR') {
      updateOverlay('Error', message.message, 'InfoBlend');
    } else if (message.type === 'SHOW_LOADING') {
      showLoadingOverlay();
    } else if (message.type === 'SUMMARIZE_PAGE') {
      handlePageSummarization();
    } else if (message.type === 'SUMMARIZE_SELECTION') {
      showLoadingOverlay();
      runLocalSummarizer(message.text);
    }
  });

  /**
   * Main entry point for page summarization logic.
   * Handles YouTube transcripts and general web article extraction.
   */
  async function handlePageSummarization() {
    showLoadingOverlay();
    
    // 1. YouTube Specialized Extraction
    if (window.location.hostname.includes('youtube.com') && window.location.pathname.includes('/watch')) {
      handleYouTubeSummarization();
      return;
    }
    
    // 2. Standard Web Article Extraction
    const content = extractArticleContent();
    if (!content) {
      updateOverlay('Notice', 'No readable article content found on this page.', 'InfoBlend');
      return;
    }
    
    runSummarizer(content, 'Page Summary');
  }

  /**
   * Extracts prose content from the page using heuristic-based selection.
   * @returns {string|null} The extracted and cleaned text content.
   */
  function extractArticleContent() {
    const junkSelectors = 'nav, footer, header, script, style, noscript, template, [class*="sidebar"], [id*="sidebar"], [class*="ad-"], [class*="nav-"]';
    const mainContentSelectors = 'article, main, .post-content, .entry-content';
    
    const mainArea = document.querySelector(mainContentSelectors) || document.body;
    const isMainHeuristic = !!document.querySelector(mainContentSelectors);
    
    const elements = isMainHeuristic 
      ? mainArea.querySelectorAll('p, h1, h2, h3, h4') 
      : mainArea.querySelectorAll('p, section, h1, h2, h3');

    const prose = Array.from(elements)
      .filter(el => !el.closest(junkSelectors))
      .map(el => el.innerText.trim())
      .filter(text => {
        const isCode = text.includes('function(') || text.includes('var ') || (text.match(/{/g) || []).length > 3;
        return text.length > (isMainHeuristic ? 20 : 40) && !isCode;
      });

    return prose.join(' ').substring(0, 10000) || null;
  }

  /**
   * Specialized handler for YouTube video transcripts.
   */
  function handleYouTubeSummarization() {
    sendMessage({ type: 'FETCH_YOUTUBE_TRANSCRIPT', url: window.location.href }, async (resp) => {
      if (resp && resp.success && resp.transcript) {
        runSummarizer(resp.transcript, 'Video Summary');
      } else {
        updateOverlay('Notice', 'Could not extract video transcript.', 'YouTube Insights');
      }
    });
  }

  /**
   * Orchestrates the summarization process (AI or Local).
   */
  async function runSummarizer(text, title = 'Summary') {
    try {
      const settings = await getStorage(['aiEndpoint', 'aiKey', 'aiProvider']);
      if (settings.aiKey && settings.aiEndpoint) {
        sendMessage({ type: 'SUMMARIZE_VIA_AI', text }, (response) => {
          if (response && response.success) {
            updateOverlay(title, response.summary, `AI (${settings.aiProvider})`);
          } else {
            runLocalSummarizer(text, title);
          }
        });
      } else {
        runLocalSummarizer(text, title);
      }
    } catch (e) {
      runLocalSummarizer(text, title);
    }
  }

  function runLocalSummarizer(text, title = 'Summary') {
    if (!isContextValid()) {
      updateOverlay('Notice', 'Extension updated. Please refresh the page.', 'InfoBlend');
      return;
    }
    
    sendMessage({ type: 'SUMMARIZE_LOCALLY', text }, (response) => {
      if (response && response.success) {
        updateOverlay(title, response.summary, 'InfoBlend Local');
      } else {
        updateOverlay('Notice', response?.error || 'Summarization failed.', 'InfoBlend');
      }
    });
  }


  // Form Auto-fill Logic
  const autofillForms = async () => {
    const settings = await getStorage(['autofillEnabled', 'userData']);
    if (settings.autofillEnabled && settings.userData) {
      const { name, email, phone } = settings.userData;
      const inputs = document.querySelectorAll('input');
      let filledCount = 0;
      
      const nameRegex = /full.name|first.name|display.name|^name$|^fname$/i;
      const emailRegex = /email|e-mail|mail.address/i;
      const phoneRegex = /phone|tel|mobile|cell/i;

      inputs.forEach(input => {
        const nameAttr = (input.name || '').toLowerCase();
        const idAttr = (input.id || '').toLowerCase();
        const labelAttr = (input.getAttribute('aria-label') || '').toLowerCase();
        const typeAttr = (input.type || '').toLowerCase();
        const placeholder = (input.placeholder || '').toLowerCase();

        const combinedAttrs = nameAttr + idAttr + labelAttr + placeholder;

        // Refined matching logic to reduce false positives
        const isName = nameRegex.test(combinedAttrs);
        const isEmail = typeAttr === 'email' || emailRegex.test(combinedAttrs);
        const isPhone = typeAttr === 'tel' || phoneRegex.test(combinedAttrs);

        if (name && isName && !input.value) {
          input.value = name;
          filledCount++;
        } else if (email && isEmail && !input.value) {
          input.value = email;
          filledCount++;
        } else if (phone && isPhone && !input.value) {
          input.value = phone;
          filledCount++;
        }
      });
      if (filledCount > 0) {
        console.log(`[InfoBlend AI] Autofilled ${filledCount} fields.`);
      }
    }
  };

  autofillForms();

  // Overlay Management
  let autoCloseTimer = null;
  let overlayHost = null;

  function showLoadingOverlay() {
    if (overlayHost) {
      overlayHost.remove();
      overlayHost = null;
    }
    clearTimeout(autoCloseTimer);
    
    const { host, shadow } = createShadowHost('infoblend-shadow-host');
    overlayHost = host;

    // Load the full stylesheet for secondary animations/styles
    fetch(chrome.runtime.getURL('overlay/overlay.css'))
      .then(r => r.text())
      .then(css => {
        const fullStyle = document.createElement('style');
        fullStyle.textContent = css;
        shadow.appendChild(fullStyle);
      }).catch(e => console.warn("Full CSS load failed (CSP):", e));

    const container = document.createElement('div');
    container.className = 'infoblend-overlay';


    // Theme & Ambilight logic
    getStorage(['theme']).then(settings => {
      if (settings.theme === 'light' || 
         (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)) {
        container.classList.add('ib-light-theme');
      }
      
      const accent = getThemeColor();
      container.style.setProperty('--ib-accent', accent);
      // Create a low-opacity version for glows
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = accent;
      const [r, g, b] = ctx.fillStyle.match(/\d+/g) || [245, 166, 35];
      container.style.setProperty('--ib-accent-lo', `rgba(${r}, ${g}, ${b}, 0.15)`);
      container.style.setProperty('--ib-accent-xs', `rgba(${r}, ${g}, ${b}, 0.03)`);
    });

    const header = document.createElement('div');
    header.className = 'infoblend-header';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'infoblend-title';
    titleSpan.textContent = 'InfoBlend AI';
    
    const controls = document.createElement('div');
    controls.className = 'infoblend-controls';

    const pinBtn = document.createElement('button');
    pinBtn.className = 'infoblend-btn infoblend-pin';
    pinBtn.innerHTML = '📌'; 
    pinBtn.title = 'Pin Overlay';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'infoblend-btn infoblend-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close Overlay');

    controls.appendChild(pinBtn);
    controls.appendChild(closeBtn);
    header.appendChild(titleSpan);
    header.appendChild(controls);

    const loading = document.createElement('div');
    loading.className = 'infoblend-loading';
    
    const skeletonGroup = document.createElement('div');
    skeletonGroup.className = 'ib-skeleton-group';
    
    // Create a few skeleton lines
    const skTitle = document.createElement('div');
    skTitle.className = 'ib-skeleton ib-sk-title';
    const skLine1 = document.createElement('div');
    skLine1.className = 'ib-skeleton ib-sk-line';
    const skLine2 = document.createElement('div');
    skLine2.className = 'ib-skeleton ib-sk-line';
    const skLine3 = document.createElement('div');
    skLine3.className = 'ib-skeleton ib-sk-line-short';
    
    skeletonGroup.appendChild(skTitle);
    skeletonGroup.appendChild(skLine1);
    skeletonGroup.appendChild(skLine2);
    skeletonGroup.appendChild(skLine3);
    
    loading.appendChild(skeletonGroup);

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
    
    // Trigger height transition for the loading state
    setTimeout(() => container.classList.add('open'), 10);
    
    return container;
  }

  const _highlightPatterns = [
    /\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g,
    /\b(?:AI|LLM|API|HTML|CSS|JS|URL|HTTP|JSON)\b/g,
    /\b(?:algorithm|neural network|machine learning|automation|intelligence|optimization|minimalist|glassmorphism|gerund)\b/gi
  ];
  const _highlightCombinedPattern = new RegExp(_highlightPatterns.map(p => p.source).join('|'), 'gi');

  function smartHighlight(text) {
    if (!text) return document.createTextNode('');
    const fragment = document.createDocumentFragment();
    const seen = new Set();
    let lastIndex = 0;
    
    _highlightCombinedPattern.lastIndex = 0; // Essential reset since it's global
    let match;
    while ((match = _highlightCombinedPattern.exec(text)) !== null) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      const term = match[0];
      const cleanTerm = term.toLowerCase();
      if (cleanTerm.length >= 3 && !seen.has(cleanTerm)) {
        seen.add(cleanTerm);
        const span = document.createElement('span');
        span.className = 'ib-highlight';
        span.textContent = term;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(term));
      }
      lastIndex = _highlightCombinedPattern.lastIndex;
    }
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    return fragment;
  }

  async function updateOverlay(title, content, source) {
    let container;
    if (!overlayHost || !overlayHost.shadowRoot) {
      container = showLoadingOverlay();
    } else {
      container = overlayHost.shadowRoot.querySelector('.infoblend-overlay');
      if (!container) container = showLoadingOverlay();
    }
    
    // Start height transition
    setTimeout(() => container.classList.add('open'), 10);
    
    const header = container.querySelector('.infoblend-header');
    header.querySelector('.infoblend-title').textContent = title;
    
    const oldContent = container.querySelector('.infoblend-content');
    if (oldContent) oldContent.remove();
    const loading = container.querySelector('.infoblend-loading');
    if (loading) loading.remove();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'infoblend-content';
    const bentoGrid = document.createElement('div');
    bentoGrid.className = 'ib-bento-grid';

    try {
      // INTELLECTUALLY FRAGMENT CONTENT INTO BENTO CARDS
      // Split by double newlines or list items
      const fragments = content.split(/\n\n|(?=\n[ \t]*[-*•]|\n[ \t]*\d+\.)/);
      
      fragments.forEach(frag => {
        const trimmed = frag.trim();
        if (!trimmed) return;
        
        const card = document.createElement('div');
        card.className = 'ib-bento-card';
        card.style.color = '#ffffff'; // ABSOLUTE INLINE WHITE
        card.style.background = '#000000'; // ABSOLUTE INLINE BLACK
        card.appendChild(smartHighlight(trimmed));
        bentoGrid.appendChild(card);

      });

      if (bentoGrid.children.length === 0) {
        // Fallback if split failed
        const card = document.createElement('div');
        card.className = 'ib-bento-card';
        card.appendChild(smartHighlight(content));
        bentoGrid.appendChild(card);
      }
    } catch (e) {
      console.warn("Bento fragmentation failed:", e);
      const card = document.createElement('div');
      card.className = 'ib-bento-card';
      card.appendChild(smartHighlight(content));
      bentoGrid.appendChild(card);
    }
    
    const sourceDiv = document.createElement('div');
    sourceDiv.className = 'infoblend-source';
    sourceDiv.textContent = `Source: ${source}`;
    
    contentDiv.appendChild(bentoGrid);
    contentDiv.appendChild(sourceDiv);
    
    const progressContainer = container.querySelector('.infoblend-progress-container');
    container.insertBefore(contentDiv, progressContainer);

    const controls = container.querySelector('.infoblend-controls');
    if (!controls.querySelector('.infoblend-copy')) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'infoblend-btn infoblend-copy';
      copyBtn.innerHTML = '📋';
      copyBtn.title = 'Copy';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(content);
        copyBtn.innerHTML = '✅';
        setTimeout(() => copyBtn.innerHTML = '📋', 2000);
      };
      controls.insertBefore(copyBtn, controls.lastChild);
    }

    if (title.toLowerCase().includes('summary')) {
      saveToHistory(title, content);
    }

    setupOverlayEvents(overlayHost, container);
    
    // BENTO FLASHLIGHT MOUSE TRACKING
    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      container.style.setProperty('--mouse-x', `${x}px`);
      container.style.setProperty('--mouse-y', `${y}px`);
    });

    
    const wordCount = content.split(/\s+/).length;
    const delay = Math.max(10000, (wordCount / 200) * 60 * 1000 + 5000); 
    startAutoCloseTimer(overlayHost, container, delay);
    container.setAttribute('tabindex', '-1');
    container.focus();
  }

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
      const percentage = (remaining / delay) * 100;
      progressBar.style.width = `${percentage}%`;
      if (remaining <= 0) closeOverlay(host, container);
      else animationFrameId = requestAnimationFrame(update);
    };

    const handleMouseEnter = () => { isPaused = true; };
    const handleMouseLeave = () => { 
      isPaused = false; 
      if (!host._isPinned) {
        startTime = Date.now() - (delay - (parseFloat(progressBar.style.width) / 100 * delay));
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
    // Clear selection to prevent immediate re-trigger on next click
    window.getSelection().removeAllRanges();
    setTimeout(() => {
      if (host.parentNode) host.remove();
      if (overlayHost === host) overlayHost = null;
    }, 400);
  }

  function setupOverlayEvents(host, container) {
    const closeBtn = container.querySelector('.infoblend-close');
    if (closeBtn) {
      closeBtn.onclick = null; // Clear old
      closeBtn.onclick = (e) => { 
        e.preventDefault();
        e.stopPropagation(); 
        closeOverlay(host, container); 
      };
    }
    const pinBtn = container.querySelector('.infoblend-pin');
    if (pinBtn) {
      pinBtn.onclick = null; // Clear old
      pinBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        host._isPinned = !host._isPinned;
        pinBtn.classList.toggle('active', host._isPinned);
        const progressBar = container.querySelector('.infoblend-progress-bar');
        if (host._isPinned) { if (progressBar) progressBar.style.width = '100%'; }
        else startAutoCloseTimer(host, container);
      };
    }

    // Dragging is disabled for the static Sidebar format.
    // If floating is restored in the future, dragging logic goes here.
  }

  async function saveToHistory(title, content) {
    const data = await getStorage(['summaryHistory']);
    const history = data.summaryHistory || [];
    history.push({ 
      title: document.title, 
      content: content.substring(0, 100) + '...',
      timestamp: Date.now() 
    });
    if (history.length > 10) history.shift();
    setStorage({ summaryHistory: history });
  }
})();
