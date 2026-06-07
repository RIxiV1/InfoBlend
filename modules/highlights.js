/**
 * InfoBlend — Session-persistent inline highlights
 *
 * After a successful lookup, every occurrence of the looked-up term on the
 * page gets wrapped in a subtle highlight span. Wraps are kept in a Set so
 * they can be cleared on demand or recreated when the term is looked up
 * again. Session-only — nothing is persisted to storage, so reloads clear.
 *
 * Edge cases handled:
 *   - Skips inside <input>, <textarea>, <script>, <style>, <code>, <pre>,
 *     <noscript>, contentEditable elements, and our own overlay/palette
 *     shadow hosts (so highlighting doesn't recurse into our own UI).
 *   - Skips text nodes already inside an ib-highlight wrap (idempotent).
 *   - Word-boundary matching: "cat" doesn't highlight inside "category".
 *   - Case-insensitive matching, original casing preserved on the page.
 *   - Multi-word phrases: matches the whole phrase as a unit, treating
 *     internal whitespace flexibly (single \s+).
 *   - Regex injection: term is escaped before insertion.
 *   - Performance: per-page hard cap on total wraps to avoid choking on
 *     looking up "the" or other ubiquitous tokens.
 *   - Cleanup: removeAll() unwraps every span and normalizes parent nodes
 *     so the DOM looks untouched.
 */
(() => {
  const ib = window.__ib = window.__ib || {};
  if (ib._highlightsLoaded && ib.highlights) return;
  ib._highlightsLoaded = true;

  // Hard cap per term so a lookup of "the" doesn't wrap 5,000 nodes.
  const MAX_WRAPS_PER_TERM = 80;
  // Skip ancestors entirely — including these tags or attributes anywhere
  // up the chain disqualifies a text node from being wrapped.
  const SKIP_ANCESTOR_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT',
    'CODE', 'PRE', 'KBD', 'SAMP', 'BUTTON', 'OPTION'
  ]);
  const HIGHLIGHT_CLASS = 'ib-highlight-mark';

  // term (lowercased) → Set<HTMLElement> of currently-mounted wraps
  const _activeWraps = new Map();

  // Style tag is injected into the page (not the shadow root) — these spans
  // live in the host page's DOM so they need globally-scoped CSS. Inlined
  // here instead of a separate CSS file so the module is self-contained and
  // no manifest entry is needed.
  let _styleInjected = false;
  function ensureStyles() {
    if (_styleInjected) return;
    _styleInjected = true;
    const style = document.createElement('style');
    style.setAttribute('data-ib-highlight-style', '');
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        background-color: rgba(74, 144, 255, 0.18) !important;
        color: inherit !important;
        border-radius: 3px !important;
        padding: 0 2px !important;
        margin: 0 -2px !important;
        box-decoration-break: clone !important;
        -webkit-box-decoration-break: clone !important;
        cursor: help;
        transition: background-color 0.15s ease;
      }
      .${HIGHLIGHT_CLASS}:hover {
        background-color: rgba(74, 144, 255, 0.32) !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .${HIGHLIGHT_CLASS} { transition: none !important; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isSkipAncestor(node) {
    let n = node.parentNode;
    while (n && n !== document.body) {
      if (n.nodeType !== 1) { n = n.parentNode; continue; }
      const tag = n.tagName;
      if (SKIP_ANCESTOR_TAGS.has(tag)) return true;
      if (n.isContentEditable) return true;
      if (n.classList?.contains(HIGHLIGHT_CLASS)) return true;
      // Our own injected shadow hosts — don't recurse. The light-DOM check
      // matters even though TreeWalker doesn't descend into shadow roots,
      // because a future change could mount a child outside the shadow.
      // Cover every host id we create, not just the (incorrectly-named) one.
      if (n.id === 'infoblend-shadow-host'
          || n.id === 'infoblend-palette-host'
          || n.id === 'infoblend-define-host'
          || n.id === 'infoblend-toast-host'
          || n.classList?.contains('ib-palette-overlay')) return true;
      n = n.parentNode;
    }
    return false;
  }

  /**
   * Highlight every occurrence of `term` in the document body. Returns the
   * count actually wrapped. If `term` was already highlighted in this session
   * the previous wraps are cleared first so the new pass is consistent.
   */
  function highlight(term) {
    const clean = String(term || '').trim();
    if (!clean) return 0;

    ensureStyles();

    const key = clean.toLowerCase();
    // Refresh — drop the previous round for this term so we don't double-wrap
    // (the DOM may have changed since the first call).
    removeTerm(key);

    // Word-boundary on each end, internal whitespace flexible. Multi-word
    // terms ("machine learning") match across a normal space, NBSP, etc.
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(clean).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu');

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || node.nodeValue.length < clean.length) return NodeFilter.FILTER_REJECT;
          if (isSkipAncestor(node)) return NodeFilter.FILTER_REJECT;
          // Cheap test before the expensive regex: lowercase substring check.
          if (!node.nodeValue.toLowerCase().includes(key.split(/\s+/)[0])) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    // Collect first, then mutate — mutating the DOM during walk invalidates
    // the walker's position.
    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);

    const wraps = new Set();
    let totalWrapped = 0;

    for (const textNode of targets) {
      if (totalWrapped >= MAX_WRAPS_PER_TERM) break;
      const value = textNode.nodeValue;
      pattern.lastIndex = 0;
      if (!pattern.test(value)) continue;
      pattern.lastIndex = 0;

      // Build a fragment splitting around matches.
      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let m;
      let madeAny = false;
      while ((m = pattern.exec(value)) !== null) {
        if (totalWrapped >= MAX_WRAPS_PER_TERM) break;
        if (m.index > lastIdx) {
          frag.appendChild(document.createTextNode(value.slice(lastIdx, m.index)));
        }
        const mark = document.createElement('span');
        mark.className = HIGHLIGHT_CLASS;
        mark.textContent = m[0];
        frag.appendChild(mark);
        wraps.add(mark);
        totalWrapped++;
        madeAny = true;
        lastIdx = m.index + m[0].length;
        // Guard against zero-width matches looping forever.
        if (m[0].length === 0) pattern.lastIndex++;
      }
      if (!madeAny) continue;
      if (lastIdx < value.length) {
        frag.appendChild(document.createTextNode(value.slice(lastIdx)));
      }
      textNode.parentNode?.replaceChild(frag, textNode);
    }

    if (wraps.size) _activeWraps.set(key, wraps);
    return wraps.size;
  }

  function removeTerm(termKey) {
    const set = _activeWraps.get(termKey);
    if (!set) return;
    for (const span of set) unwrap(span);
    _activeWraps.delete(termKey);
  }

  function removeAll() {
    for (const [, set] of _activeWraps) for (const span of set) unwrap(span);
    _activeWraps.clear();
  }

  function unwrap(span) {
    const parent = span.parentNode;
    if (!parent) return;
    // Replace the span with its text content, then normalize the parent so
    // adjacent text nodes from the original split merge back together.
    parent.replaceChild(document.createTextNode(span.textContent), span);
    parent.normalize();
  }

  ib.highlights = { highlight, removeAll, removeTerm };
})();
