import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock chrome.runtime.id and chrome.storage.local
const storageData = {};
globalThis.chrome = {
  runtime: { id: 'test-extension-id-abc123' },
  storage: {
    local: {
      get: async (keys) => {
        const result = {};
        for (const k of keys) { if (storageData[k] !== undefined) result[k] = storageData[k]; }
        return result;
      },
      set: async (data) => { Object.assign(storageData, data); }
    }
  }
};

const { encrypt, decrypt } = await import('../utils/encryption.js');

describe('encrypt / decrypt', () => {

  beforeEach(() => {
    // Clear storage but keep salt if generated
    for (const key of Object.keys(storageData)) {
      if (key !== 'infoblend_salt') delete storageData[key];
    }
  });

  it('round-trips a simple string', async () => {
    const original = 'hello world';
    const encrypted = await encrypt(original);
    const decrypted = await decrypt(encrypted);
    assert.equal(decrypted, original);
  });

  it('round-trips an API key', async () => {
    const key = 'sk-proj-abc123def456ghi789';
    const encrypted = await encrypt(key);
    const decrypted = await decrypt(encrypted);
    assert.equal(decrypted, key);
  });

  it('round-trips a JSON string', async () => {
    const json = JSON.stringify({ name: 'Alice', email: 'alice@test.com' });
    const encrypted = await encrypt(json);
    const decrypted = await decrypt(encrypted);
    assert.equal(decrypted, json);
    assert.deepEqual(JSON.parse(decrypted), { name: 'Alice', email: 'alice@test.com' });
  });

  it('round-trips unicode content', async () => {
    const text = 'Hello 🌍 你好 مرحبا';
    const encrypted = await encrypt(text);
    const decrypted = await decrypt(encrypted);
    assert.equal(decrypted, text);
  });

  it('round-trips empty string', async () => {
    const encrypted = await encrypt('');
    // encrypt returns empty string for falsy input
    assert.equal(encrypted, '');
  });

  it('returns null/undefined as-is', async () => {
    assert.equal(await encrypt(null), null);
    assert.equal(await encrypt(undefined), undefined);
    assert.equal(await decrypt(null), null);
    assert.equal(await decrypt(undefined), undefined);
  });

  it('produces base64 output', async () => {
    const encrypted = await encrypt('test');
    // Valid base64 only contains these chars
    assert.match(encrypted, /^[A-Za-z0-9+/]+=*$/);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const text = 'same input';
    const enc1 = await encrypt(text);
    const enc2 = await encrypt(text);
    assert.notEqual(enc1, enc2, 'Two encryptions of the same text should differ (random IV)');
    // But both decrypt to the same value
    assert.equal(await decrypt(enc1), text);
    assert.equal(await decrypt(enc2), text);
  });

  it('decrypt returns garbage input as-is (pre-encryption era fallback)', async () => {
    const plaintext = 'not-encrypted-at-all';
    const result = await decrypt(plaintext);
    assert.equal(result, plaintext);
  });

  it('decrypt returns non-string input as-is', async () => {
    assert.equal(await decrypt(42), 42);
    assert.equal(await decrypt(true), true);
    assert.deepEqual(await decrypt({ key: 'val' }), { key: 'val' });
  });

  it('handles long strings (simulating large data)', async () => {
    const long = 'A'.repeat(10000);
    const encrypted = await encrypt(long);
    const decrypted = await decrypt(encrypted);
    assert.equal(decrypted, long);
  });

  it('generates and persists a salt', async () => {
    // Salt should have been created by now from previous tests
    assert.ok(storageData['infoblend_salt'], 'Salt should be stored');
    assert.ok(Array.isArray(storageData['infoblend_salt']), 'Salt should be an array');
    assert.equal(storageData['infoblend_salt'].length, 16, 'Salt should be 16 bytes');
  });

  it('uses cached key on subsequent calls (no error from re-derivation)', async () => {
    // Rapid-fire encrypt/decrypt to exercise the cache path
    for (let i = 0; i < 10; i++) {
      const enc = await encrypt(`test-${i}`);
      const dec = await decrypt(enc);
      assert.equal(dec, `test-${i}`);
    }
  });
});
