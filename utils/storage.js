/**
 * Storage utility for Chrome Storage API (MV3).
 */
import { encrypt, decrypt } from './encryption.js';

const SENSITIVE_KEYS = ['aiKey'];

export const getStorageData = async (keys) => {
  const result = await chrome.storage.local.get(keys);

  for (const key of SENSITIVE_KEYS) {
    if (key in result && typeof result[key] === 'string') {
      result[key] = await decrypt(result[key]);
    }
  }
  return result;
};

export const setStorageData = async (data) => {
  const out = { ...data };

  for (const key of SENSITIVE_KEYS) {
    if (key in out && out[key] != null && out[key] !== '') {
      out[key] = await encrypt(String(out[key]));
    }
  }

  await chrome.storage.local.set(out);
};
