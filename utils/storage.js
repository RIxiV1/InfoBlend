/**
 * Storage utility for Chrome Storage API (MV3).
 *
 * Two backing stores:
 *   - chrome.storage.local: large quota, per-device. Houses encrypted API key
 *     (never syncs across devices for privacy) and bulk data like the lookup
 *     cache and saved-words vault.
 *   - chrome.storage.sync: 100KB total / 8KB per-item quota, replicated by
 *     Chrome to other signed-in browsers. Houses preferences only.
 *
 * Callers use getStorageData / setStorageData and don't need to know which
 * store a key lives in — the maps below route reads/writes appropriately.
 * On first run after this change, getStorageData reads from BOTH stores so a
 * device that previously had everything in local still works seamlessly; the
 * next setStorageData call writes the synced keys back into the right place.
 */
import { encrypt, decrypt } from './encryption.js';

const SENSITIVE_KEYS = new Set(['aiKey']);

// Settings that should follow the user across browsers. Anything not listed
// here defaults to local storage. We deliberately exclude:
//   - aiKey (sensitive, see SENSITIVE_KEYS)
//   - ib_def_cache, savedWords (too large for sync's 8KB/item quota)
//   - onboardingDone, tooltipsSeen (per-device flags by design)
const SYNCED_KEYS = new Set([
  'definitionsEnabled',
  'theme',
  'accentColor',
  'summaryStyle',
  'targetLanguage',
  'disabledSites',
  'triggerModifier',
  'aiEndpoint',
  'aiProvider'
]);

const splitKeys = (keys) => {
  const list = Array.isArray(keys) ? keys : (keys ? [keys] : []);
  const local = [];
  const sync = [];
  for (const k of list) (SYNCED_KEYS.has(k) ? sync : local).push(k);
  return { local, sync };
};

export const getStorageData = async (keys) => {
  const { local, sync } = splitKeys(keys);

  // Fetch both in parallel. Either store returning {} is fine; we just merge.
  // Migration safety: also read synced keys from local as a fallback for
  // pre-migration installs where everything lived in local. Sync wins when
  // both have a value (sync is the authoritative store post-migration).
  const [localRes, syncRes, syncFallbackInLocal] = await Promise.all([
    local.length ? chrome.storage.local.get(local).catch(() => ({})) : Promise.resolve({}),
    sync.length ? chrome.storage.sync.get(sync).catch(() => ({})) : Promise.resolve({}),
    sync.length ? chrome.storage.local.get(sync).catch(() => ({})) : Promise.resolve({})
  ]);

  const result = { ...syncFallbackInLocal, ...syncRes, ...localRes };

  for (const key of SENSITIVE_KEYS) {
    if (key in result && typeof result[key] === 'string') {
      result[key] = await decrypt(result[key]);
    }
  }
  return result;
};

export const setStorageData = async (data) => {
  const localPatch = {};
  const syncPatch = {};

  for (const [key, rawValue] of Object.entries(data)) {
    let value = rawValue;
    if (SENSITIVE_KEYS.has(key) && value != null && value !== '') {
      value = await encrypt(String(value));
    }
    if (SYNCED_KEYS.has(key)) syncPatch[key] = value;
    else localPatch[key] = value;
  }

  // Write both in parallel; either failing leaves the other intact. Sync can
  // fail with QUOTA_BYTES_PER_ITEM if a list grows too large — caller would
  // see that error and is expected to handle it (or shrink the value).
  await Promise.all([
    Object.keys(localPatch).length ? chrome.storage.local.set(localPatch) : null,
    Object.keys(syncPatch).length ? chrome.storage.sync.set(syncPatch) : null
  ]);
};
