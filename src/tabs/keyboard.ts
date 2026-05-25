import type { Tab } from './types';

export type KeyboardIntent =
  | { type: 'newClaudeTab' }
  | { type: 'newShellTab' }
  | { type: 'setActive'; uid: string }
  | { type: 'closeActive' };

/**
 * Translate a KeyboardEvent into a tab-related intent.
 * Returns null for events we don't handle.
 *
 * Bindings (Cmd on macOS):
 *  - Cmd+T            → newClaudeTab
 *  - Cmd+Shift+T      → newShellTab
 *  - Cmd+1..8         → setActive(tabs[N-1].uid); null if fewer tabs
 *  - Cmd+9            → setActive(tabs[last].uid); null if only primary
 *  - Cmd+W            → closeActive
 */
export function keyboardEventToAction(
  event: KeyboardEvent,
  tabs: Tab[],
): KeyboardIntent | null {
  if (!event.metaKey) return null;
  const key = event.key.toLowerCase();

  if (key === 't' && event.shiftKey) return { type: 'newShellTab' };
  if (key === 't') return { type: 'newClaudeTab' };
  if (key === 'w') return { type: 'closeActive' };

  if (key === '9') {
    if (tabs.length <= 1) return null;
    return { type: 'setActive', uid: tabs[tabs.length - 1].uid };
  }
  if (/^[1-8]$/.test(key)) {
    const idx = parseInt(key, 10) - 1;
    if (idx >= tabs.length) return null;
    return { type: 'setActive', uid: tabs[idx].uid };
  }

  return null;
}
