// src/tabs/useTabs.ts
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { StatusPayload } from '../ipc/commands';
import { initialState, tabsReducer } from './tabsReducer';
import type { TabsAction } from './tabsReducer';
import type { Tab, TabsState } from './types';

type Dispatch = React.Dispatch<TabsAction>;

let counter = 0;
function nextUid(): string {
  counter += 1;
  return `tab-${counter}`;
}

export interface UseTabs {
  tabs: Tab[];
  activeUid: string | null;
  openClaudeTab: (resumeId?: string) => void;
  openShellTab: () => void;
  closeTab: (uid: string) => void;
  setActive: (uid: string) => void;
}

// Auto-creates the primary claude tab when the list is empty.
function useAutoCreatePrimary(
  dispatch: Dispatch,
  tabs: TabsState['tabs'],
  projectPath: string,
): void {
  useEffect(() => {
    if (tabs.length === 0 && projectPath) {
      dispatch({
        type: 'add',
        tab: {
          uid: nextUid(),
          kind: 'claude',
          isPrimary: true,
          resumeId: null,
          sessionId: null,
        },
      });
    }
  }, [dispatch, tabs.length, projectPath]);
}

// Subscribes to status:update and forwards sessionId to the primary tab.
function useStatusListener(dispatch: Dispatch): void {
  useEffect(() => {
    const unlisten = listen<StatusPayload>('status:update', (e) => {
      const sid = e.payload.sessionId;
      if (sid) dispatch({ type: 'updatePrimarySessionId', sessionId: sid });
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [dispatch]);
}

/**
 * Owns the tab list for the open project.
 *
 * State invariants:
 *  - The first tab is always the primary claude (isPrimary: true) — auto-created
 *    when `projectPath` is set and the array is empty.
 *  - `activeUid` is non-null whenever `tabs.length > 0`.
 *
 * Side effects:
 *  - Subscribes to `status:update` and propagates each event's sessionId to
 *    the primary tab via `useStatusListener`.
 *  - Watches `projectPath`: on change, dispatches `resetForProject` so all
 *    `<TerminalView>` instances unmount and ptyClose themselves.
 *
 * The hook does NOT directly call PTY IPC. `TerminalView` retains its
 * spawn-on-mount / close-on-unmount pattern; adding a Tab causes a new
 * TerminalView to mount, which spawns the PTY.
 */
export function useTabs(projectPath: string): UseTabs {
  const [state, dispatch] = useReducer(tabsReducer, initialState);
  const prevProjectRef = useRef<string>(projectPath);

  // Reset on project change.
  if (prevProjectRef.current !== projectPath) {
    prevProjectRef.current = projectPath;
    // INVARIANT: dispatching during render is safe — React schedules it,
    // applies before the next commit. Same pattern used today in Layout.tsx
    // for sessionTarget reset.
    dispatch({ type: 'resetForProject' });
  }

  useAutoCreatePrimary(dispatch, state.tabs, projectPath);
  useStatusListener(dispatch);

  const openClaudeTab = useCallback((resumeId?: string) => {
    dispatch({
      type: 'add',
      tab: {
        uid: nextUid(),
        kind: 'claude',
        isPrimary: false,
        resumeId: resumeId ?? null,
        sessionId: resumeId ?? null,
      },
    });
  }, []);

  const openShellTab = useCallback(() => {
    dispatch({
      type: 'add',
      tab: { uid: nextUid(), kind: 'shell', isPrimary: false, resumeId: null, sessionId: null },
    });
  }, []);

  const closeTab = useCallback((uid: string) => {
    dispatch({ type: 'closeTab', uid });
  }, []);

  const setActive = useCallback((uid: string) => {
    dispatch({ type: 'setActive', uid });
  }, []);

  return { tabs: state.tabs, activeUid: state.activeUid, openClaudeTab, openShellTab, closeTab, setActive };
}
