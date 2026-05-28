import { describe, it, expect } from 'vitest';
import { isShiftEnterTrigger } from './keyHandler';

// Build a minimal KeyboardEvent stand-in. `as KeyboardEvent` rather than
// `new KeyboardEvent(...)` because jsdom's KeyboardEvent ignores some init
// fields (notably `isComposing`), and we want exact control over them.
function mk(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    type: 'keydown',
    key: 'Enter',
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...overrides,
  } as KeyboardEvent;
}

describe('isShiftEnterTrigger', () => {
  it('matches a plain Shift+Enter keydown', () => {
    expect(isShiftEnterTrigger(mk())).toBe(true);
  });

  it('rejects Enter without Shift', () => {
    expect(isShiftEnterTrigger(mk({ shiftKey: false }))).toBe(false);
  });

  it('rejects the keyup phase of Shift+Enter', () => {
    // xterm.js also dispatches custom handlers on keyup; we must not double-emit.
    expect(isShiftEnterTrigger(mk({ type: 'keyup' }))).toBe(false);
  });

  it('rejects the keypress phase of Shift+Enter', () => {
    expect(isShiftEnterTrigger(mk({ type: 'keypress' }))).toBe(false);
  });

  it('rejects Ctrl+Shift+Enter', () => {
    expect(isShiftEnterTrigger(mk({ ctrlKey: true }))).toBe(false);
  });

  it('rejects Cmd+Shift+Enter', () => {
    expect(isShiftEnterTrigger(mk({ metaKey: true }))).toBe(false);
  });

  it('rejects Alt+Shift+Enter — Alt-prefixed Enter has its own xterm path', () => {
    expect(isShiftEnterTrigger(mk({ altKey: true }))).toBe(false);
  });

  it('rejects Shift+Enter while an IME composition is active', () => {
    expect(isShiftEnterTrigger(mk({ isComposing: true }))).toBe(false);
  });

  it('rejects Shift+other-key', () => {
    expect(isShiftEnterTrigger(mk({ key: 'A' }))).toBe(false);
  });
});
