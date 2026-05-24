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

  // Background → Content (one-way)
  SHOW_DEFINITION: 'SHOW_DEFINITION',
  SHOW_ERROR: 'SHOW_ERROR',
  SHOW_LOADING: 'SHOW_LOADING',
  SHOW_RETRYING: 'SHOW_RETRYING',

  // Popup → Content (one-way)
  SUMMARIZE_PAGE: 'SUMMARIZE_PAGE',
  SUMMARIZE_SELECTION: 'SUMMARIZE_SELECTION'
});
