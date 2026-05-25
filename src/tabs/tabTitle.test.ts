// src/tabs/tabTitle.test.ts
import { describe, it, expect } from 'vitest';
import { tabTitle } from './tabTitle';
import type { Tab } from './types';
import type { SessionInfo } from '../ipc/commands';

const sessions: SessionInfo[] = [
  { id: 's1', title: 'Refactor pty.rs sink', lastActivity: 0 },
  { id: 's2', title: 'Theme tokens', lastActivity: 0 },
];

const claude = (overrides: Partial<Tab> = {}): Tab => ({
  uid: 'x',
  kind: 'claude',
  isPrimary: false,
  resumeId: null,
  sessionId: null,
  ...overrides,
});
const shell = (overrides: Partial<Tab> = {}): Tab => ({
  uid: 'x',
  kind: 'shell',
  isPrimary: false,
  resumeId: null,
  sessionId: null,
  ...overrides,
});

describe('tabTitle', () => {
  it('returns "zsh" for shell tabs regardless of sessions', () => {
    expect(tabTitle(shell(), sessions)).toBe('zsh');
  });

  it('returns "claude" for claude tabs without a sessionId', () => {
    expect(tabTitle(claude({ sessionId: null }), sessions)).toBe('claude');
  });

  it('returns "claude" when the sessionId is not in the sessions list', () => {
    expect(tabTitle(claude({ sessionId: 'unknown' }), sessions)).toBe('claude');
  });

  it('returns the session title when sessionId matches a sessions entry', () => {
    expect(tabTitle(claude({ sessionId: 's2' }), sessions)).toBe('Theme tokens');
  });
});
