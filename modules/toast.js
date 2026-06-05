/**
 * InfoBlend — One-time discoverability toast
 *
 * Surfaces hidden features (currently: Ctrl+K to summarize long pages) the
 * first time the user is on a page where the feature would be most useful.
 * Each toast is gated by a per-feature storage flag — once dismissed, never
 * shown again. Toasts live in their own shadow root so site CSS can't break
 * them, and they auto-dismiss after 10 seconds even if the user ignores them.
 *
 * Triggers (called from contentScript after modules ready):
 *   - maybeShowCtrlKToast(): runs the long-article check and shows the
 *     Ctrl+K hint if the page qualifies and the flag isn't set.
 */
(() => {
  const ib = window.__ib = window.__ib || {};
  if (ib._toastLoaded) return;
  ib._toastLoaded = true;

  const FLAG_CTRLK = 'ctrlkToastSeen';
  // Word-count threshold for "long enough to want a summary". 800 words is
  // ~3.5 min read at 220 wpm — short enough that we don't only hit blog posts,
  // long enough to skip nav/landing pages.
  const LONG_ARTICLE_WORDS = 800;
  const AUTO_DISMISS_MS = 10000;

  let _activeHost = null;

  function showToast({ message, kbd, onDismiss }) {
    if (_activeHost) return; // one toast at a time
    if (!ib.createShadowHost) return;
    const { host, shadow } = ib.createShadowHost('infoblend-toast-host', []);
    _activeHost = host;

    const style = document.createElement('style');
    style.textContent = `
      .ib-toast {
        position: fixed;
        right: 16px;
        bottom: 16px;
        max-width: 320px;
        background: rgba(28, 28, 30, 0.94);
        color: #f5f5f7;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        line-height: 1.45;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(16px);
        z-index: 2147483646;
        display: flex;
        align-items: flex-start;
        gap: 10px;
        animation: ib-toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      .ib-toast.dismiss { animation: ib-toast-out 0.18s ease both; }
      @keyframes ib-toast-in {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes ib-toast-out {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(8px); }
      }
      .ib-toast-icon { flex-shrink: 0; opacity: 0.85; padding-top: 1px; }
      .ib-toast-body { flex: 1; min-width: 0; }
      .ib-toast-msg { margin: 0 0 8px; }
      .ib-toast-kbd {
        display: inline-block;
        font-family: ui-monospace, 'SF Mono', Consolas, monospace;
        font-size: 11px;
        padding: 2px 6px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-bottom-width: 2px;
        border-radius: 4px;
        margin: 0 2px;
      }
      .ib-toast-close {
        flex-shrink: 0;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        padding: 2px 4px;
        margin: -2px -4px -2px 0;
        font-size: 16px;
        line-height: 1;
        border-radius: 4px;
        transition: color 0.12s, background 0.12s;
      }
      .ib-toast-close:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
      @media (prefers-reduced-motion: reduce) {
        .ib-toast, .ib-toast.dismiss { animation: none !important; }
      }
    `;

    const toast = document.createElement('div');
    toast.className = 'ib-toast';

    // Icon (sparkle / lightbulb shape)
    const iconWrap = document.createElement('div');
    iconWrap.className = 'ib-toast-icon';
    iconWrap.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a90ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M2 11h2"/><path d="M20 11h2"/><path d="M12 2v2"/><path d="m4.93 5.93 1.41 1.41"/><path d="m17.66 5.93-1.41 1.41"/><path d="M12 11a5 5 0 0 0-3 9h6a5 5 0 0 0-3-9Z"/></svg>`;

    const body = document.createElement('div');
    body.className = 'ib-toast-body';
    const msg = document.createElement('p');
    msg.className = 'ib-toast-msg';
    if (kbd) {
      // Insert the kbd into the message at the {kbd} placeholder
      const [before, after] = message.split('{kbd}');
      msg.appendChild(document.createTextNode(before || ''));
      const k = document.createElement('span');
      k.className = 'ib-toast-kbd';
      k.textContent = kbd;
      msg.appendChild(k);
      msg.appendChild(document.createTextNode(after || ''));
    } else {
      msg.textContent = message;
    }
    body.appendChild(msg);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ib-toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '×';

    toast.appendChild(iconWrap);
    toast.appendChild(body);
    toast.appendChild(closeBtn);

    shadow.appendChild(style);
    shadow.appendChild(toast);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      toast.classList.add('dismiss');
      setTimeout(() => {
        if (host.parentNode) host.remove();
        if (_activeHost === host) _activeHost = null;
      }, 220);
      try { onDismiss?.(); } catch { /* user code */ }
    };

    closeBtn.addEventListener('click', dismiss);
    setTimeout(dismiss, AUTO_DISMISS_MS);

    return dismiss;
  }

  async function maybeShowCtrlKToast() {
    if (!chrome.runtime?.id) return;
    try {
      const flags = await chrome.storage.local.get([FLAG_CTRLK]);
      if (flags[FLAG_CTRLK]) return;
    } catch { return; }

    if (typeof ib.extractArticleContent !== 'function') return;
    let articleText = '';
    try { articleText = ib.extractArticleContent() || ''; } catch { return; }
    const words = (articleText.match(/\S+/g) || []).length;
    if (words < LONG_ARTICLE_WORDS) return;

    showToast({
      message: 'Long page? Press {kbd} to summarize it with InfoBlend.',
      kbd: 'Ctrl+K',
      onDismiss: () => {
        try { chrome.storage.local.set({ [FLAG_CTRLK]: true }); } catch { /* no-op */ }
      }
    });
  }

  ib.maybeShowCtrlKToast = maybeShowCtrlKToast;
  ib._showToast = showToast; // exposed for future toasts
})();
