// src/tabs/useTabs.ts
import { useCallback, useEffect, useReducer, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { StatusPayload } from '../ipc/commands';
import { initialState, tabsReducer } from './tabsReducer';
import type { TabsAction } from './tabsReducer';
import type { Tab, TabsState } from './types';

type Dispatch = React.Dispatch<TabsAction>;

/**
 * Stable, collision-free uids without module-level state. `crypto.randomUUID`
 * is available in WKWebView and all modern browsers. The `tab-` prefix is
 * a debugging convenience — readable in React keys + devtools.
 */
function nextUid(): string {
  return `tab-${crypto.randomUUID()}`;
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
  // `useState` (not `useRef`) for the prev-project tracker because
  // setState during render is tracked by React across re-invocations of
  // the render function (e.g. when concurrent rendering aborts and
  // re-runs a component). A `useRef.current` mutation during render
  // would persist even if the render is dropped, causing the second
  // run to skip the reset — old project's tabs leak into the new
  // projectPath. This is the same pattern the old Layout.tsx used for
  // its sessionTarget reset (the documented React "adjust state on
  // prop change" recipe).
  const [prevProject, setPrevProject] = useState(projectPath);
  if (prevProject !== projectPath) {
    setPrevProject(projectPath);
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
