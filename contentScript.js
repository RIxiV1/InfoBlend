/**
 * Content script for InfoBlend AI.
 * Premium Deep-Tech Web Augmentation.
 */

const Z_INDEX = '2147483647';
const SHADOW_STYLES = `
  :host {
    all: initial;
    display: block;
    color-scheme: only light;
    --ib-bg: #ffffff;
    --ib-text: #1a1a1a;
    --ib-text-dim: #666666;
    --ib-border: rgba(0,0,0,0.1);
    --ib-card-bg: #f8f9fa;
    --ib-skel-s: rgba(0,0,0,0.05);
    --ib-skel-m: rgba(0,0,0,0.1);
    --ib-accent-color: #f5a623;
    --ib-accent-low: rgba(245, 166, 35, 0.15);
    --ib-font-serif: 'Instrument Serif', serif;
    --ib-font-mono: 'Geist Mono', 'SF Mono', ui-monospace, monospace;
  }

  /* Handle Dark Mode Override */
  @media (prefers-color-scheme: dark) {
    :host {
      --ib-bg: #121212;
      --ib-text: #e0e0e0;
      --ib-text-dim: #a0a0a0;
      --ib-border: rgba(255,255,255,0.1);
      --ib-card-bg: #1e1e1e;
      --ib-skel-s: rgba(255,255,255,0.05);
      --ib-skel-m: rgba(255,255,255,0.1);
    }
  }

  .infoblend-overlay, .infoblend-content, .ib-bento-grid, .ib-bento-card {
    color: var(--ib-text) !important;
  }

  .infoblend-overlay * {
    color: inherit !important;
    font-family: inherit !important;
    box-sizing: border-box;
  }

  .infoblend-overlay {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 330px;
    background: var(--ib-bg) !important;
    backdrop-filter: blur(12px) saturate(180%);
    -webkit-backdrop-filter: blur(12px) saturate(180%);
    border: 1px solid var(--ib-border) !important;
    border-radius: 20px;
    box-shadow: 0 40px 100px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(255,255,255,0.05);
    z-index: ${Z_INDEX};
    font-family: var(--ib-font-mono) !important;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto 0fr;
    transition: 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    animation: ibSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  
  @keyframes ibSlideIn {
    from { opacity: 0; transform: translateY(20px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .infoblend-overlay.open { grid-template-rows: auto 1fr; }
  .infoblend-overlay.ib-fade-out { opacity: 0; transform: scale(0.95); pointer-events: none; }
  
  .infoblend-content { 
    padding: 12px; 
    overflow-y: auto; 
    max-height: 70vh; 
    scrollbar-width: none;
  }
  .infoblend-content::-webkit-scrollbar { display: none; }
  
  .ib-bento-grid { display: flex; flex-direction: column; gap: 10px; padding: 4px; }
  
  .ib-bento-card {
    position: relative;
    background: var(--ib-card-bg) !important;
    padding: 16px;
    border-radius: 16px;
    font-size: 14.5px !important;
    line-height: 1.6 !important;
    border: 1px solid var(--ib-border) !important;
  }

  .ib-highlight { 
    color: var(--ib-accent-color) !important; 
    font-weight: 600 !important; 
    background: var(--ib-accent-low); 
    border-radius: 6px; 
    padding: 1px 4px;
  }

  .infoblend-header { 
    padding: 14px 18px; 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    border-bottom: 1px solid var(--ib-border); 
    background: rgba(0,0,0,0.02);
  }

  .infoblend-title { 
    font-family: var(--ib-font-serif) !important; 
    font-size: 16px; 
    font-style: italic; 
    color: var(--ib-text) !important;
  }

  .infoblend-controls { display: flex; gap: 8px; }
  
  .infoblend-btn {
    background: transparent !important; 
    color: var(--ib-text-dim) !important; 
    cursor: pointer;
    padding: 6px; 
    border-radius: 8px; 
    border: none;
    transition: 0.2s;
  }
  
  .infoblend-btn:hover { color: var(--ib-text) !important; background: rgba(0,0,0,0.08) !important; }
  
  .infoblend-source { 
    margin-top: 10px;
    font-size: 11px;
    color: var(--ib-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .infoblend-loading { padding: 30px; display: flex; flex-direction: column; gap: 12px; }
  .ib-skeleton { 
    background: linear-gradient(90deg, var(--ib-skel-s) 25%, var(--ib-skel-m) 50%, var(--ib-skel-s) 75%); 
    background-size: 200% 100%;
    animation: ib-shimmer 1.5s infinite;
    border-radius: 4px;
  }
  @keyframes ib-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .ib-sk-title { height: 20px; width: 40%; }
  .ib-sk-line { height: 12px; width: 100%; }
  
  .infoblend-progress-container { height: 3px; width: 100%; background: rgba(0,0,0,0.05); }
  .infoblend-progress-bar { height: 100%; width: 0; background: var(--ib-accent-color); transition: width 0.1s linear; }
`;

