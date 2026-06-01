import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TerminalView } from '../terminal/TerminalView';
import { StatusBar } from '../status/StatusBar';
import { SessionsSection } from '../sessions/SessionsSection';
import { useSessionsPolling } from '../sessions/useSessionsPolling';
import { WorkspaceTabBar } from '../tabs/WorkspaceTabBar';
import { useTabs } from '../tabs/useTabs';
import { openSessionIds } from '../tabs/openSessionIds';
import { useLayoutKeyboard } from './useLayoutKeyboard';
import { TabPane } from './TabPane';
import { listen } from '@tauri-apps/api/event';
import {
  type Channel,
  openCommandTerminal,
  type StatusPayload,
} from '../ipc/commands';
import type { Theme } from '../theme/themeStore';
import './ProjectArea.css';

/** App-owned portal targets for the active project's chrome. App tracks each
 *  via a callback `ref`, so when a slot's parent (e.g. `Sidebar` toggled by
 *  Ctrl+B) unmounts and remounts, the new DOM node propagates here and
 *  triggers a memo re-render with the fresh `createPortal` target. */
export interface ProjectChromeSlots {
  workspaceTabs: HTMLElement | null;
  status: HTMLElement | null;
  sessions: HTMLElement | null;
}

interface Props {
  theme: Theme;
  projectId: string;
  projectPath: string;
  isActive: boolean;
  /** Status payload for THIS project, sliced by App from useStatusByProject. */
  status: StatusPayload | null;
  /** Window-level sidebar visibility setter (App owns the state; `Ctrl+B`
   *  inside the active ProjectArea toggles the shared sidebar). */
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** DOM nodes the active project's chrome portals into. */
  slots: ProjectChromeSlots;
  /** When true (App: Ctrl held), the workspace tab bar shows its Ctrl+N hints. */
  showTabShortcuts: boolean;
}

/**
 * One project's content. The terminal stack (TabPane × N + drawer) is
 * rendered inside this component's own DOM subtree so xterm instances and
 * the drawer survive project switches via `visibility: hidden` on the
 * inactive container.
 *
 * The chrome pieces — workspace tab bar, status bar, sessions sidebar — are
 * rendered into App-level slots (`#workspace-tabs-slot`, `#status-slot`,
 * `#sessions-slot`) via `createPortal`. The portals only mount when this
 * ProjectArea is active, so the slots host at most one project's chrome at
 * a time. This keeps data ownership per-project (useTabs / sessions polling
 * stay local) while letting the layout treat the active project's chrome
 * as App-level surfaces.
 *
 * `React.memo` wraps the component because App re-renders on every
 * `status:update` from any project; without memo, all N ProjectAreas
 * re-render for every statusline tick of every project. The active project's
 * status reference changes via `statuses.get(projectId)`, so the active one
 * still re-renders correctly.
 */
function ProjectAreaInner({ theme, projectId, projectPath, isActive, status, setSidebarOpen, slots, showTabShortcuts }: Props) {
  const {
    tabs,
    activeUid,
    openClaudeTab,
    openShellTab,
    closeTab,
    setActive,
    setTabResume,
  } = useTabs(projectPath, projectId);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEverOpened, setDrawerEverOpened] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(220);

  const sessions = useSessionsPolling(projectPath, status?.sessionId);
  const sessionIdsOpen = openSessionIds(tabs);

  // Menu subscriptions: only the ACTIVE ProjectArea responds, so window-
  // global Cmd+T / Cmd+Shift+T / Cmd+W are handled in exactly one place.
  const activeUidRef = useRef(activeUid);
  activeUidRef.current = activeUid;
  useEffect(() => {
    if (!isActive) return;
    const unlistenNew = listen('menu:new-claude-tab', () => openClaudeTab());
    const unlistenShell = listen('menu:new-shell-tab', () => openShellTab());
    const unlistenClose = listen('menu:close-tab', () => {
      const uid = activeUidRef.current;
      if (uid) closeTab(uid);
    });
    return () => {
      void unlistenNew.then((fn) => fn());
      void unlistenShell.then((fn) => fn());
      void unlistenClose.then((fn) => fn());
    };
  }, [isActive, openClaudeTab, openShellTab, closeTab]);

  useLayoutKeyboard({
    tabs,
    setActive,
    drawerOpen,
    setDrawerOpen,
    setDrawerEverOpened,
    setSidebarOpen,
    enabled: isActive,
  });

  // macOS-classic picker: click reuses the active claude tab (replaces the
  // session it's hosting), Cmd+click forces a new tab. If the session is
  // already open somewhere, just switch to that tab — never spawn a duplicate
  // claude on the same session file (claude doesn't tolerate concurrent
  // writers to one session). If the active tab is a shell, fall back to a
  // new tab so we never destroy a live shell with a session click.
  const pickSession = useCallback(
    (id: string, intent: 'default' | 'newTab') => {
      const existing = tabs.find((t) => t.kind === 'claude' && t.sessionId === id);
      if (existing) {
        setActive(existing.uid);
        return;
      }
      if (intent === 'newTab') {
        openClaudeTab(id);
        return;
      }
      const activeTab = tabs.find((t) => t.uid === activeUid);
      if (activeTab?.kind === 'claude') {
        setTabResume(activeTab.uid, id);
      } else {
        openClaudeTab(id);
      }
    },
    [tabs, activeUid, setActive, openClaudeTab, setTabResume],
  );

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = drawerHeight;
    const move = (ev: MouseEvent) => {
      setDrawerHeight(Math.min(Math.max(startH + (startY - ev.clientY), 80), 600));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const openShell = useCallback(
    (ch: Channel<ArrayBuffer>, cols: number, rows: number) =>
      openCommandTerminal(projectPath, ch, cols, rows),
    [projectPath],
  );

  return (
    <>
      {isActive && slots.workspaceTabs && createPortal(
        <WorkspaceTabBar
          tabs={tabs}
          activeUid={activeUid}
          sessions={sessions}
          onPickTab={setActive}
          onCloseTab={closeTab}
          showShortcuts={showTabShortcuts}
        />,
        slots.workspaceTabs,
      )}
      {isActive && slots.status && createPortal(<StatusBar status={status} />, slots.status)}
      {isActive && slots.sessions && createPortal(
        <SessionsSection
          sessions={sessions}
          activeSessionId={status?.sessionId ?? null}
          openSessionIds={sessionIdsOpen}
          onPick={pickSession}
          onNew={() => openClaudeTab()}
        />,
        slots.sessions,
      )}
      <div className={`project-area${isActive ? ' is-active' : ''}`}>
        <div className="layout-workspace">
          {tabs.map((tab) => (
            <TabPane
              key={tab.uid}
              tab={tab}
              projectId={projectId}
              projectPath={projectPath}
              theme={theme}
              isActive={tab.uid === activeUid}
              onSpawnFailed={tab.isPrimary ? undefined : () => closeTab(tab.uid)}
            />
          ))}
        </div>
        {drawerOpen && <div className="layout-divider" onMouseDown={startDrag} />}
        {drawerEverOpened && (
          <div
            className="layout-drawer"
            style={{ height: drawerOpen ? drawerHeight : 0 }}
          >
            <div className="layout-drawer-inner">
              <TerminalView theme={theme} open={openShell} autoFocus={drawerOpen} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export const ProjectArea = memo(ProjectAreaInner);
