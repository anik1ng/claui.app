import { describe, it, expect } from 'vitest';
import { basename } from './basename';

describe('basename', () => {
  it('returns the last segment of an absolute path', () => {
    expect(basename('/Users/me/Projects/claui')).toBe('claui');
  });

  it('ignores a single trailing slash', () => {
    expect(basename('/Users/me/Projects/diary/')).toBe('diary');
  });

  it('returns the input unchanged when there is no slash', () => {
    expect(basename('claui')).toBe('claui');
  });

  it('returns the empty string for empty input', () => {
    expect(basename('')).toBe('');
  });
});
