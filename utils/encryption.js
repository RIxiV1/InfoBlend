/**
 * Encryption utility for Chrome Extension storage.
 * Uses Web Crypto API (AES-GCM).
 */

const SALT_KEY = 'infoblend_salt';
const ITERATIONS = 600000;

/**
 * Derives a CryptoKey from a secret (like chrome.runtime.id) and a salt.
 */
async function getDerivedKey(salt) {
  const secret = chrome.runtime.id;
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Gets or creates a persistent salt for the installation.
 */
async function getSalt() {
  const result = await chrome.storage.local.get([SALT_KEY]);
  if (result[SALT_KEY]) {
    return new Uint8Array(result[SALT_KEY]);
  }
  const newSalt = crypto.getRandomValues(new Uint8Array(16));
  await chrome.storage.local.set({ [SALT_KEY]: Array.from(newSalt) });
  return newSalt;
}

export const encrypt = async (text) => {
  if (!text) return text;
  try {
    const salt = await getSalt();
    const key = await getDerivedKey(salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(text);

    const encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encodedData
    );

    // Combine IV and encrypted data for storage
    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedContent), iv.length);

    // Return as base64 string safely without stack overflow
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < combined.length; i += chunkSize) {
      binary += String.fromCharCode(...combined.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  } catch (err) {
    console.error('[InfoBlend] Encryption failed:', err);
    throw new Error('Encryption failed. Sensitive data was not stored.');
  }
};

export const decrypt = async (base64Data) => {
  if (!base64Data || typeof base64Data !== 'string') return base64Data;
  try {
    const combined = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const salt = await getSalt();
    const key = await getDerivedKey(salt);

    const decryptedContent = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedContent);
  } catch (err) {
    // If decryption fails, it might be plaintext (pre-upgrade)
    return base64Data;
  }
};
