/**
 * Anonymous local-only usage counters.
 * All data stays on-device in chrome.storage.local — nothing is transmitted.
 * Helps inform which features are actually used.
 */

const TELEMETRY_KEY = 'ib_usage';

let _counters = null;

async function loadCounters() {
  if (_counters) return _counters;
  try {
    const result = await chrome.storage.local.get([TELEMETRY_KEY]);
    _counters = result[TELEMETRY_KEY] || {};
  } catch {
    _counters = {};
  }
  return _counters;
}

async function flush() {
  try { await chrome.storage.local.set({ [TELEMETRY_KEY]: _counters }); }
  catch { /* storage unavailable */ }
}

/**
 * Increment a named counter.
 * @param {'definition' | 'summary_ai' | 'summary_local' | 'palette' | 'context_menu'} event
 */
export async function trackEvent(event) {
  const counters = await loadCounters();
  counters[event] = (counters[event] || 0) + 1;
  counters._lastActive = Date.now();
  await flush();
}

/** Returns all counters (for display in popup or debugging). */
export async function getUsageStats() {
  return await loadCounters();
}
