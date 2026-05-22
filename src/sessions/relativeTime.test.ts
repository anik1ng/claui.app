import { describe, it, expect } from 'vitest';
import { relativeTime } from './relativeTime';

describe('relativeTime', () => {
  const now = 1_000_000_000_000;

  it('shows "now" under a minute', () => {
    expect(relativeTime(now - 30_000, now)).toBe('now');
  });
  it('shows minutes', () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago');
  });
  it('shows hours', () => {
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('2h ago');
  });
  it('shows days', () => {
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3d ago');
  });
});
