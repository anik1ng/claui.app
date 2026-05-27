import { useEffect, useRef } from 'react';
import type { ProjectEntry } from './types';

interface Props {
  projects: ProjectEntry[];
  setActive: (id: string) => void;
}

const DIGIT_CODE = /^Digit([1-9])$/;

/**
 * Window-level Cmd+Alt+1..9 → switch the active project. `9` is "last
 * project" (Chrome-style). `1..8` index into `projects` 1-based, no-op when
 * fewer projects exist.
 *
 * Reads `e.code` (`Digit1`..`Digit9`) rather than `e.key`: on macOS, holding
 * Option transmutes the key character (`Cmd+Alt+1` reports `e.key === '¡'`,
 * not `'1'`), so a `key`-based check never fires. `code` reports the
 * physical key position regardless of modifiers and layout.
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
      if (!(e.metaKey && e.altKey)) return;
      const match = DIGIT_CODE.exec(e.code);
      if (!match) return;
      e.preventDefault();
      const n = Number(match[1]);
      const { projects: list, setActive: setActiveNow } = stateRef.current;
      if (n === 9) {
        const last = list[list.length - 1];
        if (last) setActiveNow(last.id);
        return;
      }
      const target = list[n - 1];
      if (target) setActiveNow(target.id);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
