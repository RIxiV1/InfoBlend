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

// Helper for safe tab messaging
const safeSendMessage = (tabId, msg) => {
  try {
    chrome.tabs.sendMessage(tabId, msg, () => {
      if (chrome.runtime.lastError) {
        // Silently fail for connection errors (usually means tab needs refresh)
      }
    });
  } catch (e) {}
};

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'define-with-infoblend' && info.selectionText) {
    safeSendMessage(tab.id, { type: 'SHOW_LOADING' });
    try {
      const { aiEndpoint, aiKey, aiProvider } = await getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);
      let definition;
      if (aiKey && aiEndpoint) {
        definition = {
          title: info.selectionText,
          content: await fetchAIResponse(info.selectionText, aiEndpoint, aiKey, null, aiProvider, 'define'),
          source: `AI (${aiProvider})`
        };
      } else {
        definition = await fetchDefinition(info.selectionText);
      }
      safeSendMessage(tab.id, { type: 'SHOW_DEFINITION', data: definition });
    } catch (error) {
      safeSendMessage(tab.id, { type: 'SHOW_ERROR', message: error.message });
    }
  } else if (info.menuItemId === 'summarize-with-infoblend' && info.selectionText) {
    safeSendMessage(tab.id, { type: 'SHOW_LOADING' });
    try {
      const { aiEndpoint, aiKey, aiProvider } = await getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);
      if (aiKey && aiEndpoint) {
        const summary = await fetchAIResponse(info.selectionText, aiEndpoint, aiKey, null, aiProvider, 'summarize');
        safeSendMessage(tab.id, { 
          type: 'SHOW_DEFINITION', 
          data: { title: 'Selection Summary', content: summary, source: `AI (${aiProvider})` } 
        });
      } else {
        safeSendMessage(tab.id, { type: 'SUMMARIZE_SELECTION', text: info.selectionText });
      }
    } catch (error) {
      safeSendMessage(tab.id, { type: 'SHOW_ERROR', message: error.message });
    }
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_DEFINITION') {
    (async () => {
      try {
        const { aiEndpoint, aiKey, aiProvider } = await getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);
        if (aiKey && aiEndpoint) {
          const aiResponse = await fetchAIResponse(message.word, aiEndpoint, aiKey, null, aiProvider, 'define');
          sendResponse({ success: true, data: { title: message.word, content: aiResponse, source: `AI (${aiProvider})` } });
        } else {
          const result = await fetchDefinition(message.word);
          sendResponse({ success: true, data: result });
        }
      } catch (error) {
        // Only send response if the connection is still open
        try {
          sendResponse({ success: false, error: error.message });
        } catch (e) {}
      }
    })();
    return true; 
  } else if (message.type === 'SUMMARIZE_VIA_AI') {
    (async () => {
      try {
        const { aiEndpoint, aiKey, aiProvider } = await getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);
        const summary = await fetchAIResponse(message.text, aiEndpoint, aiKey, null, aiProvider, 'summarize');
        sendResponse({ success: true, summary: summary });
      } catch (error) {
        try {
          sendResponse({ success: false, error: error.message });
        } catch (e) {}
      }
    })();
    return true;
  }
});
