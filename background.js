/**
 * Background service worker for InfoBlend AI.
 */

import { fetchDefinition } from './utils/api.js';

// Create context menu items
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'define-with-infoblend',
    title: 'Define with InfoBlend',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'summarize-with-infoblend',
    title: 'Summarize with InfoBlend',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'define-with-infoblend' && info.selectionText) {
    try {
      const definition = await fetchDefinition(info.selectionText);
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_DEFINITION',
        data: definition
      });
    } catch (error) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_ERROR',
        message: 'Could not find definition.'
      });
    }
  } else if (info.menuItemId === 'summarize-with-infoblend' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SUMMARIZE_SELECTION',
      text: info.selectionText
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_DEFINITION') {
    fetchDefinition(message.word)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});
