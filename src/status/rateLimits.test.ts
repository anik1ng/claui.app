import { describe, it, expect } from 'vitest';
import type { StatusPayload } from '../ipc/commands';
import { nextRateLimits, withGlobalLimits, type RateLimits } from './rateLimits';

function makePayload(overrides: Partial<StatusPayload> = {}): StatusPayload {
  return {
    sessionId: null,
    model: null,
    contextPct: null,
    costUsd: null,
    fiveHourPct: null,
    fiveHourResetsAt: null,
    sevenDayPct: null,
    sevenDayResetsAt: null,
    ...overrides,
  };
}

describe('nextRateLimits — skips payloads with no limits', () => {
  it('returns the same prev reference when the payload has no limits', () => {
    const prev: RateLimits = {
      fiveHourPct: 50,
      fiveHourResetsAt: 1000,
      sevenDayPct: 20,
      sevenDayResetsAt: 2000,
    };
    const payload = makePayload({ fiveHourPct: null, sevenDayPct: null });
    const result = nextRateLimits(prev, payload);
    expect(result).toBe(prev);
  });

  it('returns the same prev reference (null) when the payload has no limits', () => {
    const payload = makePayload({ fiveHourPct: null, sevenDayPct: null });
    const result = nextRateLimits(null, payload);
    expect(result).toBeNull();
  });
});

describe('nextRateLimits — updates limits', () => {
  const limitsA: RateLimits = { fiveHourPct: 75, fiveHourResetsAt: 1234, sevenDayPct: 40, sevenDayResetsAt: 5678 };
  const limitsB: RateLimits = { fiveHourPct: 80, fiveHourResetsAt: 3000, sevenDayPct: 60, sevenDayResetsAt: 4000 };

  it('returns new limits when prev is null and payload has limits', () => {
    const result = nextRateLimits(null, makePayload(limitsA));
    expect(result).toEqual(limitsA);
  });

  it('returns the same reference when the payload has identical limits to prev', () => {
    const result = nextRateLimits(limitsA, makePayload(limitsA));
    expect(result).toBe(limitsA);
  });

  it('returns new limits when the payload has changed limits', () => {
    const result = nextRateLimits(limitsA, makePayload(limitsB));
    expect(result).toEqual(limitsB);
    expect(result).not.toBe(limitsA);
  });

  it('keeps the 7d window when a payload carries only the 5h window', () => {
    const payload = makePayload({ fiveHourPct: 90, fiveHourResetsAt: 1111, sevenDayPct: null, sevenDayResetsAt: null });
    const result = nextRateLimits(limitsA, payload);
    expect(result).toEqual({ fiveHourPct: 90, fiveHourResetsAt: 1111, sevenDayPct: 40, sevenDayResetsAt: 5678 });
  });

  it('keeps the 5h window when a payload carries only the 7d window', () => {
    const payload = makePayload({ fiveHourPct: null, fiveHourResetsAt: null, sevenDayPct: 50, sevenDayResetsAt: 9999 });
    const result = nextRateLimits(limitsA, payload);
    expect(result).toEqual({ fiveHourPct: 75, fiveHourResetsAt: 1234, sevenDayPct: 50, sevenDayResetsAt: 9999 });
  });
});

describe('withGlobalLimits', () => {
  const limits: RateLimits = {
    fiveHourPct: 60,
    fiveHourResetsAt: 9000,
    sevenDayPct: 30,
    sevenDayResetsAt: 8000,
  };

  it('returns a limits-only payload when tabStatus is null but limits are known', () => {
    const result = withGlobalLimits(null, limits);
    expect(result).not.toBeNull();
    expect(result!.fiveHourPct).toBe(60);
    expect(result!.sevenDayPct).toBe(30);
    // per-session fields default to null (no active session to report them)
    expect(result!.model).toBeNull();
    expect(result!.sessionId).toBeNull();
    expect(result!.costUsd).toBeNull();
  });

  it('returns null when both tabStatus and limits are null', () => {
    expect(withGlobalLimits(null, null)).toBeNull();
  });

  it('returns the same tabStatus reference when limits is null', () => {
    const tabStatus = makePayload({ model: 'claude-3', costUsd: 1.5 });
    expect(withGlobalLimits(tabStatus, null)).toBe(tabStatus);
  });

  it('merges limit fields and preserves other fields from tabStatus', () => {
    const tabStatus = makePayload({
      sessionId: 'abc',
      model: 'claude-3',
      costUsd: 2.5,
      fiveHourPct: 10,
      fiveHourResetsAt: 100,
      sevenDayPct: 5,
      sevenDayResetsAt: 200,
    });
    const result = withGlobalLimits(tabStatus, limits);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('abc');
    expect(result!.model).toBe('claude-3');
    expect(result!.costUsd).toBe(2.5);
    expect(result!.fiveHourPct).toBe(60);
    expect(result!.fiveHourResetsAt).toBe(9000);
    expect(result!.sevenDayPct).toBe(30);
    expect(result!.sevenDayResetsAt).toBe(8000);
  });
});
