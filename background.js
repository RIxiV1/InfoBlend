import { fetchDefinition, fetchAIResponse } from './utils/api.js';
import { getStorageData } from './utils/storage.js';
import { generateIntelligentSummary } from './utils/summarizer.js';
import { extractYouTubeTranscript, fetchAndProcessTrack } from './utils/youtubeInsight.js';
import { translateError } from './utils/errors.js';

/**
 * Background Service Worker for InfoBlend AI.
 * Orchestrates API requests and content script coordination.
 */

// 1. Extension Lifecycle & Context Menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'define-ib', title: 'Define with InfoBlend', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'summarize-ib', title: 'Summarize Selection', contexts: ['selection'] });
});

const getAISettings = () => getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);

/**
 * Global response wrapper to handle async errors and maintain channel integrity.
 */
const wrapAsync = (callback) => (message, sender, sendResponse) => {
  callback(message, sender, sendResponse).catch(err => {
    // Ensuring translateError exists even if module loading was wonky
    const errorMsg = (typeof translateError === 'function') ? translateError(err) : (err.message || 'Unknown error');
    console.error('[InfoBlend Background Error]', err.message);
    sendResponse({ success: false, error: errorMsg });
  });
  return true; // Keep channel open
};

// 2. Core Request Handlers
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

// 3. Listeners
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText) return;
  chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOADING' }).catch(() => {});

  try {
    if (info.menuItemId === 'define-ib') {
      const data = await handleDefinition(info.selectionText);
      chrome.tabs.sendMessage(tab.id, { type: 'SHOW_DEFINITION', data }).catch(() => {});
    } else if (info.menuItemId === 'summarize-ib') {
      const summary = await handleSummarization(info.selectionText);
      chrome.tabs.sendMessage(tab.id, { 
        type: 'SHOW_DEFINITION', 
        data: { title: 'Selection Summary', content: summary, source: 'AI/Local Hybrid' } 
      }).catch(() => {});
    }
  } catch (error) {
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_ERROR', message: error.message }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener(wrapAsync(async (message, sender, sendResponse) => {
  switch (message.type) {
    case 'FETCH_DEFINITION':
      const defData = await handleDefinition(message.word);
      sendResponse({ success: true, data: defData });
      break;

    case 'PERFORM_SUMMARIZATION':
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
  }
}));
