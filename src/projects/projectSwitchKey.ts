import type { ProjectEntry } from './types';

/**
 * Pure mapper: which project id does a Cmd+digit keypress target?
 * Returns null for events we don't handle.
 *
 * Bindings (Cmd):
 *  - Cmd+1..8 → projects[N-1].id; null if fewer projects.
 *  - Cmd+9    → projects[last].id; null if fewer than 2 projects.
 *
 * Requires Cmd alone — any of Ctrl/Alt/Shift returns null. Reads `e.key`
 * for the digit: without Option held, macOS does not transmute the digit
 * character, so the previous `e.code` (Digit1..9) workaround is unneeded.
 */
export function projectSwitchTarget(
  event: KeyboardEvent,
  projects: ProjectEntry[],
): string | null {
  if (!event.metaKey) return null;
  if (event.ctrlKey || event.altKey || event.shiftKey) return null;
  const key = event.key;

  if (key === '9') {
    if (projects.length < 2) return null;
    return projects[projects.length - 1].id;
  }
  if (/^[1-8]$/.test(key)) {
    const idx = parseInt(key, 10) - 1;
    if (idx >= projects.length) return null;
    return projects[idx].id;
  }

  return null;
}
