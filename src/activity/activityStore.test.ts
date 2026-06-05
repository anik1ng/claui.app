import { describe, it, expect } from 'vitest';
import { aggregateActivity, workingProjects, type ActivityMap } from './activityStore';
import type { ActivityUpdate } from '../ipc/commands';

const u = (projectId: string, tabId: string, state: 'working' | 'idle'): ActivityUpdate => ({
  projectId,
  tabId,
  state,
});

describe('aggregateActivity', () => {
  it('marks a tab working', () => {
    const m = aggregateActivity(new Map(), u('p', 't1', 'working'));
    expect(m.get('p')?.has('t1')).toBe(true);
  });

  it('clears a tab on idle and drops the empty project', () => {
    const working = aggregateActivity(new Map(), u('p', 't1', 'working'));
    const idle = aggregateActivity(working, u('p', 't1', 'idle'));
    expect(idle.has('p')).toBe(false);
  });

  it('keeps the project while other tabs still work', () => {
    let m: ActivityMap = new Map();
    m = aggregateActivity(m, u('p', 't1', 'working'));
    m = aggregateActivity(m, u('p', 't2', 'working'));
    m = aggregateActivity(m, u('p', 't1', 'idle'));
    expect(m.get('p')?.has('t2')).toBe(true);
    expect(m.get('p')?.has('t1')).toBe(false);
  });

  it('returns the SAME reference when nothing changes (working→working)', () => {
    const a = aggregateActivity(new Map(), u('p', 't1', 'working'));
    const b = aggregateActivity(a, u('p', 't1', 'working'));
    expect(b).toBe(a);
  });

  it('returns the SAME reference when clearing a tab that was not working', () => {
    const a: ActivityMap = new Map();
    const b = aggregateActivity(a, u('p', 't1', 'idle'));
    expect(b).toBe(a);
  });

  it('only the touched project gets a new inner reference', () => {
    let m: ActivityMap = new Map();
    m = aggregateActivity(m, u('p1', 't1', 'working'));
    m = aggregateActivity(m, u('p2', 't1', 'working'));
    const p1Inner = m.get('p1');
    const next = aggregateActivity(m, u('p2', 't2', 'working'));
    expect(next.get('p1')).toBe(p1Inner); // sibling identity preserved
  });
});

describe('workingProjects', () => {
  it('is the set of projectIds with at least one working tab', () => {
    let m: ActivityMap = new Map();
    m = aggregateActivity(m, u('p1', 't1', 'working'));
    m = aggregateActivity(m, u('p2', 't1', 'working'));
    expect(workingProjects(m)).toEqual(new Set(['p1', 'p2']));
  });
});
