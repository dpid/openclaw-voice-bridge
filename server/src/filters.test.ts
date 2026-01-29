/**
 * Moltbot Voice Bridge - Filter Tests
 */

import { describe, it, expect } from 'vitest';
import { isHallucination, isTooShort, shouldFilter } from './filters.js';

describe('isHallucination', () => {
  it('detects "thank you" variations', () => {
    expect(isHallucination('thank you')).toBe(true);
    expect(isHallucination('Thanks')).toBe(true);
    expect(isHallucination('Thanks for watching')).toBe(true);
    expect(isHallucination('THANK YOU!')).toBe(true);
  });

  it('detects subscribe variations', () => {
    expect(isHallucination('subscribe')).toBe(true);
    expect(isHallucination('Please subscribe')).toBe(true);
    expect(isHallucination('like and subscribe')).toBe(true);
  });

  it('detects farewell variations', () => {
    expect(isHallucination('see you next time')).toBe(true);
    expect(isHallucination('See you later')).toBe(true);
    expect(isHallucination('bye')).toBe(true);
    expect(isHallucination('byeee')).toBe(true);
  });

  it('detects filler sounds', () => {
    expect(isHallucination('uh')).toBe(true);
    expect(isHallucination('uhh')).toBe(true);
    expect(isHallucination('um')).toBe(true);
    expect(isHallucination('hmm')).toBe(true);
  });

  it('does not filter legitimate speech', () => {
    expect(isHallucination('What is the weather today?')).toBe(false);
    expect(isHallucination('Thank you for your help with that')).toBe(false);
    expect(isHallucination('Can you subscribe me to that newsletter?')).toBe(false);
    expect(isHallucination('Hello, how are you?')).toBe(false);
  });
});

describe('isTooShort', () => {
  it('filters single characters', () => {
    expect(isTooShort('a')).toBe(true);
    expect(isTooShort('.')).toBe(true);
    expect(isTooShort('?')).toBe(true);
  });

  it('allows two or more characters', () => {
    expect(isTooShort('hi')).toBe(false);
    expect(isTooShort('ok')).toBe(false);
    expect(isTooShort('yes')).toBe(false);
  });

  it('handles whitespace correctly', () => {
    expect(isTooShort('  ')).toBe(true);
    expect(isTooShort(' a ')).toBe(true);
    expect(isTooShort(' hi ')).toBe(false);
  });
});

describe('shouldFilter', () => {
  it('filters empty transcripts', () => {
    const result = shouldFilter('');
    expect(result.filtered).toBe(true);
    expect(result.reason).toBe('empty');
  });

  it('filters noise (too short)', () => {
    const result = shouldFilter('a');
    expect(result.filtered).toBe(true);
    expect(result.reason).toBe('noise');
  });

  it('filters hallucinations', () => {
    const result = shouldFilter('thank you');
    expect(result.filtered).toBe(true);
    expect(result.reason).toBe('hallucination');
  });

  it('passes valid speech', () => {
    const result = shouldFilter('What is the weather?');
    expect(result.filtered).toBe(false);
    expect(result.reason).toBeUndefined();
  });
});
