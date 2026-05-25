import { describe, it, expect } from 'vitest';
import { keyboardEventToAction } from './keyboard';
import type { Tab } from './types';

const tab = (uid: string, isPrimary = false): Tab => ({
  uid,
  kind: 'claude',
  isPrimary,
  resumeId: null,
  sessionId: null,
});

function ev(init: Partial<KeyboardEvent>): KeyboardEvent {
  return new KeyboardEvent('keydown', { metaKey: true, ...init });
}

describe('keyboardEventToAction / new tab', () => {
  const tabs = [tab('p', true), tab('a'), tab('b'), tab('c')];

  it('Cmd+T → newClaudeTab', () => {
    expect(keyboardEventToAction(ev({ key: 't' }), tabs)).toEqual({ type: 'newClaudeTab' });
  });

  it('Cmd+Shift+T → newShellTab', () => {
    expect(keyboardEventToAction(ev({ key: 'T', shiftKey: true }), tabs)).toEqual({
      type: 'newShellTab',
    });
  });
});

describe('keyboardEventToAction / switching', () => {
  const tabs = [tab('p', true), tab('a'), tab('b'), tab('c')];

  it('Cmd+1 → setActive primary', () => {
    expect(keyboardEventToAction(ev({ key: '1' }), tabs)).toEqual({
      type: 'setActive',
      uid: 'p',
    });
  });

  it('Cmd+3 → setActive third tab', () => {
    expect(keyboardEventToAction(ev({ key: '3' }), tabs)).toEqual({
      type: 'setActive',
      uid: 'b',
    });
  });

  it('Cmd+9 → setActive last tab', () => {
    expect(keyboardEventToAction(ev({ key: '9' }), tabs)).toEqual({
      type: 'setActive',
      uid: 'c',
    });
  });
});

describe('keyboardEventToAction / closeActive and edge cases', () => {
  const tabs = [tab('p', true), tab('a'), tab('b'), tab('c')];

  it('Cmd+W → closeActive', () => {
    expect(keyboardEventToAction(ev({ key: 'w' }), tabs)).toEqual({ type: 'closeActive' });
  });

  it('Cmd+5 with 4 tabs → null', () => {
    expect(keyboardEventToAction(ev({ key: '5' }), tabs)).toBeNull();
  });

  it('Cmd+9 with only primary → null', () => {
    expect(keyboardEventToAction(ev({ key: '9' }), [tab('p', true)])).toBeNull();
  });

  it('non-meta keys → null', () => {
    const evt = new KeyboardEvent('keydown', { key: 't', metaKey: false });
    expect(keyboardEventToAction(evt, tabs)).toBeNull();
  });

  it('unrecognized meta keys → null', () => {
    expect(keyboardEventToAction(ev({ key: 'p' }), tabs)).toBeNull();
  });
});
