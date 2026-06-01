import { describe, it, expect } from 'vitest';
import { projectSwitchTarget } from './projectSwitchKey';
import type { ProjectEntry } from './types';

const proj = (id: string): ProjectEntry => ({ id, path: `/p/${id}` });
const list = [proj('a'), proj('b'), proj('c')];

function ev(init: Partial<KeyboardEvent>): KeyboardEvent {
  return new KeyboardEvent('keydown', { metaKey: true, ...init });
}

describe('projectSwitchTarget', () => {
  it('Cmd+1 → first project', () => {
    expect(projectSwitchTarget(ev({ key: '1' }), list)).toBe('a');
  });

  it('Cmd+2 → second project', () => {
    expect(projectSwitchTarget(ev({ key: '2' }), list)).toBe('b');
  });

  it('Cmd+9 → last project', () => {
    expect(projectSwitchTarget(ev({ key: '9' }), list)).toBe('c');
  });

  it('Cmd+5 with 3 projects → null', () => {
    expect(projectSwitchTarget(ev({ key: '5' }), list)).toBeNull();
  });

  it('Cmd+9 with one project → null', () => {
    expect(projectSwitchTarget(ev({ key: '9' }), [proj('a')])).toBeNull();
  });

  it('non-meta → null', () => {
    const e = new KeyboardEvent('keydown', { key: '1', metaKey: false });
    expect(projectSwitchTarget(e, list)).toBeNull();
  });

  it('Cmd+Ctrl+1 → null (extra modifier)', () => {
    expect(projectSwitchTarget(ev({ key: '1', ctrlKey: true }), list)).toBeNull();
  });

  it('Cmd+Alt+1 → null (old binding no longer matches)', () => {
    expect(projectSwitchTarget(ev({ key: '1', altKey: true }), list)).toBeNull();
  });
});
