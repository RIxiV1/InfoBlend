/**
 * InfoBlend AI — Core Module
 * Shared utilities. Loaded once via chrome.scripting.executeScript.
 */
(() => {
  if (window.__ib?._coreLoaded) return;

  const ib = window.__ib;
  ib._coreLoaded = true;

  const safeGetURL = (path) => {
    try { return chrome.runtime.getURL(path); }
    catch { return ''; }
  };

  /**
   * Creates an isolated Shadow DOM host with specified stylesheets.
   * @param {string} id - Host element ID.
   * @param {string[]} cssFiles - Extension-relative CSS paths to load.
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

    cssFiles.forEach(file => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = safeGetURL(file);
      shadow.appendChild(link);
    });

    return { host, shadow };
  };

  // --- Smart Highlighting ---
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

  // --- Bento Grid Renderer ---
  class BentoRenderer {
    static fragment(text) {
      if (!text) return [];
      const fragments = text.split(/\n\n|(?=\n[ \t]*[-*•]|\n[ \t]*\d+\.)/);
      const refined = [];
      for (const frag of fragments) {
        const trimmed = frag.trim();
        if (!trimmed) continue;
        if (trimmed.length > 400 && !trimmed.includes('\n')) {
          const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
          for (let i = 0; i < sentences.length; i += 2) {
            refined.push(sentences.slice(i, i + 2).join(' ').trim());
          }
        } else {
          refined.push(trimmed);
        }
      }
      return refined.filter(r => r.length > 5);
    }

    static render(content, container) {
      const grid = document.createElement('div');
      grid.className = 'ib-bento-grid';

      const fragments = this.fragment(content);
      for (const frag of fragments) {
        const card = document.createElement('div');
        card.className = 'ib-bento-card';
        card.appendChild(smartHighlight(frag));
        grid.appendChild(card);
      }

      if (!grid.children.length) {
        const fallback = document.createElement('div');
        fallback.className = 'ib-bento-card';
        fallback.appendChild(smartHighlight(content));
        grid.appendChild(fallback);
      }
      container.appendChild(grid);
    }
  }

  Object.assign(ib, { safeGetURL, createShadowHost, smartHighlight, BentoRenderer });
})();
