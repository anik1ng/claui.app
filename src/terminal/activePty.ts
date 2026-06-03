import { useEffect } from 'react';

/**
 * The PTY id of the window's active terminal. Drag-drop is a window-global
 * Tauri event with no DOM target, so the window-level drop handler
 * (`useFileDrop`) reads this to decide which PTY receives the dropped paths.
 */
let activeId: number | null = null;

export function setActivePty(id: number | null): void {
  activeId = id;
}

export function getActivePty(): number | null {
  return activeId;
}

/**
 * Register `ptyId` as the active drop target while `isActiveTerminal` is true.
 * Activation-driven, not focus-driven, so a project switch — which never
 * refocuses the new terminal — still routes drops to the visible one. The
 * cleanup clears the registry on deactivation, PTY change, or unmount, but
 * only if this PTY still owns it (so a switch's set isn't clobbered by the
 * previous terminal's cleanup — React runs all cleanups before all setups).
 */
export function useActivePty(isActiveTerminal: boolean, ptyId: number | null): void {
  useEffect(() => {
    if (!isActiveTerminal || ptyId == null) return;
    setActivePty(ptyId);
    return () => {
      if (getActivePty() === ptyId) setActivePty(null);
    };
  }, [isActiveTerminal, ptyId]);
}
