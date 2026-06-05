import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { initialState, projectsReducer } from './projectsReducer';
import type { ProjectEntry, ProjectsState } from './types';
import { getWindowState, saveWindowState } from '../ipc/commands';

export interface UseProjects {
  projects: ProjectEntry[];
  activeId: string | null;
  /**
   * Returns the project's id — existing id when the path was already open
   * (with the entry brought to active), or a newly generated uuid otherwise.
   */
  addProject: (path: string) => string;
  closeProject: (id: string) => void;
  setActive: (id: string) => void;
  /** Move a project to a new index (drag-reorder). `toIndex` is the final
   *  array index after the dragged entry is removed. */
  reorderProject: (id: string, toIndex: number) => void;
  /** True while window.json is being read on cold start — App should not render UI yet. */
  isHydrating: boolean;
}

/**
 * Persist window state on every change. We don't debounce: the file is
 * ~hundreds of bytes, the save is async (background), and a debounced
 * scheme loses the last 250 ms on `Cmd+Q` because the unmount cleanup
 * clears the pending timer without flushing. State changes here are
 * user-paced (clicks / keypresses), not high-frequency, so writing each
 * one immediately is the simpler correct shape.
 */
function usePersist(state: ProjectsState, isHydrating: boolean): void {
  useEffect(() => {
    if (isHydrating) return;
    void saveWindowState({ version: 1, projects: state.projects, activeId: state.activeId });
  }, [state, isHydrating]);
}

/**
 * Owns the list of open projects for the window. Reads `window.json` once at
 * mount; debounced-writes it back on every state change. Cross-project status
 * routing happens in `useTabs(path, id)`, which keys the per-project payload
 * by the id minted here.
 */
export function useProjects(): UseProjects {
  const [state, dispatch] = useReducer(projectsReducer, initialState);
  const [isHydrating, setIsHydrating] = useState(true);
  usePersist(state, isHydrating);

  useEffect(() => {
    void (async () => {
      const ws = await getWindowState();
      if (ws && ws.projects.length > 0) {
        dispatch({
          type: 'restore',
          state: { projects: ws.projects, activeId: ws.activeId ?? ws.projects[0].id },
        });
      }
      setIsHydrating(false);
    })();
  }, []);

  // `projects` is read through a ref inside `addProject` so the callback
  // identity stays stable for the lifetime of the App — consumers like
  // `App.tsx`'s menu listener can use `addProject` in a `useEffect` with
  // empty deps without re-registering on every project-list mutation.
  const projectsRef = useRef(state.projects);
  projectsRef.current = state.projects;

  const addProject = useCallback((path: string): string => {
    // Case-insensitive path comparison: macOS APFS is case-insensitive by
    // default, so /Users/Alice/foo and /Users/alice/foo are the same
    // directory; the dedup guard would otherwise create two ProjectAreas
    // for one folder, each spawning a primary claude into the same cwd.
    const norm = path.toLowerCase();
    const existing = projectsRef.current.find((p) => p.path.toLowerCase() === norm);
    if (existing) {
      dispatch({ type: 'setActive', id: existing.id });
      return existing.id;
    }
    const id = crypto.randomUUID();
    dispatch({ type: 'add', project: { id, path } });
    return id;
  }, []);

  const closeProject = useCallback((id: string) => {
    dispatch({ type: 'closeProject', id });
  }, []);

  const setActive = useCallback((id: string) => {
    dispatch({ type: 'setActive', id });
  }, []);

  const reorderProject = useCallback((id: string, toIndex: number) => {
    dispatch({ type: 'reorder', id, toIndex });
  }, []);

  return {
    projects: state.projects,
    activeId: state.activeId,
    addProject,
    closeProject,
    setActive,
    reorderProject,
    isHydrating,
  };
}
