import { fetchDefinition, fetchAIResponse } from './utils/api.js';
import { getStorageData } from './utils/storage.js';

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
    const settings = await getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);
    
    if (settings.aiEndpoint && settings.aiKey) {
      try {
        chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOADING' });
        const aiSummary = await fetchAIResponse(
          info.selectionText, 
          settings.aiEndpoint, 
          settings.aiKey,
          null,
          settings.aiProvider || 'gemini'
        );
        chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_DEFINITION',
          data: {
            title: 'AI Summary',
            content: aiSummary,
            source: 'InfoBlend AI'
          }
        });
      } catch (error) {
        // Fallback to local summarizer
        chrome.tabs.sendMessage(tab.id, {
          type: 'SUMMARIZE_SELECTION',
          text: info.selectionText
        });
      }
    } else {
      // Use local summarizer
      chrome.tabs.sendMessage(tab.id, {
        type: 'SUMMARIZE_SELECTION',
        text: info.selectionText
      });
    }
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
