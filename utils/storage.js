/**
 * Storage utility for Chrome Storage API (MV3).
 */
import { encrypt, decrypt } from './encryption.js';

const SENSITIVE_KEYS = ['aiKey'];

export const getStorageData = async (keys) => {
  const result = await chrome.storage.local.get(keys);

  for (const key of SENSITIVE_KEYS) {
    if (result[key] && typeof result[key] === 'string') {
      const decrypted = await decrypt(result[key]);
      try { result[key] = JSON.parse(decrypted); }
      catch { result[key] = decrypted; }
    }
  }
  return result;
};

export const setStorageData = async (data) => {
  const out = { ...data };

  for (const key of SENSITIVE_KEYS) {
    if (out[key] != null && out[key] !== '') {
      out[key] = await encrypt(String(out[key]));
    }
  }

  await chrome.storage.local.set(out);
};
