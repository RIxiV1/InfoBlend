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

    // Load extracted CSS via <link> — local extension resources load instantly
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = safeGetURL('styles/content.css');
    shadow.appendChild(link);

    return { host, shadow };
  };

  /**
   * Extracts the site's brand accent color with luminance validation.
   * @returns {string} CSS color value.
   */
  const getThemeColor = () => {
    const getLuminance = (r, g, b) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const adjustColor = (color) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color;
      const rgb = ctx.fillStyle.match(/\d+/g);
      if (!rgb) return '#f5a623';
      const [r, g, b] = rgb.map(Number);
      if (getLuminance(r, g, b) < 0.6) return '#f5a623';
      return color;
    };

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta?.content) return adjustColor(meta.content);

    const brandSelectors = ['header', 'nav', '.navbar', '[class*="brand"]', '[class*="logo"]'];
    for (const selector of brandSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const bg = window.getComputedStyle(el).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)' && bg !== 'rgb(0, 0, 0)') {
          return adjustColor(bg);
        }
      }
    }
    return '#f5a623';
  };

  // --- Smart Highlighting ---
  const _highlightPatterns = [
    /\b[A-Z][a-z]+(?: [A-Z][a-z]+)*\b/g,
    /\b(?:AI|LLM|API|HTML|CSS|JS|URL|HTTP|JSON)\b/g,
    /\b(?:algorithm|neural network|machine learning|automation|intelligence|optimization|minimalist|glassmorphism|gerund)\b/gi
  ];
  const _highlightCombinedPattern = new RegExp(_highlightPatterns.map(p => p.source).join('|'), 'gi');

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
  Object.assign(ib, { safeGetURL, createShadowHost, getThemeColor, smartHighlight, BentoRenderer });
})();
