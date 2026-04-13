/**
 * Cross-browser compatibility and shared utilities.
 */

// Firefox namespace shim
if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
  globalThis.chrome = globalThis.browser;
}

/**
 * Fetch with timeout using AbortController (works in all browsers).
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} ms - Timeout in milliseconds (default 15000)
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const resp = await fetch(url, { ...options, signal: ac.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}