(async () => {
  const isContextValid = () => {
    try { return !!(chrome.runtime && chrome.runtime.id); } 
    catch (e) { return false; }
  };

  const safeGetURL = (path) => {
    try { return chrome.runtime.getURL(path); } 
    catch (e) { return ''; }
  };

  const getStorage = async (keys) => (await chrome.storage.local.get(keys)) || {};

  const sendMessage = async (msg, cb) => {
    try {
      if (!isContextValid()) {
        if (cb) cb({ success: false, error: 'Context invalidated' });
        return;
      }
      const response = await chrome.runtime.sendMessage(msg);
      if (cb) cb(response);
    } catch (e) {
      if (cb) cb({ success: false, error: e.message || 'Communication Error' });
    }
  };

  const createShadowHost = (id) => {
    const host = document.createElement('div');
    host.id = id;
    Object.assign(host.style, {
      all: 'initial', position: 'fixed', top: '0', left: '0', width: '0', height: '0', zIndex: Z_INDEX
    });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = SHADOW_STYLES;
    shadow.appendChild(style);
    return { host, shadow };
  };

  /**
   * BentoRenderer handles grid-based text fragmentation.
   */
  class BentoRenderer {
    static fragment(text) {
      if (!text) return [];
      const fragments = text.split(/\n\n|(?=\n[ \t]*[-*•]|\n[ \t]*\d+\.)/);
      const refined = fragments.flatMap(frag => {
        const trimmed = frag.trim();
        if (trimmed.length > 400 && !trimmed.includes('\n')) {
          const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
          return sentences.map(s => s.trim());
        }
        return [trimmed];
      }).filter(r => r.length > 5);
      return refined;
    }

    static render(content, container) {
      const bentoGrid = document.createElement('div');
      bentoGrid.className = 'ib-bento-grid';
      const fragments = this.fragment(content);
      fragments.forEach(frag => {
        const card = document.createElement('div');
        card.className = 'ib-bento-card';
        card.appendChild(smartHighlight(frag));
        bentoGrid.appendChild(card);
      });
      if (!bentoGrid.children.length) {
        const fallback = document.createElement('div');
        fallback.className = 'ib-bento-card';
        fallback.appendChild(smartHighlight(content));
        bentoGrid.appendChild(fallback);
      }
      container.appendChild(bentoGrid);
    }
  }

  let overlayHost = null;
  let paletteHost = null;

  async function togglePalette() {
    if (paletteHost) { paletteHost.remove(); paletteHost = null; return; }
    const { host, shadow } = createShadowHost('infoblend-palette-host');
    paletteHost = host;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = safeGetURL('overlay/overlay.css');
    shadow.appendChild(link);

    const overlayBg = document.createElement('div');
    overlayBg.className = 'ib-palette-overlay';
    overlayBg.onclick = () => togglePalette();

    const paletteDiv = document.createElement('div');
    paletteDiv.className = 'ib-palette';
    paletteDiv.onclick = (e) => e.stopPropagation();

    const searchArea = document.createElement('div');
    searchArea.className = 'ib-palette-search';
    searchArea.innerHTML = `<input class="ib-palette-input" placeholder="Search prompts or redefine..." spellcheck="false">`;
    const input = searchArea.querySelector('input');

    const resultsArea = document.createElement('div');
    resultsArea.className = 'ib-palette-results';

    const commands = [
      { id: 'summarize', label: 'Summarize Page', icon: '📝' },
      { id: 'define', label: 'Define Term...', icon: '📖' }
    ];

    const renderResults = (filter = '') => {
      resultsArea.innerHTML = '';
      const filtered = commands.filter(c => c.label.toLowerCase().includes(filter.toLowerCase()));
      if (filter && !filtered.length) {
        filtered.push({ id: 'define-word', label: `Define "${filter}"`, icon: '🔍', word: filter });
      }
      filtered.forEach((cmd) => {
        const item = document.createElement('div');
        item.className = 'ib-palette-item';
        item.innerHTML = `<span>${cmd.icon} ${cmd.label}</span>`;
        item.onclick = () => {
          togglePalette();
          if (cmd.id === 'summarize') handlePageSummarization();
          else if (cmd.id === 'define-word') {
            showLoadingOverlay();
            sendMessage({ type: 'FETCH_DEFINITION', word: cmd.word }, (resp) => {
              if (resp?.success) updateOverlay(resp.data.title, resp.data.content, resp.data.source);
            });
          }
        };
        resultsArea.appendChild(item);
      });
    };

    renderResults();
    input.oninput = (e) => renderResults(e.target.value);
    input.onkeydown = (e) => { if (e.key === 'Escape') togglePalette(); };
    paletteDiv.appendChild(searchArea);
    paletteDiv.appendChild(resultsArea);
    shadow.appendChild(overlayBg);
    overlayBg.appendChild(paletteDiv);
    setTimeout(() => input.focus(), 50);
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); togglePalette();
    }
  });

  document.addEventListener('mouseup', async (event) => {
    if (event.composedPath().some(el => el.id === 'infoblend-shadow-host')) return;
    const selection = window.getSelection().toString().trim();
    if (selection && selection.split(/\s+/).length <= 2 && selection.length < 50) {
      const settings = await getStorage(['definitionsEnabled']);
      if (settings.definitionsEnabled !== false) {
        showLoadingOverlay();
        sendMessage({ type: 'FETCH_DEFINITION', word: selection }, (resp) => {
          if (resp?.success) updateOverlay(resp.data.title, resp.data.content, resp.data.source);
          else updateOverlay('Notice', resp?.error || 'No entry found.', 'InfoBlend');
        });
      }
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SHOW_DEFINITION') updateOverlay(message.data.title, message.data.content, message.data.source);
    else if (message.type === 'SHOW_ERROR') updateOverlay('Error', message.message, 'InfoBlend');
    else if (message.type === 'SHOW_LOADING') showLoadingOverlay();
    else if (message.type === 'SUMMARIZE_PAGE') handlePageSummarization();
  });

  async function handlePageSummarization() {
    showLoadingOverlay();
    if (window.location.hostname.includes('youtube.com') && window.location.pathname.includes('/watch')) {
      handleYouTubeSummarization();
      return;
    }
    const content = extractArticleContent();
    if (!content) {
      updateOverlay('Notice', 'No readable article content found.', 'InfoBlend');
      return;
    }
    runSummarizer(content, 'Page Summary');
  }

  function extractArticleContent() {
    const elements = document.querySelectorAll('p, h1, h2, h3, li');
    const prose = Array.from(elements)
      .map(el => el.innerText.trim())
      .filter(text => text.length > 30);
    return prose.length > 5 ? prose.join('\n\n').substring(0, 8000) : null;
  }

  function handleYouTubeSummarization() {
    const scriptTag = Array.from(document.scripts).find(s => s.textContent.includes('ytInitialPlayerResponse'));
    const match = scriptTag?.textContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks?.length) {
          sendMessage({ type: 'PROCESS_YOUTUBE_TRACKS', tracks }, (resp) => {
            if (resp?.success) runSummarizer(resp.transcript, 'Video Summary');
            else updateOverlay('Notice', resp?.error || 'Failed to process transcript.', 'YouTube');
          });
          return;
        }
      } catch (e) { console.warn('[InfoBlend] Local parse failed.'); }
    }
    sendMessage({ type: 'FETCH_YOUTUBE_TRANSCRIPT', url: window.location.href }, (resp) => {
      if (resp?.success) runSummarizer(resp.transcript, 'Video Summary');
      else updateOverlay('Notice', resp?.error || 'Could not find transcripts.', 'YouTube');
    });
  }

  async function runSummarizer(text, title) {
    if (!text?.trim()) { updateOverlay('Notice', 'Empty content.', 'InfoBlend'); return; }
    sendMessage({ type: 'PERFORM_SUMMARIZATION', text }, (resp) => {
      if (resp?.success) updateOverlay(title, resp.summary, resp.method);
      else updateOverlay('Notice', resp?.error || 'Summary failed.', 'InfoBlend');
    });
  }

  function showLoadingOverlay() {
    if (overlayHost) overlayHost.remove();
    const { host, shadow } = createShadowHost('infoblend-shadow-host');
    overlayHost = host;
    const container = document.createElement('div');
    container.className = 'infoblend-overlay';
    container.innerHTML = `
      <div class="infoblend-header"><span class="infoblend-title">InfoBlend AI</span><button class="infoblend-btn">✕</button></div>
      <div class="infoblend-loading"><div class="ib-skeleton ib-sk-title"></div><div class="ib-skeleton ib-sk-line"></div><div class="ib-skeleton ib-sk-line"></div></div>
      <div class="infoblend-progress-container"><div class="infoblend-progress-bar"></div></div>
    `;
    container.querySelector('button').onclick = () => host.remove();
    shadow.appendChild(container);
    setTimeout(() => container.classList.add('open'), 10);
    return container;
  }

  function smartHighlight(text) {
    if (!text) return document.createTextNode('');
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }

  function updateOverlay(title, content, source) {
    const container = overlayHost?.shadowRoot?.querySelector('.infoblend-overlay') || showLoadingOverlay();
    container.querySelector('.infoblend-title').textContent = title;
    const loading = container.querySelector('.infoblend-loading'); if (loading) loading.remove();
    let contentDiv = container.querySelector('.infoblend-content');
    if (!contentDiv) {
      contentDiv = document.createElement('div');
      contentDiv.className = 'infoblend-content';
      container.insertBefore(contentDiv, container.querySelector('.infoblend-progress-container'));
    }
    contentDiv.innerHTML = '';
    BentoRenderer.render(content, contentDiv);
    const src = document.createElement('div'); src.className = 'infoblend-source'; src.textContent = `Source: ${source}`;
    contentDiv.appendChild(src);
    startAutoClose(overlayHost, container);
  }

  function startAutoClose(host, container) {
    const bar = container.querySelector('.infoblend-progress-bar');
    let start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const p = Math.max(0, 100 - (elapsed / 10000) * 100);
      bar.style.width = p + '%';
      if (p <= 0) host.remove();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
})();
