import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock chrome APIs
const storageBackend = {};
globalThis.chrome = {
  runtime: { id: 'test-extension-id-storage' },
  storage: {
    local: {
      get: async (keys) => {
        const result = {};
        for (const k of keys) { if (storageBackend[k] !== undefined) result[k] = storageBackend[k]; }
        return result;
      },
      set: async (data) => { Object.assign(storageBackend, data); }
    }
  }
};

const { getStorageData, setStorageData } = await import('../utils/storage.js');

describe('storage', () => {

  beforeEach(() => {
    for (const key of Object.keys(storageBackend)) {
      if (key !== 'infoblend_salt') delete storageBackend[key];
    }
  });

  it('stores and retrieves non-sensitive data in plain text', async () => {
    await setStorageData({ theme: 'dark', definitionsEnabled: true });
    const result = await getStorageData(['theme', 'definitionsEnabled']);
    assert.equal(result.theme, 'dark');
    assert.equal(result.definitionsEnabled, true);
  });

  it('encrypts aiKey on save', async () => {
    await setStorageData({ aiKey: 'sk-test-123' });
    // Raw storage should NOT contain plaintext key
    assert.notEqual(storageBackend.aiKey, 'sk-test-123');
    // Should be a base64 string (encrypted)
    assert.match(storageBackend.aiKey, /^[A-Za-z0-9+/]+=*$/);
  });

  it('decrypts aiKey on read', async () => {
    await setStorageData({ aiKey: 'sk-secret-key-456' });
    const result = await getStorageData(['aiKey']);
    assert.equal(result.aiKey, 'sk-secret-key-456');
  });

  it('round-trips aiKey through encrypt/decrypt', async () => {
    const key = 'sk-proj-abcdefghijklmnop1234567890';
    await setStorageData({ aiKey: key });
    const result = await getStorageData(['aiKey']);
    assert.equal(result.aiKey, key);
  });

  it('handles empty aiKey', async () => {
    await setStorageData({ aiKey: '' });
    // Empty string should not be encrypted (guard in setStorageData)
    assert.equal(storageBackend.aiKey, '');
  });

  it('handles null aiKey', async () => {
    await setStorageData({ aiKey: null });
    assert.equal(storageBackend.aiKey, null);
  });

  it('does not encrypt non-sensitive keys', async () => {
    await setStorageData({ theme: 'light', aiProvider: 'gemini' });
    // These should be stored as-is
    assert.equal(storageBackend.theme, 'light');
    assert.equal(storageBackend.aiProvider, 'gemini');
  });

  it('handles mixed sensitive and non-sensitive data', async () => {
    await setStorageData({
      aiKey: 'sk-mixed-test',
      theme: 'dark',
      aiProvider: 'openai',
      definitionsEnabled: false
    });

    const result = await getStorageData(['aiKey', 'theme', 'aiProvider', 'definitionsEnabled']);
    assert.equal(result.aiKey, 'sk-mixed-test');
    assert.equal(result.theme, 'dark');
    assert.equal(result.aiProvider, 'openai');
    assert.equal(result.definitionsEnabled, false);
  });

  it('returns empty object for missing keys', async () => {
    const result = await getStorageData(['nonexistent']);
    assert.equal(result.nonexistent, undefined);
  });

  it('handles reading non-string aiKey (legacy plain object)', async () => {
    // Simulate legacy storage where aiKey was stored as non-string
    storageBackend.aiKey = 12345;
    const result = await getStorageData(['aiKey']);
    // Non-string values skip decryption
    assert.equal(result.aiKey, 12345);
  });
});
