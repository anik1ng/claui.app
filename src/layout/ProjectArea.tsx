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
function ProjectAreaInner({ theme, projectId, projectPath, isActive, status, setSidebarOpen }: Props) {
  const {
    tabs,
    activeUid,
    openClaudeTab,
    openShellTab,
    closeTab,
    setActive,
  } = useTabs(projectPath, projectId);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEverOpened, setDrawerEverOpened] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(220);

  const sessions = useSessionsPolling(projectPath, status?.sessionId);
  const sessionIdsOpen = openSessionIds(tabs);

  // Portal targets — refs are resolved on first render and re-resolved on
  // every render via `useState(lookup)` so that if the slot DOM mounts AFTER
  // ProjectArea (unlikely but possible during cold start), the portal still
  // attaches once the slot appears.
  const wsSlot = usePortalSlot('workspace-tabs-slot');
  const statusSlot = usePortalSlot('status-slot');
  const sessionsSlot = usePortalSlot('sessions-slot');

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

  const pickSession = useCallback(
    (id: string) => {
      const existing = tabs.find((t) => t.kind === 'claude' && t.sessionId === id);
      if (existing) {
        setActive(existing.uid);
      } else {
        openClaudeTab(id);
      }
    },
    [tabs, setActive, openClaudeTab],
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
      {isActive && wsSlot && createPortal(
        <WorkspaceTabBar
          tabs={tabs}
          activeUid={activeUid}
          sessions={sessions}
          onPickTab={setActive}
          onCloseTab={closeTab}
        />,
        wsSlot,
      )}
      {isActive && statusSlot && createPortal(<StatusBar status={status} />, statusSlot)}
      {isActive && sessionsSlot && createPortal(
        <SessionsSection
          sessions={sessions}
          activeSessionId={status?.sessionId ?? null}
          openSessionIds={sessionIdsOpen}
          onPick={pickSession}
          onNew={() => openClaudeTab()}
        />,
        sessionsSlot,
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

/**
 * Resolve a DOM element by id after the parent has committed. Returns
 * `null` on the first render (portal target unknown), then the element
 * after `useEffect` runs — one frame later, imperceptible to the user.
 */
function usePortalSlot(id: string): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.getElementById(id));
  }, [id]);
  return el;
}

export const ProjectArea = memo(ProjectAreaInner);
