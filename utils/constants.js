/**
 * Message type constants used across background, content scripts, and popup.
 *
 * Content scripts cannot import ES modules, so contentScript.js mirrors this
 * object onto `window.__ib.MSG`. Keep both in sync — any divergence becomes
 * a silent runtime no-op (one side sends "FOO", the other listens for "FOOX").
 */
export const MSG = Object.freeze({
  // Content → Background (request/response)
  FETCH_DEFINITION: 'FETCH_DEFINITION',
  FETCH_AUDIO: 'FETCH_AUDIO',
  PERFORM_SUMMARIZATION: 'PERFORM_SUMMARIZATION',
  PERFORM_TRANSLATION: 'PERFORM_TRANSLATION',
  PERFORM_PAGE_QA: 'PERFORM_PAGE_QA',

  // Background → Content (one-way)
  SHOW_DEFINITION: 'SHOW_DEFINITION',
  SHOW_ERROR: 'SHOW_ERROR',
  SHOW_LOADING: 'SHOW_LOADING',
  SHOW_RETRYING: 'SHOW_RETRYING',

  // Popup → Content (one-way)
  SUMMARIZE_PAGE: 'SUMMARIZE_PAGE',
  SUMMARIZE_SELECTION: 'SUMMARIZE_SELECTION',
  TRANSLATE_SELECTION: 'TRANSLATE_SELECTION',

  // Background → Content (request/response) — used to grab the surrounding
  // paragraph of the current selection so context-menu actions can be
  // context-aware. chrome.contextMenus.onClicked itself doesn't expose this.
  GET_SELECTION_CONTEXT: 'GET_SELECTION_CONTEXT'
});
