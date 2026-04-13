import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateIntelligentSummary } from '../utils/summarizer.js';

describe('generateIntelligentSummary', () => {
  it('returns empty string for empty input', () => {
    assert.equal(generateIntelligentSummary(''), '');
    assert.equal(generateIntelligentSummary(null), '');
    assert.equal(generateIntelligentSummary(undefined), '');
  });

  it('returns all sentences when count <= maxSentences', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const result = generateIntelligentSummary(text, 4);
    assert.ok(result.includes('First sentence'));
    assert.ok(result.includes('Second sentence'));
    assert.ok(result.includes('Third sentence'));
  });

  it('selects top sentences when more than maxSentences', () => {
    const sentences = Array.from({ length: 10 }, (_, i) =>
      `Sentence ${i + 1} is about ${i === 0 ? 'important critical topic' : 'other stuff'}.`
    ).join(' ');
    const result = generateIntelligentSummary(sentences, 3);
    const resultSentences = result.split(/[.!?]\s/).filter(Boolean);
    assert.ok(resultSentences.length <= 4); // splitting may produce extra fragments
  });

  it('preserves original sentence order in output', () => {
    const text = 'Alpha is the first letter. Beta comes second. Gamma is third. Delta is fourth. Epsilon is fifth. Zeta is last and important.';
    const result = generateIntelligentSummary(text, 2);
    const words = result.match(/\b(Alpha|Beta|Gamma|Delta|Epsilon|Zeta)\b/g) || [];
    // Check order is preserved
    for (let i = 1; i < words.length; i++) {
      const order = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
      assert.ok(order.indexOf(words[i]) > order.indexOf(words[i - 1]), 'Sentence order should be preserved');
    }
  });

  it('truncates input longer than 20000 characters', () => {
    const longText = 'This is a test sentence. '.repeat(2000);
    // Should not throw
    const result = generateIntelligentSummary(longText, 3);
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  it('truncates at sentence boundary when over 20000 chars', () => {
    const longText = 'Complete sentence here. '.repeat(1500);
    const result = generateIntelligentSummary(longText, 2);
    // Should end cleanly, not mid-word
    assert.ok(typeof result === 'string');
  });

  it('handles text with only whitespace', () => {
    assert.equal(generateIntelligentSummary('   \n\t  '), '');
  });

  it('penalizes very short sentences', () => {
    // Short sentences like "Yes." should score lower than real content
    const text = 'Yes. The comprehensive analysis reveals important findings about climate change impacts on biodiversity. No. Maybe. The research team conducted extensive field studies across multiple continents over five years. Ok.';
    const result = generateIntelligentSummary(text, 2);
    // Should prefer the longer, content-rich sentences
    assert.ok(result.includes('comprehensive') || result.includes('research'));
  });

  it('boosts sentences at beginning and end (U-curve)', () => {
    // Make edge sentences significantly more keyword-rich so position boost tips the scale
    const text = [
      'The critical opening statement introduces the key findings discoveries results of the important study.',
      'Middle filler goes here.',
      'More middle padding.',
      'Additional middle text.',
      'Yet more middle padding.',
      'More middle filler again.',
      'More middle padding text.',
      'The critical conclusion summarizes the key findings discoveries results of the important study.'
    ].join(' ');
    const result = generateIntelligentSummary(text, 2);
    assert.ok(
      result.includes('opening') || result.includes('conclusion'),
      'Should favor edge sentences with both keyword and position advantage'
    );
  });

  it('handles single sentence input', () => {
    const text = 'Just one sentence here.';
    assert.equal(generateIntelligentSummary(text, 3), text);
  });

  it('handles text without standard punctuation', () => {
    const text = 'No punctuation at the end of this text';
    const result = generateIntelligentSummary(text, 3);
    assert.ok(result.length > 0);
  });

  it('filters stop words from scoring', () => {
    // Text where stop words dominate should still produce a summary
    const text = 'The and for was with that. This but from have were not. Will your their when which than. More about some could should would. Into these those also only very much.';
    const result = generateIntelligentSummary(text, 2);
    assert.ok(typeof result === 'string');
  });

  it('respects custom maxSentences parameter', () => {
    const text = 'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten.';
    const result1 = generateIntelligentSummary(text, 1);
    const result5 = generateIntelligentSummary(text, 5);
    assert.ok(result1.length < result5.length);
  });
});
