import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for encryption.js utility.
 * Requires Node 19+ for Web Crypto API (globalThis.crypto.subtle).
 */

// Mock chrome.storage.local and chrome.runtime
const mockStorage = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        const result = {};
        for (const key of keys) {
          if (mockStorage[key] !== undefined) result[key] = mockStorage[key];
        }
        return result;
      },
      set: async (data) => { Object.assign(mockStorage, data); }
    }
  },
  runtime: { id: 'test-extension-id' }
};

describe('encryption module', () => {
  let encrypt, decrypt;

  it('can be imported', async () => {
    const mod = await import('../utils/encryption.js');
    encrypt = mod.encrypt;
    decrypt = mod.decrypt;
    assert.ok(typeof encrypt === 'function');
    assert.ok(typeof decrypt === 'function');
  });

  it('encrypts and decrypts text correctly', async () => {
    const mod = await import('../utils/encryption.js');
    const original = 'my-secret-api-key-12345';
    const encrypted = await mod.encrypt(original);
    assert.ok(typeof encrypted === 'string');
    assert.notEqual(encrypted, original);

    const decrypted = await mod.decrypt(encrypted);
    assert.equal(decrypted, original);
  });

  it('returns empty/falsy values as-is', async () => {
    const mod = await import('../utils/encryption.js');
    assert.equal(await mod.encrypt(''), '');
    assert.equal(await mod.encrypt(null), null);
    assert.equal(await mod.encrypt(undefined), undefined);
  });

  it('returns non-string values as-is from decrypt', async () => {
    const mod = await import('../utils/encryption.js');
    assert.equal(await mod.decrypt(null), null);
    assert.equal(await mod.decrypt(undefined), undefined);
    assert.equal(await mod.decrypt(42), 42);
  });

  it('handles plaintext gracefully in decrypt (pre-encryption era)', async () => {
    const mod = await import('../utils/encryption.js');
    // Plaintext that isn't valid base64/AES should return as-is
    const result = await mod.decrypt('just-a-plain-api-key');
    assert.equal(result, 'just-a-plain-api-key');
  });

  it('produces different ciphertext for same input (random IV)', async () => {
    const mod = await import('../utils/encryption.js');
    const text = 'test-key';
    const enc1 = await mod.encrypt(text);
    const enc2 = await mod.encrypt(text);
    assert.notEqual(enc1, enc2);
  });

  it('generates and persists salt', async () => {
    // Salt should be stored in mockStorage after first use
    assert.ok(mockStorage['infoblend_salt'], 'Salt should be persisted');
    assert.ok(Array.isArray(mockStorage['infoblend_salt']));
    assert.equal(mockStorage['infoblend_salt'].length, 16);
  });
});
