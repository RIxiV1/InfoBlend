import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We test the decodeHTML and XML parsing logic directly since the full module
// depends on chrome APIs and fetch. We import the module's internal logic
// by recreating the pure functions.

// Recreate decodeHTML (same as in youtubeInsight.js)
const decodeHTML = (text) => {
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&apos;': "'", '&nbsp;': ' ', '&hellip;': '...', '&mdash;': '\u2014',
    '&ndash;': '\u2013', '&laquo;': '\u00AB', '&raquo;': '\u00BB'
  };
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&[a-zA-Z]+;/g, (match) => entities[match] || match);
};

// Recreate transcript XML extraction logic
function extractTranscriptFromXML(xml) {
  const segments = [];
  const tagRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let tagMatch;
  while ((tagMatch = tagRegex.exec(xml)) !== null) {
    const decoded = decodeHTML(tagMatch[1]).trim();
    if (decoded) segments.push(decoded);
  }
  const content = segments.length > 0
    ? segments.join(' ')
    : decodeHTML(xml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return content;
}

describe('decodeHTML', () => {
  it('decodes named entities', () => {
    assert.equal(decodeHTML('&amp;'), '&');
    assert.equal(decodeHTML('&lt;'), '<');
    assert.equal(decodeHTML('&gt;'), '>');
    assert.equal(decodeHTML('&quot;'), '"');
    assert.equal(decodeHTML('&apos;'), "'");
    assert.equal(decodeHTML('&nbsp;'), ' ');
    assert.equal(decodeHTML('&hellip;'), '...');
    assert.equal(decodeHTML('&mdash;'), '\u2014');
    assert.equal(decodeHTML('&ndash;'), '\u2013');
  });

  it('decodes numeric entities', () => {
    assert.equal(decodeHTML('&#65;'), 'A');
    assert.equal(decodeHTML('&#97;'), 'a');
    assert.equal(decodeHTML('&#8212;'), '\u2014');
  });

  it('decodes hex entities', () => {
    assert.equal(decodeHTML('&#x41;'), 'A');
    assert.equal(decodeHTML('&#x61;'), 'a');
    assert.equal(decodeHTML('&#x2014;'), '\u2014');
  });

  it('preserves unknown entities', () => {
    assert.equal(decodeHTML('&unknown;'), '&unknown;');
  });

  it('handles mixed content', () => {
    assert.equal(decodeHTML('Hello &amp; &#x77;orld'), 'Hello & world');
  });

  it('handles empty string', () => {
    assert.equal(decodeHTML(''), '');
  });

  it('handles text without entities', () => {
    assert.equal(decodeHTML('plain text'), 'plain text');
  });
});

describe('transcript XML extraction', () => {
  it('extracts text from standard YouTube XML format', () => {
    const xml = `<text start="0" dur="5.2">Hello world</text><text start="5.2" dur="3.1">How are you</text>`;
    assert.equal(extractTranscriptFromXML(xml), 'Hello world How are you');
  });

  it('decodes HTML entities in transcript text', () => {
    const xml = `<text start="0" dur="5">Hello &amp; welcome</text>`;
    assert.equal(extractTranscriptFromXML(xml), 'Hello & welcome');
  });

  it('handles multiline text within tags', () => {
    const xml = `<text start="0" dur="5">Line one\nLine two</text>`;
    const result = extractTranscriptFromXML(xml);
    assert.ok(result.includes('Line one'));
    assert.ok(result.includes('Line two'));
  });

  it('skips empty text nodes', () => {
    const xml = `<text start="0" dur="1">Hello</text><text start="1" dur="1">  </text><text start="2" dur="1">World</text>`;
    assert.equal(extractTranscriptFromXML(xml), 'Hello World');
  });

  it('falls back to tag stripping when no <text> tags found', () => {
    const xml = `<transcript>Some plain content here</transcript>`;
    const result = extractTranscriptFromXML(xml);
    assert.ok(result.includes('Some plain content here'));
  });

  it('handles attributes in text tags', () => {
    const xml = `<text start="0.5" dur="2.3" data-index="0">Content here</text>`;
    assert.equal(extractTranscriptFromXML(xml), 'Content here');
  });

  it('handles numeric entities in transcript', () => {
    const xml = `<text start="0" dur="5">Price is &#36;10</text>`;
    assert.equal(extractTranscriptFromXML(xml), 'Price is $10');
  });
});
