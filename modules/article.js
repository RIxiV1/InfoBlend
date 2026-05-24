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
    const prose = Array.from(area.querySelectorAll(PROSE_SELECTOR))
      .filter(node => {
        if (node.closest(junk)) return false;
        // Skip nodes nested inside another prose container. The outer container's
        // innerText already includes the children, so keeping both produces
        // duplicate text in the summarizer prompt (e.g., `<blockquote><p>foo</p><p>bar</p></blockquote>`
        // would otherwise emit "foo\nbar", "foo", and "bar" — the Set dedup can't
        // collapse them because the parent string is unique).
        if (node.parentElement?.closest(PROSE_SELECTOR)) return false;
        if (node.offsetHeight === 0) return false; // hidden — cheaper than getComputedStyle
        const text = node.innerText;
        if (node.tagName === 'LI' && text.length < 15) return false;
        if (node.tagName === 'LI') {
          const linkLen = node.querySelectorAll('a').length ? Array.from(node.querySelectorAll('a')).reduce((s, a) => s + a.textContent.length, 0) : 0;
          if (linkLen > text.length * 0.6) return false;
        }
        return true;
      })
      .map(node => node.innerText.trim())
      .filter(t => t.length > 25 && !t.includes('function(') && !t.includes('var ') && t.split('|').length <= 3);

    const content = Array.from(new Set(prose)).join('\n\n');
    return content.length > 100 ? content.substring(0, 12000) : null;
  }

  ib.extractArticleContent = extractArticleContent;
})();
