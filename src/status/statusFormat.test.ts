import { describe, it, expect } from 'vitest';
import { formatPct, formatTimeUntil, formatUsd, limitLevel } from './statusFormat';

describe('limitLevel', () => {
  it('bands a percentage green / yellow / red', () => {
    expect(limitLevel(0)).toBe('ok');
    expect(limitLevel(49)).toBe('ok');
    expect(limitLevel(50)).toBe('warn');
    expect(limitLevel(79)).toBe('warn');
    expect(limitLevel(80)).toBe('high');
    expect(limitLevel(100)).toBe('high');
  });
});

describe('formatUsd', () => {
  it('formats an amount with two decimals and a $', () => {
    expect(formatUsd(0.4)).toBe('$0.40');
    expect(formatUsd(12.345)).toBe('$12.35');
  });
});

describe('formatPct', () => {
  it('rounds to a whole percentage', () => {
    expect(formatPct(12.4)).toBe('12%');
    expect(formatPct(12.6)).toBe('13%');
  });
});

describe('formatTimeUntil', () => {
  const now = 1_700_000_000;
  it('returns "now" once the reset time is in the past or at it', () => {
    expect(formatTimeUntil(now - 10, now)).toBe('now');
    expect(formatTimeUntil(now, now)).toBe('now');
  });
  it('returns "<1m" for sub-minute remainders', () => {
    expect(formatTimeUntil(now + 1, now)).toBe('<1m');
    expect(formatTimeUntil(now + 59, now)).toBe('<1m');
  });
  it('returns minutes-only below an hour', () => {
    expect(formatTimeUntil(now + 60, now)).toBe('1m');
    expect(formatTimeUntil(now + 23 * 60, now)).toBe('23m');
    expect(formatTimeUntil(now + 59 * 60 + 59, now)).toBe('59m');
  });
  it('returns "Xh Ym" at and above one hour', () => {
    expect(formatTimeUntil(now + 60 * 60, now)).toBe('1h 0m');
    expect(formatTimeUntil(now + 60 * 60 + 23 * 60, now)).toBe('1h 23m');
    expect(formatTimeUntil(now + 18 * 3600 + 14 * 60, now)).toBe('18h 14m');
  });
});
