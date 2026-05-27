import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../ipc/commands', () => ({
  getWindowState: vi.fn(() => Promise.resolve(null)),
  saveWindowState: vi.fn(() => Promise.resolve(undefined)),
}));

import { useProjects } from './useProjects';
import { getWindowState } from '../ipc/commands';

describe('useProjects / addProject', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getWindowState).mockReset().mockResolvedValue(null);
  });

  it('appends a fresh path and makes it active', async () => {
    const { result } = renderHook(() => useProjects());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    let firstId = '';
    act(() => {
      firstId = result.current.addProject('/a');
    });
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.projects[0].path).toBe('/a');
    expect(result.current.activeId).toBe(firstId);
  });

  it('on a duplicate path returns the existing id and re-activates it', async () => {
    const { result } = renderHook(() => useProjects());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    let aId = '';
    act(() => {
      aId = result.current.addProject('/a');
    });
    act(() => {
      result.current.addProject('/b');
    });
    expect(result.current.projects).toHaveLength(2);

    let reusedId = '';
    act(() => {
      reusedId = result.current.addProject('/a');
    });
    expect(reusedId).toBe(aId);
    expect(result.current.projects).toHaveLength(2);
    expect(result.current.activeId).toBe(aId);
  });
});

describe('useProjects / hydration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('restores projects from getWindowState when it returns data', async () => {
    vi.mocked(getWindowState).mockResolvedValueOnce({
      version: 1,
      projects: [{ id: 'x', path: '/x' }],
      activeId: 'x',
    });
    const { result } = renderHook(() => useProjects());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.projects).toEqual([{ id: 'x', path: '/x' }]);
    expect(result.current.activeId).toBe('x');
  });

  it('flips isHydrating to false when getWindowState returns null', async () => {
    vi.mocked(getWindowState).mockResolvedValueOnce(null);
    const { result } = renderHook(() => useProjects());
    expect(result.current.isHydrating).toBe(true);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.isHydrating).toBe(false);
  });
});
