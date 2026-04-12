/**
 * Popup logic for InfoBlend.
 * Settings: definitions toggle, AI engine config, theme.
 */
import { getStorageData, setStorageData } from '../utils/storage.js';

const $ = (id) => document.getElementById(id);

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
  await setStorageData({
    definitionsEnabled: $('definitionsEnabled')?.checked ?? true,
    aiEndpoint: $('aiEndpoint')?.value || '',
    aiProvider: $('aiProvider')?.value || 'gemini',
    aiKey: $('aiKey')?.value || '',
    theme: $('theme')?.value || 'dark'
  });

  const btn = $('saveBtn');
  btn.textContent = 'Saved';
  btn.classList.add('saved');
  setTimeout(() => { btn.textContent = 'Save'; btn.classList.remove('saved'); }, 2000);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();

  $('closeOnboarding')?.addEventListener('click', async () => {
    $('onboardingModal').style.display = 'none';
    await setStorageData({ onboardingDone: true });
  });

  $('saveBtn')?.addEventListener('click', saveSettings);

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
