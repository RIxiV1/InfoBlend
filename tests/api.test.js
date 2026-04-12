import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mock global fetch
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

// Mock AbortSignal.timeout
if (!AbortSignal.timeout) {
  AbortSignal.timeout = (ms) => AbortSignal.abort();
}

const { fetchDefinition, fetchAIResponse } = await import('../utils/api.js');

describe('fetchDefinition', () => {

  beforeEach(() => {
    fetchMock = { calls: [] };
  });

  it('throws on selections longer than 5 words', async () => {
    await assert.rejects(
      fetchDefinition('one two three four five six'),
      { message: 'Selection too long for definition. Try summarizing instead.' }
    );
  });

  it('trims whitespace from input', async () => {
    mockFetch([
      () => ({ ok: true, json: async () => [{ word: 'hello', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A greeting' }] }] }] })
    ]);
    const result = await fetchDefinition('  hello  ');
    assert.equal(result.title, 'hello');
  });

  it('returns rich definition from Dictionary API', async () => {
    mockFetch([
      () => ({
        ok: true,
        json: async () => [{
          word: 'ephemeral',
          phonetic: '/ɪˈfɛm.ər.əl/',
          phonetics: [{ text: '/ɪˈfɛm.ər.əl/' }],
          meanings: [{
            partOfSpeech: 'adjective',
            definitions: [
              { definition: 'Lasting a very short time.', example: 'Fashions are ephemeral.' },
              { definition: 'Short-lived.' }
            ]
          }]
        }]
      })
    ]);

    const result = await fetchDefinition('ephemeral');
    assert.equal(result.isRich, true);
    assert.equal(result.title, 'ephemeral');
    assert.equal(result.phonetic, '/ɪˈfɛm.ər.əl/');
    assert.equal(result.meanings[0].partOfSpeech, 'adjective');
    assert.equal(result.meanings[0].definitions[0].text, 'Lasting a very short time.');
    assert.equal(result.meanings[0].definitions[0].example, 'Fashions are ephemeral.');
    assert.equal(result.source, 'Dictionary API');
  });

  it('limits to 2 meanings and 3 definitions each', async () => {
    mockFetch([
      () => ({
        ok: true,
        json: async () => [{
          word: 'test',
          meanings: [
            { partOfSpeech: 'noun', definitions: [{ definition: 'D1' }, { definition: 'D2' }, { definition: 'D3' }, { definition: 'D4' }] },
            { partOfSpeech: 'verb', definitions: [{ definition: 'V1' }] },
            { partOfSpeech: 'adjective', definitions: [{ definition: 'A1' }] }
          ]
        }]
      })
    ]);

    const result = await fetchDefinition('test');
    assert.equal(result.meanings.length, 2);
    assert.equal(result.meanings[0].definitions.length, 3);
  });

  it('falls through to Datamuse when Dictionary API fails', async () => {
    mockFetch([
      () => ({ ok: false }), // Dictionary API fails
      () => ({
        ok: true,
        json: async () => [{ word: 'cat', defs: ['n\tA small domesticated carnivore'] }]
      })
    ]);

    const result = await fetchDefinition('cat');
    assert.equal(result.source, 'Datamuse');
    assert.equal(result.isRich, true);
  });

  it('Datamuse rejects non-matching words', async () => {
    mockFetch([
      () => ({ ok: false }), // Dictionary fails
      () => ({
        ok: true,
        json: async () => [{ word: 'bat', defs: ['n\tA flying mammal'] }] // wrong word
      }),
      () => ({ ok: false }), // Wiktionary fails
      () => ({ ok: false })  // Wikipedia fails
    ]);

    const result = await fetchDefinition('cat');
    assert.equal(result.isNotFound, true);
  });

  it('falls through to Wiktionary', async () => {
    mockFetch([
      () => ({ ok: false }),
      () => ({ ok: true, json: async () => [] }),
      () => ({ ok: true, json: async () => ({ extract: 'A wiktionary definition.' }) })
    ]);

    const result = await fetchDefinition('word');
    assert.equal(result.source, 'Wiktionary');
    assert.equal(result.content, 'A wiktionary definition.');
  });

  it('falls through to Wikipedia with first sentence only', async () => {
    mockFetch([
      () => ({ ok: false }),
      () => ({ ok: true, json: async () => [] }),
      () => ({ ok: false }),
      () => ({ ok: true, json: async () => ({ extract: 'First sentence. Second sentence. Third.' }) })
    ]);

    const result = await fetchDefinition('concept');
    assert.equal(result.source, 'Wikipedia');
    assert.equal(result.content, 'First sentence.');
  });

  it('returns not-found with Merriam-Webster link when all fail', async () => {
    mockFetch([
      () => ({ ok: false }),
      () => ({ ok: true, json: async () => [] }),
      () => ({ ok: false }),
      () => ({ ok: false })
    ]);

    const result = await fetchDefinition('xyznonword');
    assert.equal(result.isNotFound, true);
    assert.ok(result.url.includes('merriam-webster'));
    assert.ok(result.url.includes('xyznonword'));
  });

  it('handles fetch throwing (network error)', async () => {
    mockFetch([
      () => { throw new Error('NetworkError'); },
      () => { throw new Error('NetworkError'); },
      () => { throw new Error('NetworkError'); },
      () => { throw new Error('NetworkError'); }
    ]);

    const result = await fetchDefinition('test');
    assert.equal(result.isNotFound, true);
  });
});

describe('fetchAIResponse', () => {

  beforeEach(() => {
    fetchMock = { calls: [] };
  });

  it('throws on invalid endpoint', async () => {
    await assert.rejects(
      fetchAIResponse('hello', 'not-a-url', 'key'),
      { message: 'Invalid API Endpoint. Please check your settings.' }
    );
  });

  it('throws on null endpoint', async () => {
    await assert.rejects(
      fetchAIResponse('hello', null, 'key'),
      /Invalid API Endpoint/
    );
  });

  it('appends key as query param for Gemini', async () => {
    mockFetch([
      () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'A definition.' }] } }] })
      })
    ]);

    await fetchAIResponse('test', 'https://api.google.com/v1/models/gemini', 'my-key', 'gemini');
    assert.ok(fetchMock.calls[0].url.includes('key=my-key'));
  });

  it('uses Bearer auth for OpenAI', async () => {
    mockFetch([
      () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'A definition.' } }] })
      })
    ]);

    await fetchAIResponse('test', 'https://api.openai.com/v1/chat', 'sk-123', 'openai');
    assert.equal(fetchMock.calls[0].opts.headers['Authorization'], 'Bearer sk-123');
  });

  it('parses Gemini response format', async () => {
    mockFetch([
      () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '  Result text  ' }] } }] })
      })
    ]);

    const result = await fetchAIResponse('test', 'https://api.google.com', 'key', 'gemini');
    assert.equal(result, 'Result text');
  });

  it('parses OpenAI response format', async () => {
    mockFetch([
      () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '  OpenAI result  ' } }] })
      })
    ]);

    const result = await fetchAIResponse('test', 'https://api.openai.com', 'key', 'openai');
    assert.equal(result, 'OpenAI result');
  });

  it('parses generic response format', async () => {
    mockFetch([
      () => ({
        ok: true,
        json: async () => ({ text: 'Generic result' })
      })
    ]);

    const result = await fetchAIResponse('test', 'https://custom.api.com', 'key', 'generic');
    assert.equal(result, 'Generic result');
  });

  it('throws on HTTP error with message', async () => {
    mockFetch([
      () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid authentication' } })
      })
    ]);

    await assert.rejects(
      fetchAIResponse('test', 'https://api.openai.com', 'bad-key', 'openai'),
      { message: 'Invalid authentication' }
    );
  });

  it('throws on HTTP error without message body', async () => {
    mockFetch([
      () => ({
        ok: false,
        status: 500,
        json: async () => { throw new Error('no JSON'); }
      })
    ]);

    await assert.rejects(
      fetchAIResponse('test', 'https://api.openai.com', 'key', 'openai'),
      { message: 'API Error: 500' }
    );
  });

  it('throws on empty AI response', async () => {
    mockFetch([
      () => ({
        ok: true,
        json: async () => ({ candidates: [] })
      })
    ]);

    await assert.rejects(
      fetchAIResponse('test', 'https://api.google.com', 'key', 'gemini'),
      { message: 'Could not parse AI response.' }
    );
  });

  it('truncates summarize input to 8000 chars', async () => {
    mockFetch([
      (url, opts) => {
        const body = JSON.parse(opts.body);
        const text = body.contents[0].parts[0].text;
        // Prompt should contain truncated text
        assert.ok(text.length < 9000, `Prompt was ${text.length} chars, expected < 9000`);
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Summary' }] } }] }) };
      }
    ]);

    await fetchAIResponse('x'.repeat(20000), 'https://api.google.com', 'key', 'gemini', 'summarize');
  });
});
