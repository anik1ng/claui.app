import { describe, expect, it } from 'vitest';
import { aggregateStatus, type StatusByProject } from './useStatusByProject';
import type { StatusUpdate } from '../ipc/commands';

const upd = (projectId: string, tabId: string, sessionId: string): StatusUpdate => ({
  projectId, tabId,
  status: { sessionId, model: null, contextPct: null, costUsd: null,
    fiveHourPct: null, fiveHourResetsAt: null, sevenDayPct: null, sevenDayResetsAt: null },
});

describe('aggregateStatus', () => {
  it('keys payloads by project then tab', () => {
    let m: StatusByProject = new Map();
    m = aggregateStatus(m, upd('p1', 't1', 's1'));
    m = aggregateStatus(m, upd('p1', 't2', 's2'));
    expect(m.get('p1')?.get('t1')?.sessionId).toBe('s1');
    expect(m.get('p1')?.get('t2')?.sessionId).toBe('s2');
  });

  it('keeps other projects referentially stable on an update', () => {
    let m: StatusByProject = new Map();
    m = aggregateStatus(m, upd('p1', 't1', 's1'));
    const p1Before = m.get('p1');
    m = aggregateStatus(m, upd('p2', 't1', 's9'));
    expect(m.get('p1')).toBe(p1Before); // untouched project keeps identity
  });

  it('dedupes content-identical updates (stable map identity)', () => {
    let m: StatusByProject = new Map();
    m = aggregateStatus(m, upd('p1', 't1', 's1'));
    const same = aggregateStatus(m, upd('p1', 't1', 's1'));
    expect(same).toBe(m); // no change → same reference
  });

  it('replaces the touched project inner map on a real change', () => {
    let m: StatusByProject = new Map();
    m = aggregateStatus(m, upd('p1', 't1', 's1'));
    const innerBefore = m.get('p1');
    m = aggregateStatus(m, upd('p1', 't1', 's2')); // different session → real change
    expect(m.get('p1')).not.toBe(innerBefore);
  });
});
