/**
 * Popup logic for InfoBlend.
 * Settings: definitions toggle, AI engine config, theme.
 */
import { getStorageData, setStorageData } from '../utils/storage.js';

const $ = (id) => document.getElementById(id);

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

  if (!settings.onboardingDone) $('onboardingModal').style.display = 'flex';

  if (settings.definitionsEnabled !== undefined) $('definitionsEnabled').checked = settings.definitionsEnabled;
  if (settings.aiEndpoint) $('aiEndpoint').value = settings.aiEndpoint;
  if (settings.aiProvider) $('aiProvider').value = settings.aiProvider;
  if (settings.aiKey) $('aiKey').value = settings.aiKey;
  if (settings.theme) $('theme').value = settings.theme;
}

async function saveSettings() {
  clearFieldErrors();

  const endpoint = $('aiEndpoint')?.value || '';
  if (!isValidUrl(endpoint)) {
    showFieldError('aiEndpoint', 'Must be a valid HTTP(S) URL');
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
  btn.textContent = 'Saved';
  btn.classList.add('saved');
  setTimeout(() => { btn.textContent = 'Save settings'; btn.classList.remove('saved'); }, 2000);
}

// --- Test Connection ---
async function testConnection() {
  const btn = $('testBtn');
  const endpoint = $('aiEndpoint')?.value;
  const key = $('aiKey')?.value;
  const provider = $('aiProvider')?.value || 'gemini';

  if (!endpoint || !key) {
    btn.textContent = 'Need endpoint & key';
    btn.classList.add('test-fail');
    setTimeout(() => { btn.textContent = 'Test connection'; btn.classList.remove('test-fail'); }, 2000);
    return;
  }

  if (!isValidUrl(endpoint)) {
    btn.textContent = 'Invalid URL';
    btn.classList.add('test-fail');
    setTimeout(() => { btn.textContent = 'Test connection'; btn.classList.remove('test-fail'); }, 2000);
    return;
  }

  btn.textContent = 'Testing...';
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

    const resp = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify(body[provider] || body.generic),
      signal: AbortSignal.timeout(10000)
    });

    if (resp.ok) {
      btn.textContent = 'Connected';
      btn.classList.add('test-ok');
    } else {
      const err = await resp.json().catch(() => ({}));
      btn.textContent = err.error?.message?.substring(0, 30) || `Error ${resp.status}`;
      btn.classList.add('test-fail');
    }
  } catch (e) {
    btn.textContent = e.name === 'TimeoutError' ? 'Timed out' : 'Connection failed';
    btn.classList.add('test-fail');
  }

  btn.disabled = false;
  setTimeout(() => { btn.textContent = 'Test connection'; btn.classList.remove('test-ok', 'test-fail'); }, 3000);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();

  $('closeOnboarding')?.addEventListener('click', async () => {
    $('onboardingModal').style.display = 'none';
    await setStorageData({ onboardingDone: true });
  });

  $('saveBtn')?.addEventListener('click', saveSettings);
  $('testBtn')?.addEventListener('click', testConnection);

  // Clear errors on input
  $('aiEndpoint')?.addEventListener('input', () => {
    $('aiEndpoint').classList.remove('input-error');
    $('aiEndpoint').parentElement.querySelector('.field-error')?.remove();
  });

  $('summarizeBtn')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    if (/^(chrome|edge|brave|about|chrome-extension):/.test(url)) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SUMMARIZE_PAGE' });
      window.close();
    } catch (e) {
      console.warn('[InfoBlend] Message failed:', e.message);
    }
  });
});
