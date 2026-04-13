import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translateError } from '../utils/errors.js';

describe('translateError', () => {
  it('translates "Context invalidated" errors', () => {
    const result = translateError(new Error('Extension context invalidated'));
    assert.equal(result, 'Extension updated. Please refresh this page.');
  });

  it('translates connection errors', () => {
    const result = translateError(new Error('Could not establish connection'));
    assert.equal(result, 'Background service sleeping. Please refresh.');
  });

  it('translates fetch failures', () => {
    const result = translateError(new Error('Failed to fetch'));
    assert.equal(result, 'Network error. Check your internet connection.');
  });

  it('translates 401 API errors', () => {
    const result = translateError(new Error('API Error: 401'));
    assert.equal(result, 'Invalid API key. Check your settings.');
  });

  it('translates 429 rate limit errors', () => {
    const result = translateError(new Error('API Error: 429'));
    assert.equal(result, 'Rate limit exceeded. Try again in a few minutes.');
  });

  it('translates invalid endpoint errors', () => {
    const result = translateError(new Error('Invalid API Endpoint configured'));
    assert.equal(result, 'Invalid API endpoint. Check your settings.');
  });

  it('translates selection too long errors', () => {
    const result = translateError(new Error('Selection too long for lookup'));
    assert.equal(result, 'Selection too long for definition. Try summarizing instead.');
  });

  it('returns original message for unknown errors', () => {
    const result = translateError(new Error('Something completely new'));
    assert.equal(result, 'Something completely new');
  });

  it('handles string input', () => {
    const result = translateError('Failed to fetch data');
    assert.equal(result, 'Network error. Check your internet connection.');
  });

  it('handles null/undefined input', () => {
    assert.equal(translateError(null), 'An unexpected error occurred.');
    assert.equal(translateError(undefined), 'An unexpected error occurred.');
  });

  it('handles error objects without message', () => {
    assert.equal(translateError({}), 'An unexpected error occurred.');
  });

  it('is case-insensitive', () => {
    const result = translateError(new Error('FAILED TO FETCH'));
    assert.equal(result, 'Network error. Check your internet connection.');
  });
});
