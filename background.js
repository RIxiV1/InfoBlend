import './utils/compat.js';
import { fetchDefinition, fetchAIResponse, cleanupCache } from './utils/api.js';
import { getStorageData } from './utils/storage.js';
import { generateIntelligentSummary } from './utils/summarizer.js';
import { translateError } from './utils/errors.js';
import { MSG } from './utils/constants.js';

/**
 * Background Service Worker for InfoBlend.
 */

// --- Context Menu (define + summarize on selection) ---
// onInstalled + onStartup can both fire on service-worker spin-up. Without a
// callback on create(), the second concurrent call races and emits
// "Unchecked runtime.lastError: Cannot create item with duplicate id ...".
// We pass a callback whose only job is to consume lastError silently — and we
// also consume removeAll's lastError for the same reason.
const setupContextMenus = () => {
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;
    chrome.contextMenus.create({
      id: 'define-ib',
      title: chrome.i18n.getMessage('contextMenuDefine') || 'Define selection with InfoBlend',
      contexts: ['selection']
    }, () => { void chrome.runtime.lastError; });
    chrome.contextMenus.create({
      id: 'summarize-ib',
      title: chrome.i18n.getMessage('contextMenuSummarize') || 'Summarize selection with InfoBlend',
      contexts: ['selection']
    }, () => { void chrome.runtime.lastError; });
  });
};

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

// --- Handlers ---
const getAISettings = () => getStorageData(['aiEndpoint', 'aiKey', 'aiProvider']);

const handleDefinition = async (word, context) => {
  const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
  if (aiKey && aiEndpoint) {
    const content = await fetchAIResponse(word, aiEndpoint, aiKey, aiProvider, 'define', context);
    return { title: word, content, source: `AI (${aiProvider})` };
  }
  // For non-AI definitions, get standard definition and append context note if available
  const result = await fetchDefinition(word);
  if (context && result && !result.isNotFound) {
    result.contextNote = context;
  }
  return result;
};

// Single source of truth for "summarize this text" — used by both the
// right-click context menu and the in-page PERFORM_SUMMARIZATION message.
// onAIFailure is invoked when AI was attempted but threw, so callers can
// surface a "falling back to local" indicator before the local summary lands.
const handleSummarization = async (text, onAIFailure) => {
  const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
  if (aiKey && aiEndpoint) {
    try {
      const summary = await fetchAIResponse(text, aiEndpoint, aiKey, aiProvider, 'summarize');
      return { summary, method: `AI (${aiProvider})` };
    } catch (e) {
      await onAIFailure?.(e);
      return { summary: generateIntelligentSummary(text), method: 'InfoBlend Local (Fallback)' };
    }
  }
  return { summary: generateIntelligentSummary(text), method: 'InfoBlend Local' };
};

// --- Async message wrapper ---
const wrapAsync = (callback) => (message, sender, sendResponse) => {
  callback(message, sender, sendResponse).catch(err => {
    console.error('[InfoBlend Background]', err.message);
    sendResponse({ success: false, error: translateError(err) });
  });
  return true; // keep channel open
};

// --- Context menu trigger (define + summarize) ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText) return;
  const text = info.selectionText.trim();

  try {
    if (info.menuItemId === 'summarize-ib') {
      await chrome.tabs.sendMessage(tab.id, { type: MSG.SHOW_LOADING });
      const { summary, method } = await handleSummarization(text, async () => {
        try { await chrome.tabs.sendMessage(tab.id, { type: MSG.SHOW_RETRYING }); } catch {}
      });
      await chrome.tabs.sendMessage(tab.id, {
        type: MSG.SHOW_DEFINITION,
        data: { title: 'Selection Summary', content: summary, source: method }
      });
    } else if (info.menuItemId === 'define-ib') {
      // Context menu has no surrounding-paragraph context (browser doesn't expose
      // it), so we look up the bare term. Length cap matches fetchDefinition's.
      if (text.split(/\s+/).length > 5) {
        await chrome.tabs.sendMessage(tab.id, {
          type: MSG.SHOW_DEFINITION,
          data: { title: 'Notice', content: 'Selection too long for definition. Try summarizing instead.', source: 'InfoBlend' }
        });
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: MSG.SHOW_LOADING });
      const data = await handleDefinition(text);
      await chrome.tabs.sendMessage(tab.id, { type: MSG.SHOW_DEFINITION, data });
    }
  } catch (err) {
    try { await chrome.tabs.sendMessage(tab.id, { type: MSG.SHOW_ERROR, message: err.message }); }
    catch { /* tab may have closed */ }
  }
});

// --- Periodic cache cleanup (every 6 hours) ---
chrome.alarms.create('ib-cache-cleanup', { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ib-cache-cleanup') cleanupCache();
});

// --- Message validation ---
const VALID_MESSAGES = {
  [MSG.FETCH_DEFINITION]: { required: ['word'], optional: ['context'] },
  [MSG.FETCH_AUDIO]: { required: ['url'] },
  [MSG.PERFORM_SUMMARIZATION]: { required: ['text'] }
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
    case MSG.FETCH_DEFINITION:
      sendResponse({ success: true, data: await handleDefinition(message.word, message.context) });
      return;

    case MSG.FETCH_AUDIO: {
      // Fetch audio in background to bypass page CSP restrictions
      try {
        const resp = await fetch(message.url);
        if (!resp.ok) throw new Error('Audio fetch failed');
        const blob = await resp.blob();
        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        sendResponse({ success: true, dataUrl });
      } catch {
        sendResponse({ success: false });
      }
      return;
    }

    case MSG.PERFORM_SUMMARIZATION: {
      const { summary, method } = await handleSummarization(message.text, async () => {
        const tabId = sender.tab?.id;
        if (tabId) {
          try { await chrome.tabs.sendMessage(tabId, { type: MSG.SHOW_RETRYING }); } catch {}
        }
      });
      sendResponse({ success: true, summary, method });
      return;
    }

  }
}));
