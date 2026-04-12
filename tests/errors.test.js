import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translateError } from '../utils/errors.js';

describe('translateError', () => {

  // --- Every ERROR_MAP entry must trigger ---

  it('translates context invalidated', () => {
    assert.equal(
      translateError('Context invalidated'),
      'Extension updated. Please refresh this page.'
    );
  });

  it('translates connection failure', () => {
    assert.equal(
      translateError('Could not establish connection. Receiving end does not exist.'),
      'Background service sleeping. Please refresh.'
    );
  });

  it('translates fetch failure', () => {
    assert.equal(
      translateError('Failed to fetch'),
      'Network error. Check your internet connection.'
    );
  });

  it('translates 401 error', () => {
    assert.equal(
      translateError(new Error('API Error: 401')),
      'Invalid API key. Check your settings.'
    );
  });

  it('translates 429 rate limit', () => {
    assert.equal(
      translateError('API Error: 429 Too Many Requests'),
      'Rate limit exceeded. Try again in a few minutes.'
    );
  });

  it('translates invalid endpoint', () => {
    assert.equal(
      translateError('Invalid API Endpoint. Please check your settings.'),
      'Invalid API endpoint. Check your settings.'
    );
  });

  it('translates selection too long', () => {
    assert.equal(
      translateError('Selection too long for definition.'),
      'Selection too long for definition. Try summarizing instead.'
    );
  });

  it('translates YouTube format changed', () => {
    assert.equal(
      translateError('YouTube format changed. Please contact developers.'),
      'YouTube layout changed. Update required.'
    );
  });

  it('translates no transcript available', () => {
    assert.equal(
      translateError('This video has no transcript available.'),
      'This video has no transcript available.'
    );
  });

  it('translates empty transcript', () => {
    assert.equal(
      translateError('Transcript data is empty.'),
      'The transcript is empty.'
    );
  });

  // --- Edge cases ---

  it('handles Error objects', () => {
    const err = new Error('Could not establish connection');
    const result = translateError(err);
    assert.equal(result, 'Background service sleeping. Please refresh.');
  });

  it('handles null', () => {
    assert.equal(translateError(null), 'An unexpected error occurred.');
  });

  it('handles undefined', () => {
    assert.equal(translateError(undefined), 'An unexpected error occurred.');
  });

  it('handles empty string', () => {
    assert.equal(translateError(''), 'An unexpected error occurred.');
  });

  it('passes through unknown errors verbatim', () => {
    assert.equal(translateError('Something totally unexpected'), 'Something totally unexpected');
  });

  it('is case-insensitive', () => {
    assert.equal(
      translateError('CONTEXT INVALIDATED'),
      'Extension updated. Please refresh this page.'
    );
  });

  it('matches partial strings', () => {
    assert.equal(
      translateError('Error: Failed to fetch resource at https://example.com'),
      'Network error. Check your internet connection.'
    );
  });

  it('handles Error with no message', () => {
    const err = new Error();
    assert.equal(translateError(err), 'An unexpected error occurred.');
  });
});
