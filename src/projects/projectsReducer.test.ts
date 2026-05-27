import { describe, it, expect } from 'vitest';
import { projectsReducer, initialState } from './projectsReducer';

describe('projectsReducer / add', () => {
  it('appends and makes the new project active', () => {
    const s = projectsReducer(initialState, {
      type: 'add',
      project: { id: 'a', path: '/a' },
    });
    expect(s.projects).toEqual([{ id: 'a', path: '/a' }]);
    expect(s.activeId).toBe('a');
  });

  it('preserves order and reassigns active', () => {
    const s1 = projectsReducer(initialState, { type: 'add', project: { id: 'a', path: '/a' } });
    const s2 = projectsReducer(s1, { type: 'add', project: { id: 'b', path: '/b' } });
    expect(s2.projects.map((p) => p.id)).toEqual(['a', 'b']);
    expect(s2.activeId).toBe('b');
  });
});

describe('projectsReducer / setActive', () => {
  it('switches active id when the id exists', () => {
    const s1 = projectsReducer(initialState, { type: 'add', project: { id: 'a', path: '/a' } });
    const s2 = projectsReducer(s1, { type: 'add', project: { id: 'b', path: '/b' } });
    const s3 = projectsReducer(s2, { type: 'setActive', id: 'a' });
    expect(s3.activeId).toBe('a');
  });

  it('is a no-op for unknown id', () => {
    const s = projectsReducer(initialState, { type: 'setActive', id: 'ghost' });
    expect(s).toBe(initialState);
  });
});

describe('projectsReducer / closeProject', () => {
  it('removes the entry', () => {
    const start = { projects: [{ id: 'a', path: '/a' }, { id: 'b', path: '/b' }], activeId: 'a' };
    const s = projectsReducer(start, { type: 'closeProject', id: 'b' });
    expect(s.projects.map((p) => p.id)).toEqual(['a']);
    expect(s.activeId).toBe('a');
  });

  it('on the active shifts to left neighbour', () => {
    const start = {
      projects: [{ id: 'a', path: '/a' }, { id: 'b', path: '/b' }, { id: 'c', path: '/c' }],
      activeId: 'b',
    };
    const s = projectsReducer(start, { type: 'closeProject', id: 'b' });
    expect(s.activeId).toBe('a');
  });

  it('on the first active shifts to new first', () => {
    const start = {
      projects: [{ id: 'a', path: '/a' }, { id: 'b', path: '/b' }],
      activeId: 'a',
    };
    const s = projectsReducer(start, { type: 'closeProject', id: 'a' });
    expect(s.activeId).toBe('b');
  });

  it('on the only project sets activeId null', () => {
    const start = { projects: [{ id: 'a', path: '/a' }], activeId: 'a' };
    const s = projectsReducer(start, { type: 'closeProject', id: 'a' });
    expect(s.projects).toEqual([]);
    expect(s.activeId).toBeNull();
  });

  it('is a no-op for unknown id', () => {
    const s = projectsReducer(initialState, { type: 'closeProject', id: 'ghost' });
    expect(s).toBe(initialState);
  });
});

describe('projectsReducer / restore', () => {
  it('replaces the state', () => {
    const replacement = { projects: [{ id: 'z', path: '/z' }], activeId: 'z' };
    const s = projectsReducer(initialState, { type: 'restore', state: replacement });
    expect(s).toBe(replacement);
  });
});
