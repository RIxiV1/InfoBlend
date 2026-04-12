import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock storage for LRU cache
const storageData = {};
globalThis.chrome = {
  runtime: { id: 'test-id' },
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

// Mock fetch
let fetchMock;
const mockFetch = (responses) => {
  let callIndex = 0;
  globalThis.fetch = async (url, opts) => {
    fetchMock.calls.push({ url, opts });
    const handler = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return handler(url, opts);
  };
  fetchMock.calls = [];
};

if (!AbortSignal.timeout) AbortSignal.timeout = () => AbortSignal.abort();

const api = await import('../utils/api.js');
const { fetchDefinition, fetchAIResponse, getCachedDefinition, cacheDefinition, _resetCache } = api;

describe('fetchDefinition — single word', () => {
  beforeEach(() => {
    fetchMock = { calls: [] };
    delete storageData.ib_def_cache;
    _resetCache();
  });

  it('throws on selections longer than 5 words', async () => {
    await assert.rejects(fetchDefinition('one two three four five six'), /Selection too long/);
  });

  it('trims whitespace', async () => {
    mockFetch([() => ({ ok: true, json: async () => [{ word: 'hello', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A greeting' }] }] }] })]);
    const result = await fetchDefinition('  hello  ');
    assert.equal(result.title, 'hello');
  });

  it('extracts audioUrl from Dictionary API', async () => {
    mockFetch([() => ({
      ok: true,
      json: async () => [{
        word: 'hello',
        phonetic: '/həˈloʊ/',
        phonetics: [
          { text: '/həˈloʊ/', audio: '' },
          { text: '/həˈloʊ/', audio: 'https://api.dictionaryapi.dev/media/hello.mp3' }
        ],
        meanings: [{ partOfSpeech: 'exclamation', definitions: [{ definition: 'A greeting.' }] }]
      }]
    })]);

    const result = await fetchDefinition('hello');
    assert.equal(result.audioUrl, 'https://api.dictionaryapi.dev/media/hello.mp3');
    assert.equal(result.phonetic, '/həˈloʊ/');
  });

  it('returns empty audioUrl when no audio available', async () => {
    mockFetch([() => ({
      ok: true,
      json: async () => [{
        word: 'test',
        phonetics: [{ text: '/tɛst/' }],
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A trial.' }] }]
      }]
    })]);

    const result = await fetchDefinition('test');
    assert.equal(result.audioUrl, '');
  });

  it('returns rich definition with meanings limited', async () => {
    mockFetch([() => ({
      ok: true,
      json: async () => [{
        word: 'run',
        meanings: [
          { partOfSpeech: 'verb', definitions: [{ definition: 'D1' }, { definition: 'D2' }, { definition: 'D3' }, { definition: 'D4' }] },
          { partOfSpeech: 'noun', definitions: [{ definition: 'N1' }] },
          { partOfSpeech: 'adj', definitions: [{ definition: 'A1' }] }
        ]
      }]
    })]);

    const result = await fetchDefinition('run');
    assert.equal(result.meanings.length, 2);
    assert.equal(result.meanings[0].definitions.length, 3);
  });

  it('tries Datamuse when Dictionary fails', async () => {
    mockFetch([
      () => ({ ok: false }),
      () => ({ ok: true, json: async () => [{ word: 'cat', defs: ['n\tA small carnivore'] }] })
    ]);
    const result = await fetchDefinition('cat');
    assert.equal(result.source, 'Datamuse');
  });

  it('Datamuse rejects non-matching words', async () => {
    mockFetch([
      () => ({ ok: false }),
      () => ({ ok: true, json: async () => [{ word: 'bat', defs: ['n\tFlying mammal'] }] }),
      () => ({ ok: false }),
      () => ({ ok: false })
    ]);
    const result = await fetchDefinition('cat');
    assert.equal(result.isNotFound, true);
  });

  it('falls through full chain to not-found', async () => {
    mockFetch([() => ({ ok: false }), () => ({ ok: true, json: async () => [] }), () => ({ ok: false }), () => ({ ok: false })]);
    const result = await fetchDefinition('xyznonword');
    assert.equal(result.isNotFound, true);
    assert.ok(result.url.includes('merriam-webster'));
  });

  it('handles all APIs throwing', async () => {
    mockFetch([() => { throw new Error('net'); }, () => { throw new Error('net'); }, () => { throw new Error('net'); }, () => { throw new Error('net'); }]);
    const result = await fetchDefinition('test');
    assert.equal(result.isNotFound, true);
  });
});

describe('fetchDefinition — compound terms (2-3 words)', () => {
  beforeEach(() => {
    fetchMock = { calls: [] };
    delete storageData.ib_def_cache;
    _resetCache();
  });

  it('routes compound terms through Wikipedia first', async () => {
    mockFetch([
      () => ({ ok: true, json: async () => ({ title: 'Cold War', extract: 'The Cold War was a geopolitical tension. It lasted decades.' }) })
    ]);

    const result = await fetchDefinition('cold war');
    assert.equal(result.source, 'Wikipedia');
    assert.ok(result.content.includes('Cold War'));
    // First call should be to Wikipedia, not Dictionary API
    assert.ok(fetchMock.calls[0].url.includes('wikipedia.org'));
  });

  it('falls through to Wiktionary for compound terms', async () => {
    mockFetch([
      () => ({ ok: false }), // Wikipedia fails
      () => ({ ok: true, json: async () => ({ extract: 'Machine learning definition.' }) }) // Wiktionary
    ]);

    const result = await fetchDefinition('machine learning');
    assert.equal(result.source, 'Wiktionary');
  });

  it('falls through to Dictionary API for compound terms', async () => {
    mockFetch([
      () => ({ ok: false }), // Wikipedia
      () => ({ ok: false }), // Wiktionary
      () => ({
        ok: true,
        json: async () => [{
          word: 'ice cream',
          meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A frozen dessert.' }] }]
        }]
      })
    ]);

    const result = await fetchDefinition('ice cream');
    assert.equal(result.source, 'Dictionary API');
    assert.equal(result.isRich, true);
  });
});

describe('LRU definition cache', () => {
  beforeEach(() => {
    delete storageData.ib_def_cache;
    _resetCache();
  });

  it('caches and retrieves a definition', async () => {
    const data = { title: 'test', content: 'A trial.', source: 'Dictionary API' };
    await cacheDefinition('test', data);
    const cached = await getCachedDefinition('test');
    assert.deepEqual(cached, data);
  });

  it('is case-insensitive', async () => {
    await cacheDefinition('Hello', { title: 'hello' });
    const cached = await getCachedDefinition('hello');
    assert.equal(cached.title, 'hello');
  });

  it('returns null for uncached terms', async () => {
    const cached = await getCachedDefinition('nonexistent');
    assert.equal(cached, null);
  });

  it('fetchDefinition returns cached result on second call', async () => {
    mockFetch([() => ({
      ok: true,
      json: async () => [{ word: 'cached', meanings: [{ partOfSpeech: 'adj', definitions: [{ definition: 'Stored.' }] }] }]
    })]);

    const first = await fetchDefinition('cached');
    assert.ok(!first.fromCache);

    // Second call should hit cache, not API
    const second = await fetchDefinition('cached');
    assert.ok(second.fromCache);
    // fetch should only have been called once (for the first lookup)
    assert.equal(fetchMock.calls.length, 1);
  });

  it('evicts oldest entries beyond 200', async () => {
    const cache = Array.from({ length: 200 }, (_, i) => ({
      term: `word${i}`, data: { title: `word${i}` }, ts: Date.now() - i
    }));
    storageData.ib_def_cache = cache;
    _resetCache(); // force reload from storage

    await cacheDefinition('newword', { title: 'newword' });
    const updated = storageData.ib_def_cache;
    assert.equal(updated.length, 200);
    assert.equal(updated[0].term, 'newword');
    // word199 (oldest) should have been evicted
    assert.ok(!updated.find(e => e.term === 'word199'));
  });

  it('moves accessed entry to front of cache', async () => {
    storageData.ib_def_cache = [
      { term: 'first', data: { title: 'first' }, ts: Date.now() },
      { term: 'second', data: { title: 'second' }, ts: Date.now() - 1000 },
      { term: 'third', data: { title: 'third' }, ts: Date.now() - 2000 }
    ];
    _resetCache(); // force reload from storage

    await getCachedDefinition('third');
    const updated = storageData.ib_def_cache;
    assert.equal(updated[0].term, 'third');
  });
});

describe('fetchAIResponse', () => {
  beforeEach(() => { fetchMock = { calls: [] }; });

  it('throws on invalid endpoint', async () => {
    await assert.rejects(fetchAIResponse('hello', 'not-a-url', 'key'), /Invalid API Endpoint/);
  });

  it('appends key as query param for Gemini', async () => {
    mockFetch([() => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Def.' }] } }] }) })]);
    await fetchAIResponse('test', 'https://api.google.com', 'my-key', 'gemini');
    assert.ok(fetchMock.calls[0].url.includes('key=my-key'));
  });

  it('uses Bearer auth for OpenAI', async () => {
    mockFetch([() => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'Def.' } }] }) })]);
    await fetchAIResponse('test', 'https://api.openai.com', 'sk-123', 'openai');
    assert.equal(fetchMock.calls[0].opts.headers['Authorization'], 'Bearer sk-123');
  });

  it('parses Gemini response', async () => {
    mockFetch([() => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '  Result  ' }] } }] }) })]);
    assert.equal(await fetchAIResponse('test', 'https://api.google.com', 'key', 'gemini'), 'Result');
  });

  it('parses OpenAI response', async () => {
    mockFetch([() => ({ ok: true, json: async () => ({ choices: [{ message: { content: '  OpenAI  ' } }] }) })]);
    assert.equal(await fetchAIResponse('test', 'https://api.openai.com', 'key', 'openai'), 'OpenAI');
  });

  it('parses generic response', async () => {
    mockFetch([() => ({ ok: true, json: async () => ({ text: 'Generic' }) })]);
    assert.equal(await fetchAIResponse('test', 'https://custom.api', 'key', 'generic'), 'Generic');
  });

  it('throws on HTTP error', async () => {
    mockFetch([() => ({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid auth' } }) })]);
    await assert.rejects(fetchAIResponse('test', 'https://api.openai.com', 'bad', 'openai'), { message: 'Invalid auth' });
  });

  it('throws on empty response', async () => {
    mockFetch([() => ({ ok: true, json: async () => ({ candidates: [] }) })]);
    await assert.rejects(fetchAIResponse('test', 'https://api.google.com', 'key', 'gemini'), /Could not parse/);
  });

  it('truncates summarize input', async () => {
    mockFetch([(url, opts) => {
      const text = JSON.parse(opts.body).contents[0].parts[0].text;
      assert.ok(text.length < 9000);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Summary' }] } }] }) };
    }]);
    await fetchAIResponse('x'.repeat(20000), 'https://api.google.com', 'key', 'gemini', 'summarize');
  });
});
