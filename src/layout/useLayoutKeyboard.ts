// src/layout/useLayoutKeyboard.ts
import { useEffect } from 'react';
import type { Tab } from '../tabs/types';
import { keyboardEventToAction } from '../tabs/keyboard';

interface Params {
  tabs: Tab[];
  setActive: (uid: string) => void;
  drawerOpen: boolean;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDrawerEverOpened: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
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

/**
 * Global keyboard shortcuts for the Layout.
 *
 * Two shortcut families live here:
 *  - Drawer / sidebar toggles (Ctrl+\`, Ctrl+B, Escape) — claui-custom,
 *    not Mac-standard; managed in JS.
 *  - Numeric tab switching (Cmd+1..9) via `src/tabs/keyboard.ts` — pure
 *    mapping, tested independently.
 *
 * What is NOT here: ⌘T / ⌘⇧T / ⌘W. Those are owned by the macOS File
 * menu (see `src-tauri/src/menu.rs`). macOS intercepts menu accelerators
 * before they reach the webview, so the webview only needs to subscribe
 * to the `menu:new-claude-tab` / `menu:new-shell-tab` / `menu:close-tab`
 * events.
 *
 * Why a capture-phase window listener: xterm.js installs its own keydown
 * handler on the terminal element that swallows Ctrl+B (ASCII STX, a
 * useful VT control char). Listening at the window in capture phase lets
 * us intercept before xterm sees the event, and `stopPropagation` keeps
 * xterm out of it entirely.
 */
export function useLayoutKeyboard({
  tabs,
  setActive,
  drawerOpen,
  setDrawerOpen,
  setDrawerEverOpened,
  setSidebarOpen,
}: Params): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (handleChromeKey(e, drawerOpen, setDrawerOpen, setDrawerEverOpened, setSidebarOpen)) return;
      const intent = keyboardEventToAction(e, tabs);
      if (!intent) return;
      e.preventDefault();
      e.stopPropagation();
      setActive(intent.uid);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drawerOpen, tabs, setActive, setDrawerOpen, setDrawerEverOpened, setSidebarOpen]);
}
