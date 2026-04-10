/**
 * InfoBlend AI — Core Module
 * Shared utilities loaded once on first user interaction.
 * All exports live on window.__ib for cross-module access.
 */
(() => {
  const ib = window.__ib;

  const safeGetURL = (path) => {
    try { return chrome.runtime.getURL(path); }
    catch { return ''; }
  };

  /**
   * Creates an isolated Shadow DOM host with the content stylesheet.
   * @param {string} id - Host element ID.
   * @returns {{ host: HTMLElement, shadow: ShadowRoot }}
   */
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
      zIndex: '2147483647'
    });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    // Load Google Fonts inside shadow DOM (fonts don't inherit through shadow boundary)
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@300;400;500;600&display=swap';
    shadow.appendChild(fontLink);

    // Load extracted CSS via <link> — local extension resources load instantly
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = safeGetURL('styles/content.css');
    shadow.appendChild(link);

    return { host, shadow };
  };

  // --- Smart Highlighting (conservative — only acronyms and technical terms) ---
  const _highlightCombinedPattern = /\b(?:AI|LLM|API|HTML|CSS|GPU|CPU|URL|HTTP|HTTPS|JSON|XML|SQL|REST|SDK|CLI|DNS|TCP|UDP|SSH|SSL|TLS|OAuth|JWT|CORS|CRUD|DOM|IoT|SaaS|AWS|GCP|NLP|ML)\b/g;

  const smartHighlight = (text) => {
    if (!text) return document.createTextNode('');
    const fragment = document.createDocumentFragment();
    const seen = new Set();
    let lastIndex = 0;

    _highlightCombinedPattern.lastIndex = 0;
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
  };

  // --- Bento Grid Renderer ---
  class BentoRenderer {
    static fragment(text) {
      if (!text) return [];
      const fragments = text.split(/\n\n|(?=\n[ \t]*[-*•]|\n[ \t]*\d+\.)/);
      const refined = [];
      fragments.forEach(frag => {
        const trimmed = frag.trim();
        if (!trimmed) return;
        if (trimmed.length > 400 && !trimmed.includes('\n')) {
          const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
          for (let i = 0; i < sentences.length; i += 2) {
            refined.push(sentences.slice(i, i + 2).join(' ').trim());
          }
        } else {
          refined.push(trimmed);
        }
      });
      return refined.filter(r => r.length > 5);
    }

    static render(content, container) {
      const bentoGrid = document.createElement('div');
      bentoGrid.className = 'ib-bento-grid';

      const fragments = this.fragment(content);
      fragments.forEach((frag, index) => {
        const card = document.createElement('div');
        card.className = 'ib-bento-card';
        if (frag.length < 100 && index > 0 && index % 2 === 0) card.classList.add('compact');
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

  // Expose to other modules
  Object.assign(ib, { safeGetURL, createShadowHost, smartHighlight, BentoRenderer });
})();
