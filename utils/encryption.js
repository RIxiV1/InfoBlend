/**
 * Encryption utility for Chrome Extension storage.
 * Uses Web Crypto API (AES-GCM) with cached key derivation.
 */

const SALT_KEY = 'infoblend_salt';
const ITERATIONS = 600000;

// Cache derived key to avoid re-running PBKDF2 on every call
let _cachedKey = null;
let _cachedSaltHash = null;

async function getDerivedKey(salt) {
  const saltHash = salt.join(',');
  if (_cachedKey && _cachedSaltHash === saltHash) return _cachedKey;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(chrome.runtime.id),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  _cachedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  _cachedSaltHash = saltHash;
  return _cachedKey;
}

async function getSalt() {
  const result = await chrome.storage.local.get([SALT_KEY]);
  if (result[SALT_KEY]) return new Uint8Array(result[SALT_KEY]);
  const newSalt = crypto.getRandomValues(new Uint8Array(16));
  await chrome.storage.local.set({ [SALT_KEY]: Array.from(newSalt) });
  return newSalt;
}

export const encrypt = async (text) => {
  if (!text) return text;
  const salt = await getSalt();
  const key = await getDerivedKey(salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < combined.length; i += chunk) {
    binary += String.fromCharCode(...combined.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const decrypt = async (base64Data) => {
  if (!base64Data || typeof base64Data !== 'string') return base64Data;
  try {
    const combined = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);

    const salt = await getSalt();
    const key = await getDerivedKey(salt);

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    // May be plaintext from pre-encryption era
    return base64Data;
  }
};
