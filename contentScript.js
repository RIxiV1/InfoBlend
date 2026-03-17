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
      const summary = generateIntelligentSummary();
      updateOverlay('Page Summary', summary, 'InfoBlend Intelligent Summarizer');
    } else if (message.type === 'SUMMARIZE_SELECTION') {
      showLoadingOverlay();
      const summary = generateIntelligentSummary(message.text);
      updateOverlay('Selection Summary', summary, 'InfoBlend Selection Summarizer');
    }
  });

  // Intelligent Summarization Logic (TF-IDF inspired extractive algorithm)
  function generateIntelligentSummary(manualText = null) {
    const pageText = manualText || document.body.innerText;
    
    let content;
    if (manualText) {
      content = manualText;
    } else {
      // Target main content areas for better quality
      const contentSources = Array.from(document.querySelectorAll('p, article, section, h1, h2, h3'))
        .map(el => el.innerText.trim())
        .filter(text => text.length > 40);
      content = contentSources.join(' ') || pageText;
    }
    
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
    
    if (sentences.length <= 4) return sentences.join(' ');

    // Score sentences based on word frequency
    const words = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const freq = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);

    const scores = sentences.map(s => {
      const sWords = s.toLowerCase().match(/\b\w{4,}\b/g) || [];
      const wordScore = sWords.reduce((acc, w) => acc + (freq[w] || 0), 0);
      return wordScore / (Math.sqrt(sWords.length) || 1); // Normalize by length
    });

    // Pick top 4 sentences and sort by appearance order
    const topIndices = scores
      .map((score, index) => ({ score, index }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(item => item.index)
      .sort((a, b) => a - b);

    return topIndices.map(i => sentences[i].trim()).join(' ');
  }

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

  function showLoadingOverlay() {
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
    container.innerHTML = `
      <div class="infoblend-header">
        <span class="infoblend-title">InfoBlend AI</span>
        <button class="infoblend-close">&times;</button>
      </div>
      <div class="infoblend-loading">
        <div class="infoblend-spinner"></div>
      </div>
      <div class="infoblend-progress-container">
        <div class="infoblend-progress-bar"></div>
      </div>
    `;
    shadow.appendChild(container);
    
    setupOverlayEvents(overlay, container);
    startAutoCloseTimer(overlay, container);
  }

  function smartHighlight(text) {
    if (!text) return text;
    
    const patterns = [
      /\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g, // Proper nouns
      /\b(?:AI|LLM|API|HTML|CSS|JS|URL|HTTP|JSON)\b/g, // Acronyms
      /\b(?:algorithm|neural network|machine learning|automation|intelligence|optimization|minimalist|glassmorphism|gerund)\b/gi // Keywords
    ];

    // Split by tags to only process text nodes (prevents highlighting HTML attributes/tags)
    const segments = text.split(/(<[^>]*>)/);
    const seen = new Set();

    return segments.map(segment => {
      if (segment.startsWith('<')) return segment; // Return tags as-is

      let highlighted = segment;
      patterns.forEach(pattern => {
        highlighted = highlighted.replace(pattern, (match) => {
          const cleanMatch = match.toLowerCase();
          if (cleanMatch.length < 3 || seen.has(cleanMatch)) return match;
          seen.add(cleanMatch);
          return `<span class="ib-highlight">${match}</span>`;
        });
      });
      return highlighted;
    }).join('');
  }

  function updateOverlay(title, content, source) {
    if (!overlay) {
      showLoadingOverlay();
    }
    
    const highlightedContent = smartHighlight(content);
    const container = overlay.shadowRoot.querySelector('.infoblend-overlay');
    container.innerHTML = `
      <div class="infoblend-header">
        <span class="infoblend-title">${title}</span>
        <button class="infoblend-close">&times;</button>
      </div>
      <div class="infoblend-content">
        ${highlightedContent}
        <div class="infoblend-source">Source: ${source}</div>
      </div>
      <div class="infoblend-progress-container">
        <div class="infoblend-progress-bar"></div>
      </div>
    `;
    setupOverlayEvents(overlay, container);
    startAutoCloseTimer(overlay, container);
  }

  function startAutoCloseTimer(host, container) {
    let startTime = Date.now();
    let isPaused = false;
    let animationFrameId = null;
    const progressBar = container.querySelector('.infoblend-progress-bar');
    
    const update = () => {
      if (isPaused || !host.parentNode || !progressBar) {
        if (!isPaused) cancelAnimationFrame(animationFrameId);
        return;
      }
      
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, AUTO_CLOSE_DELAY - elapsed);
      const percentage = (remaining / AUTO_CLOSE_DELAY) * 100;
      
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
      startTime = Date.now() - (AUTO_CLOSE_DELAY - (parseFloat(progressBar.style.width) / 100 * AUTO_CLOSE_DELAY));
      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);
    
    // Cleanup timer on removal
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
      closeBtn.replaceWith(closeBtn.cloneNode(true)); // Clean old listeners
      container.querySelector('.infoblend-close').onclick = (e) => {
        e.stopPropagation();
        closeOverlay(host, container);
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
