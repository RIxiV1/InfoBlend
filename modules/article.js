/**
 * InfoBlend — Article extraction
 * Readability-inspired heuristics for picking the main prose out of a page,
 * used by the summarizer flow. Pure DOM-reading: no extension state, no
 * messaging — so it lives in its own module rather than bloating overlay.js.
 */
(() => {
  if (window.__ib?._articleLoaded && typeof window.__ib.extractArticleContent === 'function') return;

  const ib = window.__ib = window.__ib || {};
  ib._articleLoaded = true;

  function extractArticleContent() {
    // Phase 1: Try semantic selectors (most precise)
    let area = document.querySelector('article, main, [role="main"], .post-content, .entry-content, #content, .article-body, .story-body');

    // Phase 2: Score candidate containers by text density (limit depth for perf)
    if (!area) {
      let bestScore = 0;
      for (const cand of document.querySelectorAll('div, section')) {
        // Skip deeply nested or tiny containers
        const pCount = cand.querySelectorAll(':scope > p, :scope > * > p').length;
        if (pCount < 2) continue;
        const textLen = cand.textContent.length;
        if (textLen < 200) continue;
        const linkDensity = (cand.querySelectorAll('a').length + 1) / (pCount + 1);
        const score = (pCount * 10 + textLen / 100) / (linkDensity + 1);
        if (score > bestScore) { bestScore = score; area = cand; }
      }
    }

    area = area || document.body;

    const junk = 'nav,footer,header,script,style,noscript,template,aside,[role="complementary"],[role="navigation"],[role="banner"],.sidebar,#sidebar,[class*="ad-"],[id*="ad-"],[class*="social"],[class*="share"],[class*="comment"],[class*="related"],[class*="recommend"],[class*="newsletter"],[class*="subscribe"],[class*="popup"],[class*="modal"],[class*="cookie"],[class*="banner"],.social-share,.comments-area,.related-posts,.breadcrumb,.pagination,.toc';
    const PROSE_SELECTOR = 'p, h1, h2, h3, h4, li, blockquote, figcaption';
    const HEADING = /^H[1-6]$/;
    // Carry tag through the pipeline so the final length filter can apply
    // different thresholds. The previous flat 25-char floor was silently
    // stripping H2/H3 titles ("Pricing", "Methodology", "Summary") which
    // are exactly the semantic anchors Chat-with-the-Page relies on.
    const prose = Array.from(area.querySelectorAll(PROSE_SELECTOR))
      .filter(node => {
        if (node.closest(junk)) return false;
        if (node.parentElement?.closest(PROSE_SELECTOR)) return false;
        if (node.offsetHeight === 0) return false;
        const text = node.innerText;
        if (node.tagName === 'LI' && text.length < 15) return false;
        if (node.tagName === 'LI') {
          const linkLen = node.querySelectorAll('a').length ? Array.from(node.querySelectorAll('a')).reduce((s, a) => s + a.textContent.length, 0) : 0;
          if (linkLen > text.length * 0.6) return false;
        }
        return true;
      })
      .map(node => ({ tag: node.tagName, text: node.innerText.trim() }))
      .filter(({ tag, text }) => {
        if (!text || text.includes('function(') || text.includes('var ')) return false;
        if (text.split('|').length > 3) return false;
        // Headings are always semantically meaningful even when short ("FAQ",
        // "Pricing"). Floor at 2 chars to skip pure decoration.
        if (HEADING.test(tag)) return text.length >= 2;
        // List items have their own 15-char floor enforced upstream; keep.
        if (tag === 'LI') return true;
        // Regular prose: 25-char floor to skip captions/labels.
        return text.length > 25;
      })
      .map(({ text }) => text);

    const content = Array.from(new Set(prose)).join('\n\n');
    return content.length > 100 ? content.substring(0, 12000) : null;
  }

  ib.extractArticleContent = extractArticleContent;
})();
