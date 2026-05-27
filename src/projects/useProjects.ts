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
  /** True while window.json is being read on cold start — App should not render UI yet. */
  isHydrating: boolean;
}

const PERSIST_DEBOUNCE_MS = 250;

/**
 * Debounces window-state persistence so a burst of project actions (e.g.
 * closing several tabs quickly) only writes once, 250 ms after the last change.
 * Skips the write while hydration is still in-flight — isHydrating guards
 * against immediately overwriting the file we just read.
 */
function usePersistDebounce(state: ProjectsState, isHydrating: boolean): void {
  const persistTimer = useRef<number | null>(null);
  useEffect(() => {
    if (isHydrating) return;
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void saveWindowState({ version: 1, projects: state.projects, activeId: state.activeId });
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    };
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
  usePersistDebounce(state, isHydrating);

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

  const addProject = useCallback(
    (path: string): string => {
      const existing = state.projects.find((p) => p.path === path);
      if (existing) {
        dispatch({ type: 'setActive', id: existing.id });
        return existing.id;
      }
      const id = crypto.randomUUID();
      dispatch({ type: 'add', project: { id, path } });
      return id;
    },
    [state.projects],
  );

  const closeProject = useCallback((id: string) => {
    dispatch({ type: 'closeProject', id });
  }, []);

  const setActive = useCallback((id: string) => {
    dispatch({ type: 'setActive', id });
  }, []);

  return {
    projects: state.projects,
    activeId: state.activeId,
    addProject,
    closeProject,
    setActive,
    isHydrating,
  };
}
