// src/tabs/openSessionIds.test.ts
import { describe, it, expect } from 'vitest';
import { openSessionIds } from './openSessionIds';
import type { Tab } from './types';

const tab = (overrides: Partial<Tab>): Tab => ({
  uid: 't',
  kind: 'claude',
  isPrimary: false,
  resumeId: null,
  sessionId: null,
  ...overrides,
});

describe('openSessionIds', () => {
  it('returns an empty Set for an empty list', () => {
    expect(openSessionIds([])).toEqual(new Set());
  });

  it('ignores shell tabs', () => {
    expect(openSessionIds([tab({ kind: 'shell', sessionId: 'should-be-ignored' })])).toEqual(new Set());
  });

  it('ignores claude tabs without a sessionId', () => {
    expect(openSessionIds([tab({ kind: 'claude', sessionId: null })])).toEqual(new Set());
  });

  it('collects sessionIds from all claude tabs that have one', () => {
    expect(
      openSessionIds([
        tab({ uid: 'a', kind: 'claude', sessionId: 's1' }),
        tab({ uid: 'b', kind: 'shell', sessionId: 's-shell' }),
        tab({ uid: 'c', kind: 'claude', sessionId: null }),
        tab({ uid: 'd', kind: 'claude', sessionId: 's2' }),
      ])
    ).toEqual(new Set(['s1', 's2']));
  });
});
