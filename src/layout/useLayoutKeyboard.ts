// src/layout/useLayoutKeyboard.ts
import { useEffect } from 'react';
import type { Tab } from '../tabs/types';
import { keyboardEventToAction } from '../tabs/keyboard';

interface Params {
  tabs: Tab[];
  activeUid: string | null;
  openClaudeTab: (resumeId?: string) => void;
  openShellTab: () => void;
  closeTab: (uid: string) => void;
  setActive: (uid: string) => void;
  drawerOpen: boolean;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDrawerEverOpened: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

interface TabActions {
  openClaudeTab: (resumeId?: string) => void;
  openShellTab: () => void;
  closeTab: (uid: string) => void;
  setActive: (uid: string) => void;
}

/** Drawer / sidebar shortcuts that predate tabs. Returns true if handled. */
function handleChromeKey(
  e: KeyboardEvent,
  drawerOpen: boolean,
  setDrawerOpen: Params['setDrawerOpen'],
  setDrawerEverOpened: Params['setDrawerEverOpened'],
  setSidebarOpen: Params['setSidebarOpen'],
): boolean {
  if (e.ctrlKey && e.key === '`') {
    e.preventDefault();
    e.stopPropagation();
    setDrawerEverOpened(true);
    setDrawerOpen((v) => !v);
    return true;
  }
  if (e.ctrlKey && e.key === 'b') {
    e.preventDefault();
    e.stopPropagation();
    setSidebarOpen((v) => !v);
    return true;
  }
  if (e.key === 'Escape' && drawerOpen) {
    setDrawerOpen(false);
    return true;
  }
  return false;
}

/** Tab shortcuts via the pure keyboard mapping. Returns true if handled. */
function handleTabKey(
  e: KeyboardEvent,
  tabs: Tab[],
  activeUid: string | null,
  actions: TabActions,
): boolean {
  const intent = keyboardEventToAction(e, tabs);
  if (!intent) return false;
  // closeActive on the primary (or no active tab) is a no-op — don't even
  // consume the event so the user's native Cmd+W still feels predictable
  // when there's nothing to close.
  if (intent.type === 'closeActive') {
    if (!activeUid) return false;
    const active = tabs.find((t) => t.uid === activeUid);
    if (!active || active.isPrimary) return false;
    e.preventDefault();
    e.stopPropagation();
    actions.closeTab(activeUid);
    return true;
  }
  e.preventDefault();
  e.stopPropagation();
  if (intent.type === 'newClaudeTab') actions.openClaudeTab();
  else if (intent.type === 'newShellTab') actions.openShellTab();
  else if (intent.type === 'setActive') actions.setActive(intent.uid);
  return true;
}

/**
 * Global keyboard shortcuts for the Layout: drawer / sidebar toggles plus
 * tab shortcuts.
 *
 * Why a capture-phase window listener: xterm.js installs its own keydown
 * handler on the terminal element that swallows Ctrl+B (ASCII STX, a useful
 * VT control char) and reports a few modifier combos directly to the PTY.
 * Listening at the window in capture phase lets us intercept before xterm
 * sees the event, and `stopPropagation` keeps xterm out of it entirely.
 *
 * Tab bindings come from `src/tabs/keyboard.ts` — the single source of
 * truth for key→intent mapping, exercised by its own unit tests.
 */
export function useLayoutKeyboard({
  tabs,
  activeUid,
  openClaudeTab,
  openShellTab,
  closeTab,
  setActive,
  drawerOpen,
  setDrawerOpen,
  setDrawerEverOpened,
  setSidebarOpen,
}: Params): void {
  useEffect(() => {
    const actions: TabActions = { openClaudeTab, openShellTab, closeTab, setActive };
    const onKey = (e: KeyboardEvent) => {
      if (handleChromeKey(e, drawerOpen, setDrawerOpen, setDrawerEverOpened, setSidebarOpen)) return;
      handleTabKey(e, tabs, activeUid, actions);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [
    drawerOpen,
    tabs,
    activeUid,
    openClaudeTab,
    openShellTab,
    closeTab,
    setActive,
    setDrawerOpen,
    setDrawerEverOpened,
    setSidebarOpen,
  ]);
}
