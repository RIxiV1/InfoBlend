/**
 * Popup logic for InfoBlend.
 * Settings: definitions toggle, AI engine config, theme.
 */
import '../utils/compat.js';
import { getStorageData, setStorageData } from '../utils/storage.js';

const $ = (id) => document.getElementById(id);

const i18n = (key, fallback) => chrome.i18n?.getMessage?.(key) || fallback;

// --- Validation ---
function isValidUrl(str) {
  if (!str) return true; // empty is ok (optional field)
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function showFieldError(inputId, message) {
  const input = $(inputId);
  input.classList.add('input-error');
  let errEl = input.parentElement.querySelector('.field-error');
  if (!errEl) {
    errEl = document.createElement('span');
    errEl.className = 'field-error';
    input.parentElement.appendChild(errEl);
  }
  errEl.textContent = message;
}

function clearFieldErrors() {
  document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
  document.querySelectorAll('.field-error').forEach(el => el.remove());
}

async function loadSettings() {
  const settings = await getStorageData([
    'definitionsEnabled', 'aiEndpoint', 'aiKey', 'aiProvider', 'theme', 'onboardingDone'
  ]);

  if (!settings.onboardingDone) openOnboarding();

  if (settings.definitionsEnabled !== undefined) $('definitionsEnabled').checked = settings.definitionsEnabled;
  if (settings.aiEndpoint) $('aiEndpoint').value = settings.aiEndpoint;
  if (settings.aiProvider) $('aiProvider').value = settings.aiProvider;
  if (settings.aiKey) $('aiKey').value = settings.aiKey;
  if (settings.theme) $('theme').value = settings.theme;
}

// --- Onboarding modal a11y: focus trap, Escape, focus restore ---
let _onboardingPrevFocus = null;
let _onboardingKeyHandler = null;

function openOnboarding() {
  const modal = $('onboardingModal');
  _onboardingPrevFocus = document.activeElement;
  modal.classList.add('open');
  // Defer focus so the modal is rendered before we move focus into it
  requestAnimationFrame(() => $('closeOnboarding')?.focus());

  _onboardingKeyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOnboarding();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', _onboardingKeyHandler);
}

async function closeOnboarding() {
  $('onboardingModal').classList.remove('open');
  if (_onboardingKeyHandler) {
    document.removeEventListener('keydown', _onboardingKeyHandler);
    _onboardingKeyHandler = null;
  }
  if (_onboardingPrevFocus && typeof _onboardingPrevFocus.focus === 'function') {
    _onboardingPrevFocus.focus();
  }
  _onboardingPrevFocus = null;
  await setStorageData({ onboardingDone: true });
}

async function saveSettings() {
  clearFieldErrors();

  const endpoint = $('aiEndpoint')?.value || '';
  if (!isValidUrl(endpoint)) {
    showFieldError('aiEndpoint', i18n('invalidUrl', 'Must be a valid HTTP(S) URL'));
    return;
  }

  await setStorageData({
    definitionsEnabled: $('definitionsEnabled')?.checked ?? true,
    aiEndpoint: endpoint,
    aiProvider: $('aiProvider')?.value || 'gemini',
    aiKey: $('aiKey')?.value || '',
    theme: $('theme')?.value || 'dark'
  });

  const btn = $('saveBtn');
  const originalLabel = i18n('saveSettings', 'Save settings');
  btn.textContent = i18n('saved', 'Saved');
  btn.classList.add('saved');
  setTimeout(() => { btn.textContent = originalLabel; btn.classList.remove('saved'); }, 2000);
}

// --- Test Connection ---
async function testConnection() {
  const btn = $('testBtn');
  const endpoint = $('aiEndpoint')?.value;
  const key = $('aiKey')?.value;
  const provider = $('aiProvider')?.value || 'gemini';
  const defaultLabel = i18n('testConnection', 'Test connection');

  const flashFail = (text, ms = 2000) => {
    btn.textContent = text;
    btn.classList.add('test-fail');
    setTimeout(() => { btn.textContent = defaultLabel; btn.classList.remove('test-fail'); }, ms);
  };

  if (!endpoint || !key) {
    flashFail(i18n('needEndpointAndKey', 'Need endpoint & key'));
    return;
  }

  if (!isValidUrl(endpoint)) {
    flashFail(i18n('invalidUrl', 'Must be a valid HTTP(S) URL'));
    return;
  }

  btn.textContent = i18n('testing', 'Testing...');
  btn.disabled = true;

  try {
    const headers = { 'Content-Type': 'application/json' };
    let url = endpoint;
    if (provider === 'gemini') {
      url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
    } else {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const testPrompt = 'Say "ok" in one word.';
    const body = {
      gemini: { contents: [{ parts: [{ text: testPrompt }] }] },
      openai: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: testPrompt }], max_tokens: 5 },
      generic: { prompt: testPrompt, max_tokens: 5 }
    };

    const { fetchWithTimeout } = await import('../utils/compat.js');
    const resp = await fetchWithTimeout(url, {
      method: 'POST', headers,
      body: JSON.stringify(body[provider] || body.generic)
    }, 10000);

    if (resp.ok) {
      btn.textContent = i18n('connected', 'Connected');
      btn.classList.add('test-ok');
    } else {
      const err = await resp.json().catch(() => ({}));
      btn.textContent = err.error?.message?.substring(0, 30) || `Error ${resp.status}`;
      btn.classList.add('test-fail');
    }
  } catch (e) {
    const timedOut = e.name === 'AbortError' || e.name === 'TimeoutError';
    btn.textContent = timedOut ? i18n('timedOut', 'Timed out') : i18n('connectionFailed', 'Connection failed');
    btn.classList.add('test-fail');
  }

  btn.disabled = false;
  setTimeout(() => { btn.textContent = defaultLabel; btn.classList.remove('test-ok', 'test-fail'); }, 3000);
}

