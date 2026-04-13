import { fetchDefinition, fetchAIResponse, cleanupCache } from './utils/api.js';
import { getStorageData } from './utils/storage.js';
import { generateIntelligentSummary } from './utils/summarizer.js';
import { translateError } from './utils/errors.js';
import { trackEvent } from './utils/telemetry.js';

/**
 * Background Service Worker for InfoBlend.
 */

// --- Context Menu (selection summarization only; double-click handles definitions) ---
const setupContextMenus = () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'summarize-ib',
      title: chrome.i18n.getMessage('contextMenuSummarize') || 'Summarize selection with InfoBlend',
      contexts: ['selection']
    });
  });
};

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

// --- Handlers ---
const getAISettings = () => getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);

const handleDefinition = async (word) => {
  const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
  if (aiKey && aiEndpoint) {
    const content = await fetchAIResponse(word, aiEndpoint, aiKey, aiProvider, 'define');
    return { title: word, content, source: `AI (${aiProvider})` };
  }
  return await fetchDefinition(word);
};

const handleSummarization = async (text) => {
  const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
  if (aiKey && aiEndpoint) {
    return await fetchAIResponse(text, aiEndpoint, aiKey, aiProvider, 'summarize');
  }
  return generateIntelligentSummary(text);
};

// --- Async message wrapper ---
const wrapAsync = (callback) => (message, sender, sendResponse) => {
  callback(message, sender, sendResponse).catch(err => {
    console.error('[InfoBlend Background]', err.message);
    sendResponse({ success: false, error: translateError(err) });
  });
  return true; // keep channel open
};

// --- Context menu trigger (summaries) ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || info.menuItemId !== 'summarize-ib') return;
  trackEvent('context_menu');
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOADING' });
    const summary = await handleSummarization(info.selectionText);
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_DEFINITION',
      data: { title: 'Selection Summary', content: summary, source: 'InfoBlend' }
    });
  } catch (err) {
    try { await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_ERROR', message: err.message }); }
    catch { /* tab may have closed */ }
  }
});

// --- Module injection tracking ---
const injectedTabs = new Set();
chrome.tabs.onRemoved.addListener((tabId) => injectedTabs.delete(tabId));

// --- Periodic cache cleanup (every 6 hours) ---
chrome.alarms.create('ib-cache-cleanup', { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ib-cache-cleanup') cleanupCache();
});

// --- Message validation ---
const VALID_MESSAGES = {
  'INJECT_MODULES': {},
  'FETCH_DEFINITION': { required: ['word'] },
  'PERFORM_SUMMARIZATION': { required: ['text'] },
  'SHOW_RETRYING': {}
};

function validateMessage(message) {
  if (!message?.type || !(message.type in VALID_MESSAGES)) return false;
  const schema = VALID_MESSAGES[message.type];
  if (schema.required) {
    return schema.required.every(key => message[key] != null);
  }
  return true;
}

// --- Message handler ---
chrome.runtime.onMessage.addListener(wrapAsync(async (message, sender, sendResponse) => {
  if (!validateMessage(message)) {
    sendResponse({ success: false, error: `Unknown or malformed message type: ${message?.type}` });
    return;
  }

  switch (message.type) {
    case 'INJECT_MODULES': {
      const tabId = sender.tab?.id;
      if (!tabId) return sendResponse({ success: false, error: 'No tab context' });

      if (!injectedTabs.has(tabId)) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['modules/core.js', 'modules/overlay.js', 'modules/palette.js']
        });
        injectedTabs.add(tabId);
      }
      sendResponse({ success: true });
      return;
    }

    case 'FETCH_DEFINITION':
      trackEvent('definition');
      sendResponse({ success: true, data: await handleDefinition(message.word) });
      return;

    case 'PERFORM_SUMMARIZATION': {
      const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
      let aiAttempted = false;
      if (aiKey && aiEndpoint) {
        aiAttempted = true;
        try {
          const summary = await fetchAIResponse(message.text, aiEndpoint, aiKey, aiProvider, 'summarize');
          trackEvent('summary_ai');
          return sendResponse({ success: true, summary, method: `AI (${aiProvider})` });
        } catch {
          // Notify the tab that AI failed and we're falling back
          const tabId = sender.tab?.id;
          if (tabId) {
            try { await chrome.tabs.sendMessage(tabId, { type: 'SHOW_RETRYING' }); } catch {}
          }
        }
      }
      trackEvent('summary_local');
      sendResponse({
        success: true,
        summary: generateIntelligentSummary(message.text),
        method: aiAttempted ? 'InfoBlend Local (Fallback)' : 'InfoBlend Local'
      });
      return;
    }

  }
}));
