/**
 * Storage utility for Chrome Storage API.
 * Uses modern Promise-based chrome.storage APIs (MV3+).
 */
import { encrypt, decrypt } from './encryption.js';

const SENSITIVE_KEYS = ['userData', 'aiKey'];

export const getStorageData = async (keys) => {
  const result = await chrome.storage.local.get(keys);

  // Decrypt sensitive fields
  for (const key of SENSITIVE_KEYS) {
    if (result[key]) {
      if (key === 'userData' && typeof result[key] === 'object') {
        // Legacy unencrypted object — skip decryption
        continue;
      }
      if (typeof result[key] === 'string') {
        const decrypted = await decrypt(result[key]);
        try {
          result[key] = JSON.parse(decrypted);
        } catch {
          result[key] = decrypted;
        }
      }
    }
  }
  return result;
};

export const setStorageData = async (data) => {
  const encryptedData = { ...data };

  // Encrypt sensitive fields
  for (const key of SENSITIVE_KEYS) {
    if (encryptedData[key] != null && encryptedData[key] !== '') {
      const valueToEncrypt = typeof encryptedData[key] === 'object'
        ? JSON.stringify(encryptedData[key])
        : String(encryptedData[key]);
      encryptedData[key] = await encrypt(valueToEncrypt);
    }
  }

  await chrome.storage.local.set(encryptedData);
};

export const clearStorageData = async () => {
  await chrome.storage.local.clear();
};

export const onStorageChange = (callback) => {
  chrome.storage.onChanged.addListener(callback);
};
