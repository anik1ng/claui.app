// src/tabs/useTabs.ts
import { useCallback, useEffect, useReducer } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { StatusUpdate } from '../ipc/commands';
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
// Filters by projectId so sibling projects' status events are ignored —
// each ProjectArea mounts its own useTabs instance and must not cross-update.
function useStatusListener(dispatch: Dispatch, projectId: string): void {
  useEffect(() => {
    const unlisten = listen<StatusUpdate>('status:update', (e) => {
      if (e.payload.projectId !== projectId) return;
      const sid = e.payload.status.sessionId;
      if (sid) dispatch({ type: 'updatePrimarySessionId', sessionId: sid });
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [dispatch, projectId]);
}

/**
 * Owns the tab list for a single open project, keyed by `projectId`.
 *
 * State invariants:
 *  - The first tab is always the primary claude (isPrimary: true) — auto-created
 *    when `projectPath` is set and the array is empty.
 *  - `activeUid` is non-null whenever `tabs.length > 0`.
 *
 * Side effects:
 *  - Subscribes to `status:update` and propagates each event's sessionId to
 *    the primary tab via `useStatusListener`, filtered by `projectId` so
 *    concurrent ProjectAreas don't bleed status into each other.
 *
 * The hook does NOT directly call PTY IPC. `TerminalView` retains its
 * spawn-on-mount / close-on-unmount pattern; adding a Tab causes a new
 * TerminalView to mount, which spawns the PTY. Each ProjectArea gets its own
 * useTabs instance with a fixed projectPath, so tabs are reset by unmounting
 * the entire ProjectArea when the project changes.
 */
export function useTabs(projectPath: string, projectId: string): UseTabs {
  const [state, dispatch] = useReducer(tabsReducer, initialState);
  useAutoCreatePrimary(dispatch, state.tabs, projectPath);
  useStatusListener(dispatch, projectId);

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
