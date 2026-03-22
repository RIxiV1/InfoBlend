/**
 * Storage utility for Chrome Storage API.
 */
import { encrypt, decrypt } from './encryption.js';

const SENSITIVE_KEYS = ['userData', 'aiKey'];

export const getStorageData = (keys) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, async (result) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      
      // Decrypt sensitive fields
      for (const key of SENSITIVE_KEYS) {
        if (result[key]) {
          if (key === 'userData' && typeof result[key] === 'object') {
            // Handle legacy object if not already encrypted
            // If it's an object, it's definitely not encrypted string
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
      resolve(result);
    });
  });
};

export const setStorageData = (data) => {
  return new Promise((resolve, reject) => {
    (async () => {
      const encryptedData = { ...data };
      
      // Encrypt sensitive fields
      for (const key of SENSITIVE_KEYS) {
        if (encryptedData[key]) {
          const valueToEncrypt = typeof encryptedData[key] === 'object' 
            ? JSON.stringify(encryptedData[key]) 
            : encryptedData[key];
          encryptedData[key] = await encrypt(valueToEncrypt);
        }
      }

      chrome.storage.local.set(encryptedData, () => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve();
      });
    })();
  });
};

export const clearStorageData = () => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve();
    });
  });
};

export const onStorageChange = (callback) => {
  chrome.storage.onChanged.addListener(callback);
};