// --- i18n ---
function localizeUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.dataset.i18nAria);
    if (msg) el.setAttribute('aria-label', msg);
  });
}

function setupPasswordToggle() {
  const btn = $('aiKeyToggle');
  const input = $('aiKey');
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(isHidden));
    btn.setAttribute('aria-label', i18n(isHidden ? 'hideApiKey' : 'showApiKey',
      isHidden ? 'Hide API key' : 'Show API key'));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  localizeUI();
  await loadSettings();
  setupPasswordToggle();

  $('closeOnboarding')?.addEventListener('click', closeOnboarding);

  $('saveBtn')?.addEventListener('click', saveSettings);
  $('testBtn')?.addEventListener('click', testConnection);

  // Clear errors on input
  $('aiEndpoint')?.addEventListener('input', () => {
    $('aiEndpoint').classList.remove('input-error');
    $('aiEndpoint').parentElement.querySelector('.field-error')?.remove();
  });

  $('summarizeBtn')?.addEventListener('click', async () => {
    const btn = $('summarizeBtn');
    const heroLabel = btn.querySelector('.hero-content span');
    const flashError = (msg) => {
      // Surface the failure inline so the click isn't a silent no-op.
      const original = heroLabel.textContent;
      heroLabel.textContent = msg;
      btn.classList.add('hero-error');
      setTimeout(() => {
        heroLabel.textContent = original;
        btn.classList.remove('hero-error');
      }, 2400);
    };

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    if (/^(chrome|edge|brave|about|chrome-extension):/.test(url)) {
      flashError(i18n('cantSummarizeUrl', "Can't summarize this page"));
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SUMMARIZE_PAGE' });
      window.close();
    } catch {
      // Common cause: content script wasn't injected (page loaded before
      // the extension was installed/enabled). Refresh resolves it.
      flashError(i18n('refreshAndRetry', 'Refresh the page and retry'));
    }
  });
});
