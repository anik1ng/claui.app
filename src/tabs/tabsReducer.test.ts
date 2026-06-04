// src/tabs/tabsReducer.test.ts
import { describe, it, expect } from 'vitest';
import { tabsReducer, initialState } from './tabsReducer';
import type { Tab, TabsState } from './types';

const primary = (overrides: Partial<Tab> = {}): Tab => ({
  uid: 'tab-1',
  kind: 'claude',
  isPrimary: true,
  resumeId: null,
  sessionId: null,
  ...overrides,
});
const sub = (uid: string, overrides: Partial<Tab> = {}): Tab => ({
  uid,
  kind: 'claude',
  isPrimary: false,
  resumeId: null,
  sessionId: null,
  ...overrides,
});

const base = (): TabsState => ({
  tabs: [
    { uid: 'a', kind: 'claude', isPrimary: true, resumeId: null, sessionId: null },
    { uid: 'b', kind: 'claude', isPrimary: false, resumeId: null, sessionId: 's-old' },
  ],
  activeUid: 'a',
});

describe('tabsReducer / add', () => {
  it('adds a tab to an empty state and activates it', () => {
    const s = tabsReducer(initialState, { type: 'add', tab: primary() });
    expect(s.tabs).toEqual([primary()]);
    expect(s.activeUid).toBe('tab-1');
  });

  it('appends subsequent tabs after primary and activates the new one', () => {
    let s: TabsState = { tabs: [primary()], activeUid: 'tab-1' };
    s = tabsReducer(s, { type: 'add', tab: sub('tab-2') });
    expect(s.tabs.map((t) => t.uid)).toEqual(['tab-1', 'tab-2']);
    expect(s.activeUid).toBe('tab-2');
  });
});

describe('tabsReducer / setActive', () => {
  it('setActive to an unknown uid is a no-op', () => {
    const s0: TabsState = { tabs: [primary()], activeUid: 'tab-1' };
    const s = tabsReducer(s0, { type: 'setActive', uid: 'nope' });
    expect(s).toEqual(s0);
  });

  it('setActive to a known uid updates activeUid', () => {
    const s0: TabsState = {
      tabs: [primary(), sub('tab-2'), sub('tab-3')],
      activeUid: 'tab-1',
    };
    const s = tabsReducer(s0, { type: 'setActive', uid: 'tab-3' });
    expect(s.activeUid).toBe('tab-3');
  });
});

describe('tabsReducer / closeTab', () => {
  it('closeTab on a non-primary inactive tab removes it; activeUid unchanged', () => {
    const s0: TabsState = {
      tabs: [primary(), sub('tab-2'), sub('tab-3')],
      activeUid: 'tab-1',
    };
    const s = tabsReducer(s0, { type: 'closeTab', uid: 'tab-2' });
    expect(s.tabs.map((t) => t.uid)).toEqual(['tab-1', 'tab-3']);
    expect(s.activeUid).toBe('tab-1');
  });

  it('closeTab on the active tab moves activation to the left neighbour', () => {
    const s0: TabsState = {
      tabs: [primary(), sub('tab-2'), sub('tab-3')],
      activeUid: 'tab-3',
    };
    const s = tabsReducer(s0, { type: 'closeTab', uid: 'tab-3' });
    expect(s.tabs.map((t) => t.uid)).toEqual(['tab-1', 'tab-2']);
    expect(s.activeUid).toBe('tab-2');
  });

  it('closeTab on the active tab right after primary falls back to primary', () => {
    const s0: TabsState = {
      tabs: [primary(), sub('tab-2')],
      activeUid: 'tab-2',
    };
    const s = tabsReducer(s0, { type: 'closeTab', uid: 'tab-2' });
    expect(s.tabs.map((t) => t.uid)).toEqual(['tab-1']);
    expect(s.activeUid).toBe('tab-1');
  });

  it('closeTab on the primary is a no-op', () => {
    const s0: TabsState = { tabs: [primary()], activeUid: 'tab-1' };
    const s = tabsReducer(s0, { type: 'closeTab', uid: 'tab-1' });
    expect(s).toEqual(s0);
  });
});

describe('tabsReducer / updateTabSessionId (primary)', () => {
  it('updateTabSessionId sets sessionId only on the targeted tab', () => {
    const s0: TabsState = {
      tabs: [primary(), sub('tab-2')],
      activeUid: 'tab-1',
    };
    const s = tabsReducer(s0, { type: 'updateTabSessionId', tabId: 'tab-1', sessionId: 'abc' });
    expect(s.tabs[0].sessionId).toBe('abc');
    expect(s.tabs[1].sessionId).toBe(null);
  });

  it('updateTabSessionId is a no-op when no matching tab exists', () => {
    const s0: TabsState = { tabs: [], activeUid: null };
    const s = tabsReducer(s0, { type: 'updateTabSessionId', tabId: 'nope', sessionId: 'abc' });
    expect(s).toEqual(s0);
  });
});

