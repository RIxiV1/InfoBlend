import { fetchDefinition, fetchAIResponse } from './utils/api.js';
import { getStorageData } from './utils/storage.js';
import { generateIntelligentSummary } from './utils/summarizer.js';
import { extractYouTubeTranscript, fetchAndProcessTrack } from './utils/youtubeInsight.js';
import { translateError } from './utils/errors.js';

/**
 * Background Service Worker for InfoBlend AI.
 * Orchestrates API requests, context menus, module injection, and content script coordination.
 */

// --- Extension Lifecycle & Context Menus ---
const setupContextMenus = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'define-ib', title: 'Define with InfoBlend', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'summarize-ib', title: 'Summarize Selection', contexts: ['selection'] });
  });
};

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

// --- Messaging Helpers ---
const safeSendMessage = async (tabId, msg) => {
  try { await chrome.tabs.sendMessage(tabId, msg); } catch { /* tab may not have content script */ }
};

const getAISettings = () => getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);

const wrapAsync = (callback) => (message, sender, sendResponse) => {
  callback(message, sender, sendResponse).catch(err => {
    try {
      const friendlyError = translateError(err);
      console.error('[InfoBlend Background Error]', err.message);
      sendResponse({ success: false, error: friendlyError });
    } catch (criticalErr) {
      console.error('[InfoBlend Critical Failure]', criticalErr.message);
      sendResponse({ success: false, error: 'Internal background error.' });
    }
  });
  return true; // Keep channel open for async sendResponse
};

// --- Core Request Handlers ---
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

// --- Tracked injection state per tab ---
const injectedTabs = new Set();

// --- Context Menu Listener ---
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

// --- Main Message Handler ---
chrome.runtime.onMessage.addListener(wrapAsync(async (message, sender, sendResponse) => {
  switch (message.type) {
    case 'INJECT_MODULES': {
      const tabId = sender.tab?.id;
      if (!tabId) { sendResponse({ success: false }); break; }

      if (!injectedTabs.has(tabId)) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['modules/core.js', 'modules/overlay.js', 'modules/palette.js']
        });
        injectedTabs.add(tabId);
      }
      sendResponse({ success: true });
      break;
    }

    case 'FETCH_DEFINITION': {
      const data = await handleDefinition(message.word);
      sendResponse({ success: true, data });
      break;
    }

    case 'PERFORM_SUMMARIZATION': {
      const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
      if (aiKey && aiEndpoint) {
        try {
          const aiSummary = await handleSummarization(message.text);
          sendResponse({ success: true, summary: aiSummary, method: `AI (${aiProvider})` });
        } catch {
          const localSummary = generateIntelligentSummary(message.text);
          sendResponse({ success: true, summary: localSummary, method: 'InfoBlend Local (Fallback)' });
        }
      } else {
        const localSummary = generateIntelligentSummary(message.text);
        sendResponse({ success: true, summary: localSummary, method: 'InfoBlend Local' });
      }
      break;
    }

    case 'FETCH_YOUTUBE_TRANSCRIPT': {
      const fullTranscript = await extractYouTubeTranscript(message.url);
      sendResponse({ success: true, transcript: fullTranscript });
      break;
    }

    case 'PROCESS_YOUTUBE_TRACKS': {
      const processedTranscript = await fetchAndProcessTrack(message.tracks);
      sendResponse({ success: true, transcript: processedTranscript });
      break;
    }

    case 'OPEN_POPUP':
      chrome.action.openPopup?.();
      break;

    case 'PING':
      sendResponse({ success: true });
      break;
  }
}));

// Clean up injection tracking when tabs close
chrome.tabs.onRemoved.addListener((tabId) => injectedTabs.delete(tabId));
