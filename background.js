import { fetchDefinition, fetchAIResponse } from './utils/api.js';
import { getStorageData } from './utils/storage.js';
import { generateIntelligentSummary } from './utils/summarizer.js';
import { extractYouTubeTranscript, fetchAndProcessTrack } from './utils/youtubeInsight.js';
import { translateError } from './utils/errors.js';

/**
 * Background Service Worker for InfoBlend AI.
 * Orchestrates API requests, context menus, and content script coordination.
 */

// 1. Extension Lifecycle & Context Menus
const setupContextMenus = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'define-ib', title: 'Define with InfoBlend', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'summarize-ib', title: 'Summarize Selection', contexts: ['selection'] });
  });
};

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

// 2. Messaging Helpers
const safeSendMessage = async (tabId, msg) => {
  try { await chrome.tabs.sendMessage(tabId, msg); } catch (e) { /* Silently fail */ }
};

const getAISettings = () => getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);

/**
 * Global response wrapper to handle async errors and maintain channel integrity.
 */
const wrapAsync = (callback) => (message, sender, sendResponse) => {
  callback(message, sender, sendResponse).catch(err => {
    try {
      const friendlyError = translateError(err);
      console.error('[InfoBlend Background Error]', err.message);
      sendResponse({ success: false, error: friendlyError });
    } catch (criticalErr) {
      console.error('[InfoBlend Critical Failure]', criticalErr.message);
      // Failsafe: send something to keep the channel closed cleanly
      sendResponse({ success: false, error: 'Internal background error.' });
    }
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
      const fullTranscript = await extractYouTubeTranscript(message.url);
      sendResponse({ success: true, transcript: fullTranscript });
      break;

    case 'PROCESS_YOUTUBE_TRACKS':
      const processedTranscript = await fetchAndProcessTrack(message.tracks);
      sendResponse({ success: true, transcript: processedTranscript });
      break;
      
    case 'OPEN_POPUP':
      chrome.action.openPopup?.();
      break;

    case 'PING':
      sendResponse({ success: true });
      break;
  }
}));

