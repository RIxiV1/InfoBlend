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
    if (selection && selection.length > 1 && selection.length < 50) {
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
    } else if (message.type === 'SUMMARIZE_PAGE') {
      showLoadingOverlay();
      // Simple extractive summarization logic (moved here for simplicity in content script)
      const pageText = document.body.innerText;
      const sentences = pageText.match(/[^.!?]+[.!?]+/g) || [pageText];
      const summary = sentences.slice(0, 3).join(' '); // Basic fallback
      updateOverlay('Page Summary', summary, 'InfoBlend Summarizer');
    }
  });

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
  function showLoadingOverlay() {
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.className = 'infoblend-overlay';
    overlay.innerHTML = `
      <div class="infoblend-header">
        <span class="infoblend-title">InfoBlend AI</span>
        <button class="infoblend-close">&times;</button>
      </div>
      <div class="infoblend-loading">
        <div class="infoblend-spinner"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    setupOverlayEvents(overlay);
  }

  function updateOverlay(title, content, source) {
    if (!overlay) showLoadingOverlay();
    overlay.innerHTML = `
      <div class="infoblend-header">
        <span class="infoblend-title">${title}</span>
        <button class="infoblend-close">&times;</button>
      </div>
      <div class="infoblend-content">
        ${content}
        <div class="infoblend-source">Source: ${source}</div>
      </div>
    `;
    setupOverlayEvents(overlay);
  }

  function setupOverlayEvents(el) {
    el.querySelector('.infoblend-close').onclick = () => {
      el.remove();
      overlay = null;
    };

    // Simple drag logic
    let isDragging = false;
    let startX, startY, initialX, initialY;

    const header = el.querySelector('.infoblend-header');
    header.onmousedown = (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialX = el.offsetLeft;
      initialY = el.offsetTop;
      header.style.cursor = 'grabbing';
    };

    document.onmousemove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = `${initialX + dx}px`;
      el.style.top = `${initialY + dy}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };

    document.onmouseup = () => {
      isDragging = false;
      header.style.cursor = 'move';
    };
  }
})();
