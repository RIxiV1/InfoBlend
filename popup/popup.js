/**
 * Popup logic for InfoBlend AI.
 */

import { getStorageData, setStorageData } from '../utils/storage.js';

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
  activityList: () => document.getElementById('recentActivity')
};

async function loadSettings() {
  const settings = await getStorageData(['definitionsEnabled', 'autofillEnabled', 'userData', 'aiEndpoint', 'aiKey', 'aiProvider', 'theme', 'onboardingDone', 'summaryHistory', 'adBlockEnabled']);
  
  if (DOM.activityList()) {
    if (settings.summaryHistory && settings.summaryHistory.length > 0) {
      DOM.activityList().innerHTML = '';
      settings.summaryHistory.slice(-3).reverse().forEach(item => {
        const el = document.createElement('div');
        el.className = 'activity-item';
        el.textContent = item.title;
        el.title = item.title;
        DOM.activityList().appendChild(el);
      });
    } else {
      DOM.activityList().innerHTML = '<div class="activity-item loading">No recent activity</div>';
    }
  }

  if (!settings.onboardingDone) DOM.onboardingModal().style.display = 'flex';
  
  if (settings.definitionsEnabled !== undefined) DOM.definitionsEnabled().checked = settings.definitionsEnabled;
  if (settings.autofillEnabled !== undefined) DOM.autofillEnabled().checked = settings.autofillEnabled;
  if (settings.userData) {
    DOM.userName().value = settings.userData.name || '';
    DOM.userEmail().value = settings.userData.email || '';
    DOM.userPhone().value = settings.userData.phone || '';
  }
  if (settings.aiEndpoint) DOM.aiEndpoint().value = settings.aiEndpoint;
  if (settings.aiProvider) DOM.aiProvider().value = settings.aiProvider;
  if (settings.aiKey) DOM.aiKey().value = settings.aiKey;
  if (settings.theme) DOM.theme().value = settings.theme;
  if (DOM.adBlockEnabled() && settings.adBlockEnabled !== undefined) {
    DOM.adBlockEnabled().checked = settings.adBlockEnabled;
  }
}

async function saveSettings() {
  const btn = DOM.saveBtn();
  await setStorageData({
    definitionsEnabled: DOM.definitionsEnabled().checked,
    autofillEnabled: DOM.autofillEnabled().checked,
    userData: {
      name: DOM.userName().value,
      email: DOM.userEmail().value,
      phone: DOM.userPhone().value
    },
    aiEndpoint: DOM.aiEndpoint().value,
    aiProvider: DOM.aiProvider().value,
    aiKey: DOM.aiKey().value,
    theme: DOM.theme().value,
    adBlockEnabled: DOM.adBlockEnabled() ? DOM.adBlockEnabled().checked : false
  });

  const originalText = btn.textContent;
  btn.textContent = 'Saved ✓';
  btn.classList.add('saved');
  setTimeout(() => {
    btn.textContent = originalText;
    btn.classList.remove('saved');
  }, 1500);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();

  DOM.closeOnboarding().addEventListener('click', async () => {
    DOM.onboardingModal().style.display = 'none';
    await setStorageData({ onboardingDone: true });
  });

  DOM.saveBtn().addEventListener('click', saveSettings);

  DOM.summarizeBtn().addEventListener('click', async () => {
    const btn = DOM.summarizeBtn();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
          throw new Error('Cannot run on internal browser pages.');
        }
        await chrome.tabs.sendMessage(tab.id, { type: 'SUMMARIZE_PAGE' });
        window.close();
      } catch (e) {
        console.warn('[InfoBlend] Popup message failed:', e.message);
        const originalText = btn.textContent;
        const originalBg = btn.style.backgroundColor;
        btn.textContent = 'Restricted Page';
        btn.style.backgroundColor = '#ff4d4f';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.backgroundColor = originalBg;
        }, 3000);
      }
    }
  });
});
