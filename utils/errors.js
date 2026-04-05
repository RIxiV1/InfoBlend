/**
 * InfoBlend Error Handling Utility
 * Maps technical expansion errors to human-friendly messages.
 */

const ERROR_MAP = {
  'Context invalidated': 'Extension updated. Please refresh this page to continue.',
  'Could not establish connection': 'Background service is sleeping. Please refresh.',
  'No captions available': 'This video does not have transcript data available.',
  'API Error: 401': 'Invalid AI API Key. Please check your settings.',
  'API Error: 429': 'Rate limit exceeded. Try again in a few minutes.',
  'Fetch failed': 'Network error. Please check your internet connection.',
  'No readable article': 'Could not find enough text on this page to summarize.'
};

/**
 * Translates a technical error into a user-friendly strings.
 * @param {string|Error} error - The error to translate.
 * @returns {string}
 */
export const translateError = (error) => {
  const message = typeof error === 'string' ? error : error.message;
  
  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (message.includes(key)) return value;
  }
  
  return message || 'An unexpected error occurred. Please try again.';
};
