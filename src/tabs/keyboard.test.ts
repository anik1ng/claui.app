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
  return new KeyboardEvent('keydown', { ctrlKey: true, ...init });
}

describe('keyboardEventToAction / switching', () => {
  const tabs = [tab('p', true), tab('a'), tab('b'), tab('c')];

  it('Ctrl+1 → setActive primary', () => {
    expect(keyboardEventToAction(ev({ key: '1' }), tabs)).toEqual({
      type: 'setActive',
      uid: 'p',
    });
  });

  it('Ctrl+3 → setActive third tab', () => {
    expect(keyboardEventToAction(ev({ key: '3' }), tabs)).toEqual({
      type: 'setActive',
      uid: 'b',
    });
  });

  it('Ctrl+9 → setActive last tab', () => {
    expect(keyboardEventToAction(ev({ key: '9' }), tabs)).toEqual({
      type: 'setActive',
      uid: 'c',
    });
  });
});

describe('keyboardEventToAction / edge cases', () => {
  const tabs = [tab('p', true), tab('a'), tab('b'), tab('c')];

  it('Ctrl+5 with 4 tabs → null', () => {
    expect(keyboardEventToAction(ev({ key: '5' }), tabs)).toBeNull();
  });

  it('Ctrl+9 with only primary → null', () => {
    expect(keyboardEventToAction(ev({ key: '9' }), [tab('p', true)])).toBeNull();
  });

  it('non-ctrl keys → null', () => {
    const evt = new KeyboardEvent('keydown', { key: '1', ctrlKey: false });
    expect(keyboardEventToAction(evt, tabs)).toBeNull();
  });

  it('Cmd+1 (meta, not ctrl) → null', () => {
    const evt = new KeyboardEvent('keydown', { key: '1', metaKey: true });
    expect(keyboardEventToAction(evt, tabs)).toBeNull();
  });

  it('Ctrl+Shift+1 → null (no accidental match on shifted digits)', () => {
    expect(keyboardEventToAction(ev({ key: '1', shiftKey: true }), tabs)).toBeNull();
  });

  it('Ctrl with a non-digit → null', () => {
    expect(keyboardEventToAction(ev({ key: 'p' }), tabs)).toBeNull();
  });
});
