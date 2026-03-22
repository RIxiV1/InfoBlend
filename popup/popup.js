/**
 * Popup logic for InfoBlend AI.
 */

import { getStorageData, setStorageData } from '../utils/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  const definitionsEnabled = document.getElementById('definitionsEnabled');
  const autofillEnabled = document.getElementById('autofillEnabled');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const userPhone = document.getElementById('userPhone');
  const aiEndpoint = document.getElementById('aiEndpoint');
  const aiProvider = document.getElementById('aiProvider');
  const aiKey = document.getElementById('aiKey');
  const theme = document.getElementById('theme');
  const saveBtn = document.getElementById('saveBtn');
  const summarizeBtn = document.getElementById('summarizeBtn');
  
  // Onboarding
  const onboardingModal = document.getElementById('onboardingModal');
  const closeOnboarding = document.getElementById('closeOnboarding');

  // Load existing settings
  const settings = await getStorageData(['definitionsEnabled', 'autofillEnabled', 'userData', 'aiEndpoint', 'aiKey', 'aiProvider', 'theme', 'onboardingDone', 'summaryHistory', 'adBlockEnabled']);
  
  // Update Recent Activity
  const activityList = document.getElementById('recentActivity');
  if (settings.summaryHistory && settings.summaryHistory.length > 0) {
    activityList.innerHTML = '';
    settings.summaryHistory.slice(-3).reverse().forEach(item => {
      const el = document.createElement('div');
      el.className = 'activity-item';
      el.textContent = item.title;
      el.title = item.title;
      activityList.appendChild(el);
    });
  } else {
    activityList.innerHTML = '<div class="activity-item loading">No recent activity</div>';
  }

  if (!settings.onboardingDone) {
    onboardingModal.style.display = 'flex';
  }

  closeOnboarding.addEventListener('click', async () => {
    onboardingModal.style.display = 'none';
    await setStorageData({ onboardingDone: true });
  });
  
  if (settings.definitionsEnabled !== undefined) {
    definitionsEnabled.checked = settings.definitionsEnabled;
  }
  if (settings.autofillEnabled !== undefined) {
    autofillEnabled.checked = settings.autofillEnabled;
  }
  if (settings.userData) {
    userName.value = settings.userData.name || '';
    userEmail.value = settings.userData.email || '';
    userPhone.value = settings.userData.phone || '';
  }
  if (settings.aiEndpoint) aiEndpoint.value = settings.aiEndpoint;
  if (settings.aiProvider) aiProvider.value = settings.aiProvider;
  if (settings.aiKey) aiKey.value = settings.aiKey;
  if (settings.theme) theme.value = settings.theme;

  const adBlockEnabled = document.getElementById('adBlockEnabled');
  if (adBlockEnabled) { // Check if the element exists before trying to access its properties
    if (settings.adBlockEnabled !== undefined) {
      adBlockEnabled.checked = settings.adBlockEnabled;
    }
  }

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const userData = {
      name: userName.value,
      email: userEmail.value,
      phone: userPhone.value
    };

    await setStorageData({
      definitionsEnabled: definitionsEnabled.checked,
      autofillEnabled: autofillEnabled.checked,
      userData: userData,
      aiEndpoint: aiEndpoint.value,
      aiProvider: aiProvider.value,
      aiKey: aiKey.value,
      theme: theme.value,
      adBlockEnabled: adBlockEnabled ? adBlockEnabled.checked : false // Save adBlockEnabled state
    });

    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved ✓';
    saveBtn.classList.add('saved');
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.classList.remove('saved');
    }, 1500);
  });

  // Summarize current page
  summarizeBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'SUMMARIZE_PAGE' });
      window.close(); // Close popup to show overlay on page
    }
  });
});
