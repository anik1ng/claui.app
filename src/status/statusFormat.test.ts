import { describe, it, expect } from 'vitest';
import { formatPct, formatUsd, limitLevel } from './statusFormat';

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
