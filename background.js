import { fetchDefinition, fetchAIResponse } from './utils/api.js';
import { getStorageData } from './utils/storage.js';
import { generateIntelligentSummary } from './utils/summarizer.js';
import { extractYouTubeTranscript } from './utils/youtubeInsight.js';

/**
 * Background Service Worker for InfoBlend AI.
 * Orchestrates API requests, context menus, and content script coordination.
 */

// 1. Extension Lifecycle & Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'define-ib', title: 'Define with InfoBlend', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'summarize-ib', title: 'Summarize Selection', contexts: ['selection'] });
});

// 2. Messaging Helpers
const safeSendMessage = async (tabId, msg) => {
  try { await chrome.tabs.sendMessage(tabId, msg); } catch (e) { /* Silently fail */ }
};

const getAISettings = () => getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);

/**
 * Higher-order function to handle chrome.runtime.onMessage async responses.
 */
const wrapAsync = (callback) => (message, sender, sendResponse) => {
  callback(message, sender, sendResponse).catch(err => {
    console.error('[InfoBlend Background Error]', err);
    sendResponse({ success: false, error: err.message });
  });
  return true; // Keep channel open
};

// 3. Core Request Handlers
const handleDefinition = async (word) => {
  const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
  if (aiKey && aiEndpoint) {
    const aiResponse = await fetchAIResponse(word, aiEndpoint, aiKey, null, aiProvider, 'define');
    return { title: word, content: aiResponse, source: `AI (${aiProvider})` };
  }
  return await fetchDefinition(word);
};

const handleSummarization = async (text) => {
  const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
  if (aiKey && aiEndpoint) {
    return await fetchAIResponse(text, aiEndpoint, aiKey, null, aiProvider, 'summarize');
  }
  return generateIntelligentSummary(text);
};

// 4. Listeners
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText) return;
  safeSendMessage(tab.id, { type: 'SHOW_LOADING' });

  try {
    if (info.menuItemId === 'define-ib') {
      const data = await handleDefinition(info.selectionText);
      safeSendMessage(tab.id, { type: 'SHOW_DEFINITION', data });
    } else if (info.menuItemId === 'summarize-ib') {
      const summary = await handleSummarization(info.selectionText);
      safeSendMessage(tab.id, { 
        type: 'SHOW_DEFINITION', 
        data: { title: 'Selection Summary', content: summary, source: 'AI/Local Hybrid' } 
      });
    }
  } catch (error) {
    safeSendMessage(tab.id, { type: 'SHOW_ERROR', message: error.message });
  }
});

chrome.runtime.onMessage.addListener(wrapAsync(async (message, sender, sendResponse) => {
  switch (message.type) {
    case 'FETCH_DEFINITION':
      const data = await handleDefinition(message.word);
      sendResponse({ success: true, data });
      break;

    case 'PERFORM_SUMMARIZATION':
      // Background decides AI vs Local based on keys
      const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
      if (aiKey && aiEndpoint) {
        try {
          const aiSummary = await handleSummarization(message.text);
          sendResponse({ success: true, summary: aiSummary, method: `AI (${aiProvider})` });
        } catch (e) {
          const localSummary = generateIntelligentSummary(message.text);
          sendResponse({ success: true, summary: localSummary, method: 'InfoBlend Local (Fallback)' });
        }
      } else {
        const localSummary = generateIntelligentSummary(message.text);
        sendResponse({ success: true, summary: localSummary, method: 'InfoBlend Local' });
      }
      break;

    case 'FETCH_YOUTUBE_TRANSCRIPT':
      const transcript = await extractYouTubeTranscript(message.url);
      sendResponse({ success: true, transcript });
      break;
      
    case 'OPEN_POPUP':
      // Placeholder for future palette interactions
      break;
  }
}));

