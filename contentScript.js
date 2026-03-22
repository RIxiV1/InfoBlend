/**
 * Content script for InfoBlend AI.
 */

(async () => {
  // Helper to get storage data (since we can't easily import in content scripts without web_accessible_resources)
  const getStorage = (keys) => new Promise(res => chrome.storage.local.get(keys, res));

  let overlay = null;

  // Listen for text selection
  document.addEventListener('mouseup', async (event) => {
    const selection = window.getSelection().toString().trim();
    // Only trigger automatic definition for single words (1-2 words max)
    const wordCount = selection.split(/\s+/).filter(w => w.length > 0).length;
    
    if (selection && wordCount > 0 && wordCount <= 2 && selection.length < 50) {
      const settings = await getStorage(['definitionsEnabled']);
      if (settings.definitionsEnabled !== false) {
        showLoadingOverlay();
        chrome.runtime.sendMessage({ type: 'FETCH_DEFINITION', word: selection }, (response) => {
          if (response && response.success) {
            updateOverlay(response.data.title, response.data.content, response.data.source);
          } else {
            updateOverlay('Error', 'Could not find definition.', 'InfoBlend');
          }
        });
      }
    }
  });

  // Listen for messages from background script or popup
  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === 'SHOW_DEFINITION') {
      updateOverlay(message.data.title, message.data.content, message.data.source);
    } else if (message.type === 'SHOW_ERROR') {
      updateOverlay('Error', message.message, 'InfoBlend');
    } else if (message.type === 'SHOW_LOADING') {
      showLoadingOverlay();
    } else if (message.type === 'SUMMARIZE_PAGE') {
      showLoadingOverlay();
      const contentSources = Array.from(document.querySelectorAll('p, article, section, h1, h2, h3'))
        .map(el => el.innerText.trim())
        .filter(text => text.length > 40);
      const content = contentSources.join(' ') || document.body.innerText;
      
      const worker = new Worker(chrome.runtime.getURL('utils/summarizer.worker.js'));
      worker.postMessage({ text: content });
      worker.onmessage = (e) => {
        updateOverlay('Page Summary', e.data, 'InfoBlend Intelligent Summarizer');
        worker.terminate();
      };
    } else if (message.type === 'SUMMARIZE_SELECTION') {
      showLoadingOverlay();
      const worker = new Worker(chrome.runtime.getURL('utils/summarizer.worker.js'));
      worker.postMessage({ text: message.text, manualText: message.text });
      worker.onmessage = (e) => {
        updateOverlay('Selection Summary', e.data, 'InfoBlend Selection Summarizer');
        worker.terminate();
      };
    }
  });

  // Summary logic removed from main thread (now in Worker)

  // Form Auto-fill Logic
  const autofillForms = async () => {
    const settings = await getStorage(['autofillEnabled', 'userData']);
    if (settings.autofillEnabled && settings.userData) {
      const { name, email, phone } = settings.userData;
      const inputs = document.querySelectorAll('input');
      
      inputs.forEach(input => {
        const nameAttr = (input.name || '').toLowerCase();
        const idAttr = (input.id || '').toLowerCase();
        const typeAttr = (input.type || '').toLowerCase();

        if (name && (nameAttr.includes('name') || idAttr.includes('name'))) {
          if (!input.value) input.value = name;
        }
        if (email && (typeAttr === 'email' || nameAttr.includes('email') || idAttr.includes('email'))) {
          if (!input.value) input.value = email;
        }
        if (phone && (typeAttr === 'tel' || nameAttr.includes('phone') || idAttr.includes('phone'))) {
          if (!input.value) input.value = phone;
        }
      });
    }
  };

  // Run autofill on page load
  autofillForms();

  // Overlay Management
  let autoCloseTimer = null;
  let remainingTime = 10000;
  const AUTO_CLOSE_DELAY = 10000;

  async function showLoadingOverlay() {
    if (overlay) overlay.remove();
    clearTimeout(autoCloseTimer);
    
    overlay = document.createElement('div');
    overlay.id = 'infoblend-shadow-host';
    overlay.style.all = 'initial';
    overlay.style.position = 'fixed';
    overlay.style.bottom = '24px';
    overlay.style.right = '24px';
    overlay.style.zIndex = '2147483647';
    document.body.appendChild(overlay);

    const shadow = overlay.attachShadow({ mode: 'open' });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('overlay/overlay.css');
    shadow.appendChild(link);

    const container = document.createElement('div');
    container.className = 'infoblend-overlay';

    // Apply Theme
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
    
    const pinBtn = document.createElement('button');
    pinBtn.className = 'infoblend-pin';
    pinBtn.innerHTML = '📌'; // Using emoji for simplicity, or SVG
    pinBtn.title = 'Pin Overlay';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'infoblend-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close Overlay');

    header.appendChild(titleSpan);
    header.appendChild(pinBtn);
    header.appendChild(closeBtn);

    const loading = document.createElement('div');
    loading.className = 'infoblend-loading';
    const spinner = document.createElement('div');
    spinner.className = 'infoblend-spinner';
    loading.appendChild(spinner);

    const progressContainer = document.createElement('div');
    progressContainer.className = 'infoblend-progress-container';
    const progressBar = document.createElement('div');
    progressBar.className = 'infoblend-progress-bar';
    progressContainer.appendChild(progressBar);

    container.appendChild(header);
    container.appendChild(loading);
    container.appendChild(progressContainer);
    
    shadow.appendChild(container);
    
    setupOverlayEvents(overlay, container);
    startAutoCloseTimer(overlay, container);
  }

  function smartHighlight(text) {
    if (!text) return document.createTextNode('');
    
    const patterns = [
      /\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g, // Proper nouns
      /\b(?:AI|LLM|API|HTML|CSS|JS|URL|HTTP|JSON)\b/g, // Acronyms
      /\b(?:algorithm|neural network|machine learning|automation|intelligence|optimization|minimalist|glassmorphism|gerund)\b/gi // Keywords
    ];

    const fragment = document.createDocumentFragment();
    const seen = new Set();

    // Simple replacement logic that preserves nodes
    let lastIndex = 0;
    const combinedPattern = new RegExp(patterns.map(p => p.source).join('|'), 'gi');
    
    let match;
    while ((match = combinedPattern.exec(text)) !== null) {
      // Add text before match
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
    
    // Add remaining text
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    return fragment;
  }

  function updateOverlay(title, content, source) {
    if (!overlay) {
      showLoadingOverlay();
    }
    
    const container = overlay.shadowRoot.querySelector('.infoblend-overlay');
    const header = container.querySelector('.infoblend-header');
    header.querySelector('.infoblend-title').textContent = title;
    
    // Remove old content/loading
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
    
    // Insert before progress bar
    const progressContainer = container.querySelector('.infoblend-progress-container');
    container.insertBefore(contentDiv, progressContainer);

    setupOverlayEvents(overlay, container);
    
    // Summary logic: give more time based on word count
    const wordCount = content.split(/\s+/).length;
    const baseDelay = 10000;
    const wordDelay = (wordCount / 200) * 60 * 1000; // 200 wpm
    const delay = Math.max(baseDelay, wordDelay + 5000); 
    
    startAutoCloseTimer(overlay, container, delay);
    
    // Accessibility: Move focus
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
      
      if (remaining <= 0) {
        closeOverlay(host, container);
      } else {
        animationFrameId = requestAnimationFrame(update);
      }
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
    
    host._stopTimer = () => {
      isPaused = true;
      cancelAnimationFrame(animationFrameId);
    };
  }

  function closeOverlay(host, container) {
    if (host._stopTimer) host._stopTimer();
    container.classList.add('ib-fade-out');
    setTimeout(() => {
      if (host.parentNode) host.remove();
      if (overlay === host) overlay = null;
    }, 400);
  }

  function setupOverlayEvents(host, container) {
    // Re-bind close button
    const closeBtn = container.querySelector('.infoblend-close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeOverlay(host, container);
      };
    }

    // Bind pin button
    const pinBtn = container.querySelector('.infoblend-pin');
    if (pinBtn) {
      pinBtn.onclick = (e) => {
        e.stopPropagation();
        host._isPinned = !host._isPinned;
        pinBtn.classList.toggle('active', host._isPinned);
        const progressBar = container.querySelector('.infoblend-progress-bar');
        if (host._isPinned) {
          if (progressBar) progressBar.style.width = '100%';
        } else {
          startAutoCloseTimer(host, container);
        }
      };
    }

    // Drag logic initialization (only if not already set)
    if (host._dragInitialized) return;
    host._dragInitialized = true;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    const header = container.querySelector('.infoblend-header');
    header.onmousedown = (e) => {
      if (e.target.closest('.infoblend-close')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      header.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      host.style.left = `${initialX + dx}px`;
      host.style.top = `${initialY + dy}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      header.style.cursor = 'move';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node === host) {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            if (host._stopTimer) host._stopTimer();
            observer.disconnect();
          }
        });
      });
    });
    observer.observe(document.body, { childList: true });
  }
})();
