import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// We need to test the internal decodeHTML and XML parsing logic.
// Since decodeHTML isn't exported, we test it through fetchAndProcessTrack.

let fetchMock;
const mockFetch = (handler) => {
  globalThis.fetch = async (url, opts) => {
    fetchMock.calls.push({ url, opts });
    return handler(url, opts);
  };
  fetchMock.calls = [];
};

const { fetchAndProcessTrack } = await import('../utils/youtubeInsight.js');

describe('fetchAndProcessTrack', () => {

  beforeEach(() => {
    fetchMock = { calls: [] };
  });

  it('selects English manual track over auto-generated', async () => {
    const tracks = [
      { languageCode: 'en', kind: 'asr', baseUrl: 'https://yt.com/auto' },
      { languageCode: 'en', baseUrl: 'https://yt.com/manual' },
      { languageCode: 'fr', baseUrl: 'https://yt.com/french' }
    ];

    mockFetch(() => ({
      ok: true,
      text: async () => '<text start="0">Hello world</text>'
    }));

    await fetchAndProcessTrack(tracks);
    assert.equal(fetchMock.calls[0].url, 'https://yt.com/manual');
  });

  it('falls back to auto-generated English if no manual', async () => {
    const tracks = [
      { languageCode: 'en', kind: 'asr', baseUrl: 'https://yt.com/auto' },
      { languageCode: 'fr', baseUrl: 'https://yt.com/french' }
    ];

    mockFetch(() => ({
      ok: true,
      text: async () => '<text>Content</text>'
    }));

    await fetchAndProcessTrack(tracks);
    assert.equal(fetchMock.calls[0].url, 'https://yt.com/auto');
  });

  it('falls back to first available if no English', async () => {
    const tracks = [
      { languageCode: 'es', baseUrl: 'https://yt.com/spanish' },
      { languageCode: 'fr', baseUrl: 'https://yt.com/french' }
    ];

    mockFetch(() => ({
      ok: true,
      text: async () => '<text>Contenido</text>'
    }));

    await fetchAndProcessTrack(tracks);
    assert.equal(fetchMock.calls[0].url, 'https://yt.com/spanish');
  });

  it('throws when no baseUrl', async () => {
    await assert.rejects(
      fetchAndProcessTrack([{ languageCode: 'en' }]),
      { message: 'No readable transcript tracks found.' }
    );
  });

  it('throws on empty transcript', async () => {
    mockFetch(() => ({
      ok: true,
      text: async () => ''
    }));

    await assert.rejects(
      fetchAndProcessTrack([{ languageCode: 'en', baseUrl: 'https://yt.com/en' }]),
      { message: 'Transcript data is empty.' }
    );
  });

  it('strips XML tags and collapses whitespace', async () => {
    mockFetch(() => ({
      ok: true,
      text: async () => '<text start="0" dur="2.5">Hello</text><text start="2.5" dur="3">  world  </text><text start="5.5">today</text>'
    }));

    const result = await fetchAndProcessTrack([{ languageCode: 'en', baseUrl: 'https://yt.com/en' }]);
    assert.equal(result, 'Hello world today');
  });

  it('decodes HTML entities in transcript', async () => {
    mockFetch(() => ({
      ok: true,
      text: async () => '<text>Tom &amp; Jerry &mdash; the classic &quot;cartoon&quot;</text>'
    }));

    const result = await fetchAndProcessTrack([{ languageCode: 'en', baseUrl: 'https://yt.com/en' }]);
    assert.ok(result.includes('Tom & Jerry'));
    assert.ok(result.includes('—'));
    assert.ok(result.includes('"cartoon"'));
  });

  it('decodes numeric HTML entities', async () => {
    mockFetch(() => ({
      ok: true,
      text: async () => '<text>Smart &#8220;quotes&#8221; and &#169; symbol</text>'
    }));

    const result = await fetchAndProcessTrack([{ languageCode: 'en', baseUrl: 'https://yt.com/en' }]);
    assert.ok(result.includes('\u201C')); // left double quote
    assert.ok(result.includes('\u201D')); // right double quote
    assert.ok(result.includes('\u00A9')); // copyright
  });

  it('decodes hex HTML entities', async () => {
    mockFetch(() => ({
      ok: true,
      text: async () => '<text>&#x27;apostrophe&#x27;</text>'
    }));

    const result = await fetchAndProcessTrack([{ languageCode: 'en', baseUrl: 'https://yt.com/en' }]);
    assert.ok(result.includes("'apostrophe'"));
  });

  it('handles nested tags gracefully', async () => {
    mockFetch(() => ({
      ok: true,
      text: async () => '<text start="0"><font color="#CCCCCC">Styled text</font></text>'
    }));

    const result = await fetchAndProcessTrack([{ languageCode: 'en', baseUrl: 'https://yt.com/en' }]);
    // Should still extract text despite extra tags
    assert.ok(result.includes('Styled text'));
  });

  it('throws on empty tracks array', async () => {
    await assert.rejects(
      fetchAndProcessTrack([]),
      /No readable transcript/
    );
  });
});
