/**
 * Content script for InfoBlend AI.
 */

(async () => {
  // Helper to get storage data
  const getStorage = (keys) => new Promise(res => chrome.storage.local.get(keys, res));

  let overlay = null;

  // Listen for text selection
  document.addEventListener('mouseup', async (event) => {
    if (event.target && event.target.id === 'infoblend-shadow-host') return;
    const selection = window.getSelection().toString().trim();
    const wordCount = selection.split(/\s+/).filter(w => w.length > 0).length;
    
    if (selection && wordCount > 0 && wordCount <= 2 && selection.length < 50) {
      const settings = await getStorage(['definitionsEnabled']);
      if (settings.definitionsEnabled !== false) {
        showLoadingOverlay();
        chrome.runtime.sendMessage({ type: 'FETCH_DEFINITION', word: selection }, (response) => {
          if (response && response.success) {
            updateOverlay(response.data.title, response.data.content, response.data.source);
          } else {
            updateOverlay('Notice', response?.error || 'No definition found.', 'InfoBlend');
          }
        });
      }
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

  async function handlePageSummarization() {
    showLoadingOverlay();
    const contentSources = Array.from(document.querySelectorAll('p, article, section, h1, h2, h3'))
      .map(el => el.innerText.trim())
      .filter(text => text.length > 40);
    const content = contentSources.join(' ') || document.body.innerText;
    
    try {
      const settings = await getStorage(['aiEndpoint', 'aiKey', 'aiProvider']);
      if (settings.aiKey && settings.aiEndpoint) {
        chrome.runtime.sendMessage({ 
          type: 'SUMMARIZE_VIA_AI', 
          text: content.substring(0, 10000) 
        }, (response) => {
          if (response && response.success) {
            updateOverlay('Page Summary', response.summary, `AI (${settings.aiProvider})`);
          } else {
            console.warn('AI Summarization failed:', response?.error);
            runLocalSummarizer(content);
          }
        });
      } else {
        runLocalSummarizer(content);
      }
    } catch (error) {
      runLocalSummarizer(content);
    }
  }

  function runLocalSummarizer(text) {
    const workerMock = {
      terminate: () => {}
    };
    try {
      const worker = new Worker(chrome.runtime.getURL('utils/summarizer.worker.js'));
      worker.postMessage({ text: text });
      worker.onmessage = (e) => {
        updateOverlay('Summary', e.data, 'InfoBlend Local Summarizer');
        worker.terminate();
      };
      worker.onerror = (err) => {
        updateOverlay('Notice', 'Summarization failed.', 'InfoBlend');
        worker.terminate();
      };
    } catch (e) {
      updateOverlay('Notice', 'Worker error.', 'InfoBlend');
    }
  }

  // Form Auto-fill Logic
  const autofillForms = async () => {
    const settings = await getStorage(['autofillEnabled', 'userData']);
    if (settings.autofillEnabled && settings.userData) {
      const { name, email, phone } = settings.userData;
      const inputs = document.querySelectorAll('input');
      let filledCount = 0;
      
      inputs.forEach(input => {
        const nameAttr = (input.name || '').toLowerCase();
        const idAttr = (input.id || '').toLowerCase();
        const labelAttr = (input.getAttribute('aria-label') || '').toLowerCase();
        const typeAttr = (input.type || '').toLowerCase();
        const placeholder = (input.placeholder || '').toLowerCase();

        // Refined matching logic to reduce false positives
        const isName = /full.name|first.name|display.name|^name$|^fname$/i.test(nameAttr + idAttr + labelAttr + placeholder);
        const isEmail = typeAttr === 'email' || /email|e-mail|mail.address/i.test(nameAttr + idAttr + labelAttr + placeholder);
        const isPhone = typeAttr === 'tel' || /phone|tel|mobile|cell/i.test(nameAttr + idAttr + labelAttr + placeholder);

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

  async function showLoadingOverlay() {
    if (overlayHost) {
      overlayHost.remove();
      overlayHost = null;
    }
    clearTimeout(autoCloseTimer);
    
    overlayHost = document.createElement('div');
    overlayHost.id = 'infoblend-shadow-host';
    overlayHost.style.all = 'initial';
    overlayHost.style.position = 'fixed';
    overlayHost.style.bottom = '24px';
    overlayHost.style.right = '24px';
    overlayHost.style.zIndex = '2147483647';
    document.body.appendChild(overlayHost);

    const shadow = overlayHost.attachShadow({ mode: 'open' });

    // CSS must be added to shadow root
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('overlay/overlay.css');
    shadow.appendChild(link);

    const container = document.createElement('div');
    container.className = 'infoblend-overlay';

    const settings = await getStorage(['theme']);
    if (settings.theme === 'light' || 
       (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)) {
      container.classList.add('ib-light-theme');
    }

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
    const spinner = document.createElement('div');
    spinner.className = 'infoblend-spinner';
    const loadingText = document.createElement('div');
    loadingText.className = 'loading-text';
    loadingText.textContent = 'Analyzing...';
    
    loading.appendChild(spinner);
    loading.appendChild(loadingText);

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
    
    return container;
  }

  function smartHighlight(text) {
    if (!text) return document.createTextNode('');
    const patterns = [
      /\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g,
      /\b(?:AI|LLM|API|HTML|CSS|JS|URL|HTTP|JSON)\b/g,
      /\b(?:algorithm|neural network|machine learning|automation|intelligence|optimization|minimalist|glassmorphism|gerund)\b/gi
    ];
    const fragment = document.createDocumentFragment();
    const seen = new Set();
    let lastIndex = 0;
    const combinedPattern = new RegExp(patterns.map(p => p.source).join('|'), 'gi');
    let match;
    while ((match = combinedPattern.exec(text)) !== null) {
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
      lastIndex = combinedPattern.lastIndex;
    }
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    return fragment;
  }

  async function updateOverlay(title, content, source) {
    let container;
    if (!overlayHost || !overlayHost.shadowRoot) {
      container = await showLoadingOverlay();
    } else {
      container = overlayHost.shadowRoot.querySelector('.infoblend-overlay');
      if (!container) container = await showLoadingOverlay();
    }
    
    const header = container.querySelector('.infoblend-header');
    header.querySelector('.infoblend-title').textContent = title;
    
    const oldContent = container.querySelector('.infoblend-content');
    if (oldContent) oldContent.remove();
    const loading = container.querySelector('.infoblend-loading');
    if (loading) loading.remove();

    const contentDiv = document.createElement('div');
    contentDiv.className = 'infoblend-content';
    
    const textBody = document.createElement('div');
    textBody.className = 'infoblend-text-body';
    textBody.appendChild(smartHighlight(content));
    
    const sourceDiv = document.createElement('div');
    sourceDiv.className = 'infoblend-source';
    sourceDiv.textContent = `Source: ${source}`;
    
    contentDiv.appendChild(textBody);
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

    container.onmouseenter = () => { isPaused = true; };
    container.onmouseleave = () => { 
      isPaused = false; 
      if (!host._isPinned) {
        startTime = Date.now() - (delay - (parseFloat(progressBar.style.width) / 100 * delay));
        animationFrameId = requestAnimationFrame(update);
      }
    };
    animationFrameId = requestAnimationFrame(update);
    host._stopTimer = () => { isPaused = true; cancelAnimationFrame(animationFrameId); };
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

    if (host._dragInitialized) return;
    host._dragInitialized = true;
    let isDragging = false;
    let startX, startY, initialX, initialY;
    const header = container.querySelector('.infoblend-header');
    header.onmousedown = (e) => {
      if (e.target.closest('.infoblend-btn')) return;
      isDragging = true;
      startX = e.clientX; startY = e.clientY;
      const rect = container.getBoundingClientRect();
      initialX = rect.left; initialY = rect.top;
      header.style.cursor = 'grabbing';
      e.preventDefault();
    };
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      host.style.left = `${initialX + dx}px`;
      host.style.top = `${initialY + dy}px`;
      host.style.right = 'auto'; host.style.bottom = 'auto';
    };
    const handleMouseUp = () => { if (!isDragging) return; isDragging = false; header.style.cursor = 'move'; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
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
    chrome.storage.local.set({ summaryHistory: history });
  }
})();
