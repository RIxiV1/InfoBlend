import './utils/compat.js';
import { fetchDefinition, fetchAIResponse, fetchMyMemoryTranslation, cleanupCache } from './utils/api.js';
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
    chrome.contextMenus.create({
      id: 'translate-ib',
      title: chrome.i18n.getMessage('contextMenuTranslate') || 'Translate selection with InfoBlend',
      contexts: ['selection']
    }, () => { void chrome.runtime.lastError; });
  });
};

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

// --- Handlers ---
const getAISettings = () => getStorageData(['aiEndpoint', 'aiKey', 'aiProvider', 'summaryStyle', 'targetLanguage']);

// Translation handler — AI when available (context-aware, idiom-preserving),
// MyMemory free tier otherwise. Returns { translated, source, detectedSource?,
// targetLanguage }. Caller passes optional surrounding-paragraph context for
// AI disambiguation.
const handleTranslation = async (text, context = '') => {
  const { aiEndpoint, aiKey, aiProvider, targetLanguage } = await getAISettings();
  const target = targetLanguage || 'en';

  // MyMemory call helper — unwraps {translated, detectedSource} or null,
  // re-throws TranslationQuotaError for the caller to handle as needed.
  const tryFree = async () => {
    try {
      const r = await fetchMyMemoryTranslation(text, target);
      return r ? { ...r, source: `Free translation${r.detectedSource ? ` (${r.detectedSource} → ${target})` : ` → ${target}`}` } : null;
    } catch (e) {
      // Quota error bubbles up so we can show a clear message instead of a
      // generic "translation failed".
      throw e;
    }
  };

  if (aiKey && aiEndpoint) {
    try {
      const translated = await fetchAIResponse(text, aiEndpoint, aiKey, aiProvider, 'translate', context, 'bullets', target);
      return { translated, source: `AI translation → ${target}`, targetLanguage: target };
    } catch (aiErr) {
      // AI failed — try free tier, but don't shadow a quota error from MyMemory
      try {
        const fallback = await tryFree();
        if (fallback) return { ...fallback, targetLanguage: target };
      } catch (freeErr) { /* swallow; re-throw original AI error below */ }
      throw aiErr;
    }
  }

  const fallback = await tryFree();
  if (!fallback) {
    throw new Error('Translation unavailable. Add an AI key in the popup for higher-quality translations.');
  }
  return { ...fallback, targetLanguage: target };
};

const handleDefinition = async (word, context) => {
  const { aiEndpoint, aiKey, aiProvider } = await getAISettings();
  if (aiKey && aiEndpoint) {
    const content = await fetchAIResponse(word, aiEndpoint, aiKey, aiProvider, 'define', context);
    // term is the user's original selection — used for TTS pronunciation
    // when no recorded audio is available.
    return { term: word, title: word, content, source: 'AI definition' };
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
  const { aiEndpoint, aiKey, aiProvider, summaryStyle } = await getAISettings();
  if (aiKey && aiEndpoint) {
    try {
      const summary = await fetchAIResponse(text, aiEndpoint, aiKey, aiProvider, 'summarize', '', summaryStyle || 'bullets');
      return { summary, method: 'AI summary' };
    } catch (e) {
      await onAIFailure?.(e);
      return { summary: generateIntelligentSummary(text), method: 'Quick summary (offline)' };
    }
  }
  return { summary: generateIntelligentSummary(text), method: 'Quick summary' };
};

// --- Async message wrapper ---
const wrapAsync = (callback) => (message, sender, sendResponse) => {
  callback(message, sender, sendResponse).catch(err => {
    console.error('[InfoBlend Background]', err.message);
    sendResponse({ success: false, error: translateError(err) });
  });
  return true; // keep channel open
};

// Best-effort context fetch from the content script. Used by the context-menu
// flows because chrome.contextMenus.onClicked doesn't expose surrounding text.
// Returns '' if the content script isn't reachable (e.g. the tab navigated)
// rather than throwing — callers can still proceed with a context-free lookup.
async function getSelectionContext(tabId) {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { type: MSG.GET_SELECTION_CONTEXT });
    return typeof resp?.context === 'string' ? resp.context : '';
  } catch { return ''; }
}

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
    } else if (info.menuItemId === 'translate-ib') {
      await chrome.tabs.sendMessage(tab.id, { type: MSG.SHOW_LOADING });
      // Grab surrounding paragraph so idiom-aware translation works from
      // the context menu, not only from double-click flows.
      const context = await getSelectionContext(tab.id);
      const { translated, source } = await handleTranslation(text, context);
      await chrome.tabs.sendMessage(tab.id, {
        type: MSG.SHOW_DEFINITION,
        data: { title: 'Translation', content: translated, source, term: text }
      });
    } else if (info.menuItemId === 'define-ib') {
      if (text.split(/\s+/).length > 5) {
        await chrome.tabs.sendMessage(tab.id, {
          type: MSG.SHOW_DEFINITION,
          data: { title: 'Notice', content: 'Selection too long for definition. Try summarizing instead.', source: 'InfoBlend' }
        });
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: MSG.SHOW_LOADING });
      // Same context-fetch as translate-ib so context-menu definitions match
      // the quality of double-click ones.
      const context = await getSelectionContext(tab.id);
      const data = await handleDefinition(text, context);
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
  [MSG.PERFORM_SUMMARIZATION]: { required: ['text'] },
  [MSG.PERFORM_TRANSLATION]: { required: ['text'], optional: ['context'] }
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

    case MSG.PERFORM_TRANSLATION: {
      const { translated, source, targetLanguage } = await handleTranslation(message.text, message.context || '');
      sendResponse({ success: true, translated, source, targetLanguage });
      return;
    }

  }
}));
