/**
 * Popup logic for InfoBlend AI.
 * Handles settings persistence and bento-grid interactions.
 */

import { getStorageData, setStorageData } from '../utils/storage.js';

/**
 * Cache for frequently used DOM elements.
 */
const DOM = {
  definitionsEnabled: () => document.getElementById('definitionsEnabled'),
  autofillEnabled: () => document.getElementById('autofillEnabled'),
  userName: () => document.getElementById('userName'),
  userEmail: () => document.getElementById('userEmail'),
  userPhone: () => document.getElementById('userPhone'),
  aiEndpoint: () => document.getElementById('aiEndpoint'),
  aiProvider: () => document.getElementById('aiProvider'),
  aiKey: () => document.getElementById('aiKey'),
  theme: () => document.getElementById('theme'),
  adBlockEnabled: () => document.getElementById('adBlockEnabled'),
  saveBtn: () => document.getElementById('saveBtn'),
  summarizeBtn: () => document.getElementById('summarizeBtn'),
  onboardingModal: () => document.getElementById('onboardingModal'),
  closeOnboarding: () => document.getElementById('closeOnboarding'),
  historyContainer: () => document.getElementById('historyContainer')
};

/**
 * Loads all user settings from chrome.storage and populates the UI.
 */
async function loadSettings() {
  const keys = [
    'definitionsEnabled', 'autofillEnabled', 'userData', 
    'aiEndpoint', 'aiKey', 'aiProvider', 'theme', 
    'onboardingDone', 'summaryHistory', 'adBlockEnabled'
  ];
  const settings = await getStorageData(keys);
  
  // 1. Render History
  if (DOM.historyContainer()) {
    DOM.historyContainer().innerHTML = '';
    if (settings.summaryHistory?.length > 0) {
      settings.summaryHistory.slice(-4).reverse().forEach(item => {
        const card = document.createElement('div');
        card.className = 'ib-history-item';
        card.title = item.content || '';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'ib-history-title';
        titleSpan.textContent = item.title || 'Untitled';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'ib-history-time';

        let timeStr = 'Recent';
        if (item.timestamp) {
          const diff = Math.floor((Date.now() - item.timestamp) / 60000);
          if (diff < 1) timeStr = 'Just now';
          else if (diff < 60) timeStr = `${diff}m ago`;
          else if (diff < 1440) timeStr = `${Math.floor(diff/60)}h ago`;
          else timeStr = `${Math.floor(diff/1440)}d ago`;
        }
        timeSpan.textContent = timeStr;

        card.append(titleSpan, timeSpan);
        DOM.historyContainer().appendChild(card);
      });
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'history-empty';
      emptySpan.textContent = 'No recent blends';
      DOM.historyContainer().appendChild(emptySpan);
    }
  }

  // 2. Initial state
  if (!settings.onboardingDone) DOM.onboardingModal().style.display = 'flex';
  
  // 3. Form population
  if (settings.definitionsEnabled !== undefined && DOM.definitionsEnabled()) DOM.definitionsEnabled().checked = settings.definitionsEnabled;
  if (settings.autofillEnabled !== undefined && DOM.autofillEnabled()) DOM.autofillEnabled().checked = settings.autofillEnabled;
  if (settings.userData) {
    if (DOM.userName()) DOM.userName().value = settings.userData.name || '';
    if (DOM.userEmail()) DOM.userEmail().value = settings.userData.email || '';
    if (DOM.userPhone()) DOM.userPhone().value = settings.userData.phone || '';
  }
  if (settings.aiEndpoint && DOM.aiEndpoint()) DOM.aiEndpoint().value = settings.aiEndpoint;
  if (settings.aiProvider && DOM.aiProvider()) DOM.aiProvider().value = settings.aiProvider;
  if (settings.aiKey && DOM.aiKey()) DOM.aiKey().value = settings.aiKey;
  if (settings.theme && DOM.theme()) DOM.theme().value = settings.theme;
  if (DOM.adBlockEnabled() && settings.adBlockEnabled !== undefined) {
    DOM.adBlockEnabled().checked = settings.adBlockEnabled;
  }
}

/**
 * Saves current UI state to chrome.storage.
 */
async function saveSettings() {
  const btn = DOM.saveBtn();
  const userData = {
    name: DOM.userName()?.value || '',
    email: DOM.userEmail()?.value || '',
    phone: DOM.userPhone()?.value || ''
  };

  await setStorageData({
    definitionsEnabled: DOM.definitionsEnabled()?.checked || false,
    autofillEnabled: DOM.autofillEnabled()?.checked || false,
    userData,
    aiEndpoint: DOM.aiEndpoint()?.value || '',
    aiProvider: DOM.aiProvider()?.value || '',
    aiKey: DOM.aiKey()?.value || '',
    theme: DOM.theme()?.value || 'dark',
    adBlockEnabled: DOM.adBlockEnabled()?.checked || false
  });

  const originalText = btn.textContent;
  btn.textContent = 'Saved';
  btn.classList.add('saved');
  setTimeout(() => {
    btn.textContent = originalText;
    btn.classList.remove('saved');
  }, 2000);
}

// Initialization and Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();

  DOM.closeOnboarding()?.addEventListener('click', async () => {
    DOM.onboardingModal().style.display = 'none';
    await setStorageData({ onboardingDone: true });
  });

  DOM.saveBtn()?.addEventListener('click', saveSettings);

  DOM.summarizeBtn()?.addEventListener('click', async () => {
    const btn = DOM.summarizeBtn();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab?.url) {
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
        btn.textContent = 'Restricted Page';
        btn.style.backgroundColor = '#ff4d4f';
        return;
      }
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'SUMMARIZE_PAGE' });
        window.close();
      } catch (e) {
        console.warn('[InfoBlend] Popup message failed:', e.message);
      }
    }
  });

  // Optimized Flashlight Border Effect
  const grid = document.querySelector('.bento-grid');
  if (grid) {
    grid.addEventListener('mousemove', e => {
      const cards = document.querySelectorAll('.bento-card');
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
      });
    });
  }
});

