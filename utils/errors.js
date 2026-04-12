/**
 * Maps technical errors to user-friendly messages.
 */
const ERROR_MAP = {
  'Context invalidated': 'Extension updated. Please refresh this page.',
  'Could not establish connection': 'Background service sleeping. Please refresh.',
  'Failed to fetch': 'Network error. Check your internet connection.',
  'API Error: 401': 'Invalid API key. Check your settings.',
  'API Error: 429': 'Rate limit exceeded. Try again in a few minutes.',
  'Invalid API Endpoint': 'Invalid API endpoint. Check your settings.',
  'Selection too long': 'Selection too long for definition. Try summarizing instead.'
};

export function translateError(error) {
  const message = typeof error === 'string' ? error : (error?.message || '');
  if (!message) return 'An unexpected error occurred.';

  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return message;
}
