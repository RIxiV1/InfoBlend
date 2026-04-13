import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for api.js logic.
 * Since api.js depends on chrome.* and fetch, we test the pure logic patterns
 * and verify the module's export shape via dynamic import with mocks.
 */

// Mock chrome.storage.local for cache tests
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

// Mock fetch
let fetchResponses = [];
globalThis.fetch = async (_url) => {
  const response = fetchResponses.shift();
  if (!response) return { ok: false, status: 404 };
  return response;
};

describe('api.js exports', () => {
  let api;

  beforeEach(async () => {
    // Clear storage mock
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    fetchResponses = [];
  });

  it('can be imported as ES module', async () => {
    // Fresh import
    api = await import('../utils/api.js');
    assert.ok(typeof api.fetchDefinition === 'function');
    assert.ok(typeof api.fetchAIResponse === 'function');
  });
});

describe('fetchDefinition behavior', () => {
  it('rejects selections longer than 5 words', async () => {
    const api = await import('../utils/api.js');
    await assert.rejects(
      () => api.fetchDefinition('this is a very long selection text'),
      { message: 'Selection too long for definition. Try summarizing instead.' }
    );
  });
});

describe('fetchAIResponse validation', () => {
  it('rejects invalid endpoints', async () => {
    const api = await import('../utils/api.js');
    await assert.rejects(
      () => api.fetchAIResponse('test', 'not-a-url', 'key', 'gemini'),
      { message: 'Invalid API Endpoint. Please check your settings.' }
    );
  });

  it('rejects empty endpoints', async () => {
    const api = await import('../utils/api.js');
    await assert.rejects(
      () => api.fetchAIResponse('test', '', 'key', 'gemini'),
      { message: 'Invalid API Endpoint. Please check your settings.' }
    );
  });

  it('rejects null endpoints', async () => {
    const api = await import('../utils/api.js');
    await assert.rejects(
      () => api.fetchAIResponse('test', null, 'key', 'gemini'),
      { message: 'Invalid API Endpoint. Please check your settings.' }
    );
  });
});

describe('LRU cache logic', () => {
  it('returns not found for uncached terms when all APIs fail', async () => {
    fetchResponses = Array(4).fill({ ok: false, status: 404 });
    const api = await import('../utils/api.js');
    const result = await api.fetchDefinition('xyznonexistent');
    assert.ok(result.isNotFound);
    assert.equal(result.title, 'Not Found');
  });
});
