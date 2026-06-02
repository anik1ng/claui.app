import { describe, expect, it } from 'vitest';
import {
  worstKind,
  setNotify,
  clearNotify,
  isSuppressed,
  projectAggregate,
  decideOsNotify,
  clearOsNotified,
  type NotifyMap,
  type OsNotified,
} from './notifyStore';

describe('worstKind', () => {
  it('returns null for empty input', () => {
    expect(worstKind([])).toBeNull();
  });
  it('picks error over attention over done', () => {
    expect(worstKind(['done', 'error', 'attention'])).toBe('error');
    expect(worstKind(['done', 'attention'])).toBe('attention');
    expect(worstKind(['done'])).toBe('done');
  });
});

describe('setNotify', () => {
  it('adds a tab kind under its project, replacing only that project map', () => {
    const a: NotifyMap = new Map([['p2', new Map([['t9', 'done']])]]);
    const next = setNotify(a, 'p1', 't1', 'attention');
    expect(next.get('p1')?.get('t1')).toBe('attention');
    // unrelated project keeps identity (memo stability)
    expect(next.get('p2')).toBe(a.get('p2'));
  });
  it('returns the same reference when the kind is unchanged', () => {
    const prev = setNotify(new Map(), 'p1', 't1', 'attention');
    expect(setNotify(prev, 'p1', 't1', 'attention')).toBe(prev);
  });
});

describe('clearNotify', () => {
  it('removes a tab entry and drops the project when empty', () => {
    const a = setNotify(new Map(), 'p1', 't1', 'done');
    const next = clearNotify(a, 'p1', 't1');
    expect(next.get('p1')).toBeUndefined();
  });
  it('returns the same map when nothing matches', () => {
    const a = setNotify(new Map(), 'p1', 't1', 'done');
    expect(clearNotify(a, 'p1', 'nope')).toBe(a);
  });
});

describe('isSuppressed', () => {
  const viewed = { projectId: 'p1', tabId: 't1' };
  it('suppresses the viewed tab when focused', () => {
    expect(isSuppressed(viewed, true, 'p1', 't1')).toBe(true);
  });
  it('does not suppress when window is blurred', () => {
    expect(isSuppressed(viewed, false, 'p1', 't1')).toBe(false);
  });
  it('does not suppress a different tab', () => {
    expect(isSuppressed(viewed, true, 'p1', 't2')).toBe(false);
  });
  it('does not suppress when nothing is viewed', () => {
    expect(isSuppressed(null, true, 'p1', 't1')).toBe(false);
  });
});

describe('projectAggregate', () => {
  it('reduces each project to its worst kind', () => {
    let m: NotifyMap = new Map();
    m = setNotify(m, 'p1', 't1', 'done');
    m = setNotify(m, 'p1', 't2', 'error');
    m = setNotify(m, 'p2', 't1', 'attention');
    const agg = projectAggregate(m);
    expect(agg.get('p1')).toBe('error');
    expect(agg.get('p2')).toBe('attention');
  });
});

describe('decideOsNotify', () => {
  const empty: OsNotified = new Map();

  it('does not notify when the window is focused', () => {
    const r = decideOsNotify(empty, 'p1', 'attention', true);
    expect(r.notify).toBe(false);
    expect(r.next).toBe(empty);
  });

  it('does not notify for done (informational)', () => {
    const r = decideOsNotify(empty, 'p1', 'done', false);
    expect(r.notify).toBe(false);
  });

  it('notifies on first attention while unfocused', () => {
    const r = decideOsNotify(empty, 'p1', 'attention', false);
    expect(r.notify).toBe(true);
    expect(r.next.get('p1')).toBe('attention');
  });

  it('does not re-notify for the same pending state', () => {
    const first = decideOsNotify(empty, 'p1', 'attention', false);
    const second = decideOsNotify(first.next, 'p1', 'attention', false);
    expect(second.notify).toBe(false);
  });

  it('re-notifies on escalation attention -> error', () => {
    const first = decideOsNotify(empty, 'p1', 'attention', false);
    const esc = decideOsNotify(first.next, 'p1', 'error', false);
    expect(esc.notify).toBe(true);
    expect(esc.next.get('p1')).toBe('error');
  });

  it('does not notify on de-escalation error -> attention', () => {
    const first = decideOsNotify(empty, 'p1', 'error', false);
    const de = decideOsNotify(first.next, 'p1', 'attention', false);
    expect(de.notify).toBe(false);
  });

  it('clearOsNotified drops the project so re-entry notifies again', () => {
    const first = decideOsNotify(empty, 'p1', 'attention', false);
    const cleared = clearOsNotified(first.next, 'p1');
    const again = decideOsNotify(cleared, 'p1', 'attention', false);
    expect(again.notify).toBe(true);
  });

  it('clearOsNotified returns the same reference when the project is absent', () => {
    const m: OsNotified = new Map([['p1', 'attention']]);
    expect(clearOsNotified(m, 'absent')).toBe(m);
  });
});
