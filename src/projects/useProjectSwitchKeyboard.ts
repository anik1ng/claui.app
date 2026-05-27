import { useEffect } from 'react';
import type { ProjectEntry } from './types';

interface Props {
  projects: ProjectEntry[];
  setActive: (id: string) => void;
}

/**
 * Window-level Cmd+Alt+1..9 → switch the active project. `9` is "last
 * project" (Chrome-style). `1..8` index into `projects` 1-based, no-op when
 * fewer projects exist.
 *
 * Lives at App level (not inside a ProjectArea) because every ProjectArea
 * would otherwise install its own handler — they'd all switch on every
 * press, and we'd be re-registering listeners on every project-list change.
 */
export function useProjectSwitchKeyboard({ projects, setActive }: Props): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey && e.altKey)) return;
      if (e.key < '1' || e.key > '9') return;
      e.preventDefault();
      const n = Number(e.key);
      if (n === 9) {
        const last = projects[projects.length - 1];
        if (last) setActive(last.id);
        return;
      }
      const target = projects[n - 1];
      if (target) setActive(target.id);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [projects, setActive]);
}
