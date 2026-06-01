import { describe, it, expect } from 'vitest';
import { projectSwitchTarget } from './projectSwitchKey';
import type { ProjectEntry } from './types';

const proj = (id: string): ProjectEntry => ({ id, path: `/p/${id}` });
const list = [proj('a'), proj('b'), proj('c')];

function ev(init: Partial<KeyboardEvent>): KeyboardEvent {
  return new KeyboardEvent('keydown', { ctrlKey: true, ...init });
}

describe('projectSwitchTarget', () => {
  it('Ctrl+1 → first project', () => {
    expect(projectSwitchTarget(ev({ key: '1' }), list)).toBe('a');
  });

  it('Ctrl+2 → second project', () => {
    expect(projectSwitchTarget(ev({ key: '2' }), list)).toBe('b');
  });

  it('Ctrl+9 → last project', () => {
    expect(projectSwitchTarget(ev({ key: '9' }), list)).toBe('c');
  });

  it('Ctrl+5 with 3 projects → null', () => {
    expect(projectSwitchTarget(ev({ key: '5' }), list)).toBeNull();
  });

  it('Ctrl+9 with one project → null', () => {
    expect(projectSwitchTarget(ev({ key: '9' }), [proj('a')])).toBeNull();
  });

  it('non-ctrl → null', () => {
    const e = new KeyboardEvent('keydown', { key: '1', ctrlKey: false });
    expect(projectSwitchTarget(e, list)).toBeNull();
  });

  it('Ctrl+Cmd+1 → null (extra modifier)', () => {
    expect(projectSwitchTarget(ev({ key: '1', metaKey: true }), list)).toBeNull();
  });

  it('Ctrl+Alt+1 → null (extra modifier)', () => {
    expect(projectSwitchTarget(ev({ key: '1', altKey: true }), list)).toBeNull();
  });
});