describe('tabsReducer / newSessionInTab', () => {
  it('clears resumeId and sessionId and bumps spawnNonce on the matching tab', () => {
    const s0: TabsState = {
      tabs: [primary({ resumeId: 'old', sessionId: 'old' })],
      activeUid: 'tab-1',
    };
    const s = tabsReducer(s0, { type: 'newSessionInTab', uid: 'tab-1' });
    expect(s.tabs[0].resumeId).toBe(null);
    expect(s.tabs[0].sessionId).toBe(null);
    expect(s.tabs[0].spawnNonce).toBe(1);
  });

  it('bumps spawnNonce even when the tab was already fresh (forces a respawn)', () => {
    const s0: TabsState = { tabs: [primary()], activeUid: 'tab-1' };
    const s1 = tabsReducer(s0, { type: 'newSessionInTab', uid: 'tab-1' });
    const s2 = tabsReducer(s1, { type: 'newSessionInTab', uid: 'tab-1' });
    expect(s1.tabs[0].spawnNonce).toBe(1);
    expect(s2.tabs[0].spawnNonce).toBe(2);
  });

  it('preserves isPrimary when applied to the primary tab', () => {
    const s0: TabsState = { tabs: [primary()], activeUid: 'tab-1' };
    const s = tabsReducer(s0, { type: 'newSessionInTab', uid: 'tab-1' });
    expect(s.tabs[0].isPrimary).toBe(true);
  });

  it('does not touch other tabs', () => {
    const s0: TabsState = {
      tabs: [primary({ resumeId: 'one', sessionId: 'one' }), sub('tab-2')],
      activeUid: 'tab-1',
    };
    const s = tabsReducer(s0, { type: 'newSessionInTab', uid: 'tab-2' });
    expect(s.tabs[0].resumeId).toBe('one');
    expect(s.tabs[0].sessionId).toBe('one');
  });

  it('is a no-op for an unknown uid', () => {
    const s0: TabsState = { tabs: [primary()], activeUid: 'tab-1' };
    const s = tabsReducer(s0, { type: 'newSessionInTab', uid: 'nope' });
    expect(s).toEqual(s0);
  });
});

describe('updateTabSessionId', () => {
  it('updates the matched tab by uid', () => {
    const next = tabsReducer(base(), { type: 'updateTabSessionId', tabId: 'b', sessionId: 's-new' });
    expect(next.tabs.find((t) => t.uid === 'b')?.sessionId).toBe('s-new');
    expect(next.tabs.find((t) => t.uid === 'a')?.sessionId).toBe(null);
  });

  it('is a no-op (same state reference) when the session id is unchanged', () => {
    const s = base();
    const next = tabsReducer(s, { type: 'updateTabSessionId', tabId: 'b', sessionId: 's-old' });
    expect(next).toBe(s); // change-guard: prevents re-render churn
  });

  it('is a no-op for an unknown tab id', () => {
    const s = base();
    expect(tabsReducer(s, { type: 'updateTabSessionId', tabId: 'zzz', sessionId: 'x' })).toBe(s);
  });
});

describe('tabsReducer / setTabResume', () => {
  it('replaces both resumeId and sessionId on the matching tab', () => {
    const s0: TabsState = {
      tabs: [primary({ resumeId: 'old', sessionId: 'old' })],
      activeUid: 'tab-1',
    };
    const s = tabsReducer(s0, { type: 'setTabResume', uid: 'tab-1', resumeId: 'new' });
    expect(s.tabs[0].resumeId).toBe('new');
    expect(s.tabs[0].sessionId).toBe('new');
  });

  it('does not touch other tabs', () => {
    const s0: TabsState = {
      tabs: [
        primary({ resumeId: 'one', sessionId: 'one' }),
        sub('tab-2', { resumeId: 'two', sessionId: 'two' }),
      ],
      activeUid: 'tab-1',
    };
    const s = tabsReducer(s0, { type: 'setTabResume', uid: 'tab-2', resumeId: 'changed' });
    expect(s.tabs[0].resumeId).toBe('one');
    expect(s.tabs[0].sessionId).toBe('one');
    expect(s.tabs[1].resumeId).toBe('changed');
    expect(s.tabs[1].sessionId).toBe('changed');
  });

  it('is a no-op for an unknown uid', () => {
    const s0: TabsState = { tabs: [primary()], activeUid: 'tab-1' };
    const s = tabsReducer(s0, { type: 'setTabResume', uid: 'nope', resumeId: 'x' });
    expect(s).toEqual(s0);
  });

  it('preserves isPrimary when applied to the primary tab', () => {
    // Reusing the pinned primary's slot should NOT demote it — primary stays
    // pinned and unclosable, only its hosted session changes.
    const s0: TabsState = { tabs: [primary()], activeUid: 'tab-1' };
    const s = tabsReducer(s0, { type: 'setTabResume', uid: 'tab-1', resumeId: 'abc' });
    expect(s.tabs[0].isPrimary).toBe(true);
  });
});
