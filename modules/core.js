/**
 * InfoBlend — Core Module
 * Shared utilities. Loaded once via chrome.scripting.executeScript.
 */
(() => {
  // Re-injection guard: only skip if functions are actually present
  // (after extension reload, flags survive but functions don't)
  if (window.__ib?._coreLoaded && typeof window.__ib.createShadowHost === 'function') return;

  const ib = window.__ib;
  ib._coreLoaded = true;

  /**
   * Creates an isolated Shadow DOM host with stylesheets.
   */
  const createShadowHost = (id, cssFiles = ['styles/content.css']) => {
    const host = document.createElement('div');
    host.id = id;
    Object.assign(host.style, {
      all: 'initial', position: 'fixed', top: '0', left: '0',
      width: '0', height: '0', overflow: 'visible', zIndex: '2147483647'
    });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    for (const file of cssFiles) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(file);
      shadow.appendChild(link);
    }

    return { host, shadow };
  };

  // --- Smart Highlighting (technical acronyms) ---
  const _highlightPattern = /\b(?:AI|ML|LLM|API|HTML|CSS|GPU|CPU|URL|HTTP|HTTPS|JSON|XML|SQL|REST|SDK|CLI|DNS|TCP|UDP|SSH|SSL|TLS|OAuth|JWT|CORS|CRUD|DOM|IoT|SaaS|AWS|GCP|NLP)\b/g;

  const smartHighlight = (text) => {
    if (!text) return document.createTextNode('');
    const fragment = document.createDocumentFragment();
    const seen = new Set();
    let lastIndex = 0;

    _highlightPattern.lastIndex = 0;
    let match;
    while ((match = _highlightPattern.exec(text)) !== null) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
      const term = match[0];
      if (!seen.has(term)) {
        seen.add(term);
        const span = document.createElement('span');
        span.className = 'ib-highlight';
        span.textContent = term;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(term));
      }
      lastIndex = _highlightPattern.lastIndex;
    }
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    return fragment;
  };

  // --- Bento Grid Renderer (for summaries) ---
  class BentoRenderer {
    static render(content, container) {
      const grid = document.createElement('div');
      grid.className = 'ib-bento-grid';

      const fragments = content
        .split(/\n\n+|(?=\n[ \t]*[-*•]|\n[ \t]*\d+\.)/)
        .map(f => f.trim())
        .filter(f => f.length > 5);

      const items = fragments.length ? fragments : [content];
      for (const frag of items) {
        const card = document.createElement('div');
        card.className = 'ib-bento-card';
        card.appendChild(smartHighlight(frag));
        grid.appendChild(card);
      }
      container.appendChild(grid);
    }
  }

  Object.assign(ib, { createShadowHost, smartHighlight, BentoRenderer });
})();
