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
  const saveBtn = document.getElementById('saveBtn');
  const summarizeBtn = document.getElementById('summarizeBtn');

  // Load existing settings
  const settings = await getStorageData(['definitionsEnabled', 'autofillEnabled', 'userData']);
  
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
      userData: userData
    });

    saveBtn.textContent = 'Saved!';
    setTimeout(() => {
      saveBtn.textContent = 'Save Settings';
    }, 2000);
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
