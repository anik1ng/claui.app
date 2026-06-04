import type { Tab } from './types';

/**
 * The single keyboard-only tab intent: switching to a tab by index. New /
 * close shortcuts (⌘T, ⌘⇧T, ⌘W) are owned by the macOS File menu (see
 * `src-tauri/src/menu.rs`) so they don't need a JS mapping — macOS
 * intercepts them before the webview.
 */
export type KeyboardIntent = { type: 'setActive'; uid: string };

/**
 * Translate a KeyboardEvent into a tab-switching intent.
 * Returns null for events we don't handle.
 *
 * Bindings (Ctrl):
 *  - Ctrl+1..8 → setActive(tabs[N-1].uid); null if fewer tabs.
 *  - Ctrl+9    → setActive(tabs[last].uid); null if only primary.
 *
 * Modifier guard: any extra modifier (Shift, Alt, Cmd) returns null so
 * combos like ⌃⇧1 don't accidentally match.
 */
export function keyboardEventToAction(
  event: KeyboardEvent,
  tabs: Tab[],
): KeyboardIntent | null {
  if (!event.ctrlKey) return null;
  if (event.shiftKey || event.altKey || event.metaKey) return null;
  const key = event.key;

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
