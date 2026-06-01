import { useEffect, useRef } from 'react';
import type { ProjectEntry } from './types';
import { projectSwitchTarget } from './projectSwitchKey';

interface Props {
  projects: ProjectEntry[];
  setActive: (id: string) => void;
}

/**
 * Window-level Cmd+1..9 → switch the active project. `9` is "last project"
 * (Chrome-style); `1..8` index into `projects` 1-based, no-op when fewer
 * projects exist. Mapping logic lives in `projectSwitchKey.ts` (tested).
 *
 * Project state is read through a ref so the keydown effect doesn't
 * re-install on every project-list mutation. Re-installs would open a small
 * window where the OLD listener is removed but the new one hasn't yet been
 * added — a stray keypress during the gap would be lost.
 */
export function useProjectSwitchKeyboard({ projects, setActive }: Props): void {
  const stateRef = useRef({ projects, setActive });
  stateRef.current = { projects, setActive };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { projects: list, setActive: setActiveNow } = stateRef.current;
      const id = projectSwitchTarget(e, list);
      if (id === null) return;
      e.preventDefault();
      e.stopPropagation();
      setActiveNow(id);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
