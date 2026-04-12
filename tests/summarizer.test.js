import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateIntelligentSummary } from '../utils/summarizer.js';

describe('generateIntelligentSummary', () => {

  // --- Edge cases ---

  it('returns empty string for null input', () => {
    assert.equal(generateIntelligentSummary(null), '');
  });

  it('returns empty string for undefined input', () => {
    assert.equal(generateIntelligentSummary(undefined), '');
  });

  it('returns empty string for empty string', () => {
    assert.equal(generateIntelligentSummary(''), '');
  });

  it('returns empty string for whitespace-only input', () => {
    assert.equal(generateIntelligentSummary('   \n\t  '), '');
  });

  // --- Short text (fewer sentences than maxSentences) ---

  it('returns all sentences when fewer than maxSentences', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const result = generateIntelligentSummary(text, 4);
    assert.ok(result.includes('First sentence'));
    assert.ok(result.includes('Second sentence'));
    assert.ok(result.includes('Third sentence'));
  });

  it('returns single sentence unchanged', () => {
    const text = 'This is the only sentence here.';
    const result = generateIntelligentSummary(text);
    assert.ok(result.includes('This is the only sentence here'));
  });

  // --- Normal operation ---

  it('returns exactly maxSentences sentences for long text', () => {
    const sentences = Array.from({ length: 20 }, (_, i) =>
      `Sentence number ${i + 1} talks about topic ${i + 1} in detail.`
    ).join(' ');
    const result = generateIntelligentSummary(sentences, 4);
    const resultSentences = result.match(/[^.!?]+[.!?]+/g) || [];
    assert.equal(resultSentences.length, 4);
  });

  it('respects custom maxSentences parameter', () => {
    const sentences = Array.from({ length: 15 }, (_, i) =>
      `Sentence ${i + 1} discusses an important point about research.`
    ).join(' ');
    const result = generateIntelligentSummary(sentences, 2);
    const resultSentences = result.match(/[^.!?]+[.!?]+/g) || [];
    assert.equal(resultSentences.length, 2);
  });

  it('preserves original sentence order in output', () => {
    const sentences = [
      'Alpha introduces the main concept clearly.',
      'Beta provides supporting evidence for the claim.',
      'Gamma digs into the methodology details.',
      'Delta covers additional context and background.',
      'Epsilon presents counter-arguments and debates.',
      'Zeta explores the implications for future research.',
      'Eta discusses real-world applications and uses.',
      'Theta summarizes the key findings and conclusions.'
    ].join(' ');

    const result = generateIntelligentSummary(sentences, 3);
    const words = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
    const found = words.filter(w => result.includes(w));
    // Selected sentences must appear in their original order
    for (let i = 1; i < found.length; i++) {
      assert.ok(result.indexOf(found[i]) > result.indexOf(found[i - 1]),
        `${found[i]} should come after ${found[i - 1]}`);
    }
  });

  // --- Truncation ---

  it('truncates input beyond 20,000 characters', () => {
    const longText = 'A'.repeat(25000) + '. Final sentence here.';
    const result = generateIntelligentSummary(longText);
    // Should not include "Final sentence" since it's beyond 20k
    assert.ok(!result.includes('Final sentence'));
  });

  it('truncates at sentence boundary for long text', () => {
    const chunk = 'The quick brown fox jumps over the lazy dog. ';
    const repeated = chunk.repeat(500); // ~22,500 chars
    const result = generateIntelligentSummary(repeated);
    // Result should end with a period (clean boundary)
    assert.ok(result.trimEnd().endsWith('.'));
  });

  // --- Scoring behavior ---

  it('favors sentences with high-frequency domain words', () => {
    const text = [
      'The weather is nice today.',
      'Machine learning algorithms transform data into predictions.',
      'She went to the store.',
      'Neural networks power modern machine learning systems.',
      'He likes coffee in the morning.',
      'Deep learning advances machine learning capabilities significantly.',
      'The cat sat on the mat.',
      'Artificial intelligence and machine learning drive innovation forward.'
    ].join(' ');

    const result = generateIntelligentSummary(text, 3);
    // "machine learning" appears in sentences 2, 4, 6, 8 — those should dominate
    assert.ok(result.includes('machine learning'), 'Should select sentences about machine learning');
    assert.ok(!result.includes('cat sat on the mat'), 'Should not select generic sentences');
  });

  it('penalizes very short sentences', () => {
    const text = [
      'Yes.',
      'No.',
      'OK.',
      'The comprehensive analysis of quantum computing reveals several important breakthroughs.',
      'Researchers discovered that entanglement provides exponential speedup for certain problems.',
      'This finding has major implications for cryptography and drug discovery applications.',
      'Sure.',
      'Fine.'
    ].join(' ');

    const result = generateIntelligentSummary(text, 3);
    // Short fragments like "Yes." "No." should be penalized
    assert.ok(!result.includes('Yes.'));
    assert.ok(!result.includes('No.'));
    assert.ok(!result.includes('OK.'));
  });

  // --- Stop words ---

  it('ignores stop words in frequency scoring', () => {
    const text = [
      'The the the the the the the the the is very very common.',
      'Quantum entanglement produces quantum correlations between quantum particles.',
      'Another boring sentence with nothing special.',
      'More filler text that does not contain key terms.',
      'Quantum mechanics describes quantum phenomena at quantum scales.',
      'Just another regular sentence here.'
    ].join(' ');

    const result = generateIntelligentSummary(text, 2);
    // "quantum" is the most frequent non-stop word
    assert.ok(result.includes('quantum') || result.includes('Quantum'),
      'Should favor sentences with "quantum" (high frequency non-stop word)');
  });
});
