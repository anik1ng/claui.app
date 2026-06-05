import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { TerminalView } from '../terminal/TerminalView';
import { ProjectChrome } from './ProjectChrome';
import { useSessionsPolling } from '../sessions/useSessionsPolling';
import { useTabs } from '../tabs/useTabs';
import { openSessionIds } from '../tabs/openSessionIds';
import { basename } from '../projects/basename';
import { useLayoutKeyboard } from './useLayoutKeyboard';
import { TabPane } from './TabPane';
import { listen } from '@tauri-apps/api/event';
import {
  type Channel,
  openCommandTerminal,
  type StatusPayload,
} from '../ipc/commands';
import { useNotifyActivateTab, useTabNotify } from '../notify/useTabNotify';
import type { NotifyKind } from '../notify/notifyStore';
import type { Theme } from '../theme/themeStore';
import { withGlobalLimits, type RateLimits } from '../status/rateLimits';
import { useProjectCloseCleanup } from './useProjectCloseCleanup';
import './ProjectArea.css';

/** App-owned portal targets for the active project's chrome. App tracks each
 *  via a callback `ref`, so when a slot's parent (e.g. `Sidebar` toggled by
 *  Ctrl+B) unmounts and remounts, the new DOM node propagates here and
 *  triggers a memo re-render with the fresh `createPortal` target. */
export interface ProjectChromeSlots {
  workspaceTabs: HTMLElement | null;
  status: HTMLElement | null;
  sessions: HTMLElement | null;
  capabilities: HTMLElement | null;
}

interface Props {
  theme: Theme;
  projectId: string;
  projectPath: string;
  isActive: boolean;
  /** This project's per-tab status payloads, sliced by App. */
  statusByTab: ReadonlyMap<string, StatusPayload>;
  /** Window-level sidebar visibility setter (App owns the state; `Ctrl+B`
   *  inside the active ProjectArea toggles the shared sidebar). */
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** DOM nodes the active project's chrome portals into. */
  slots: ProjectChromeSlots;
  /** When true (App: Ctrl held), the workspace tab bar shows its Ctrl+N hints. */
  showTabShortcuts: boolean;
  /** Account-global 5h/7d rate limits, sourced window-wide by App. */
  globalRateLimits: RateLimits | null;
  /** This project's tab signals (tabId → kind), sliced by App. */
  notifyTabs: ReadonlyMap<string, NotifyKind>;
  /** This project's working tabIds (slice of the activity map). */
  workingTabs: ReadonlySet<string>;
  /** Report the active tab as viewed (clears its signal). */
  onViewActiveTab: (projectId: string, tabId: string) => void;
  /** Drop a tab's signal when it closes. */
  onClearTabNotify: (projectId: string, tabId: string) => void;
  /** Drop a tab's working state when it closes (the killed PTY fires no `Stop`). */
  onClearTabActivity: (projectId: string, tabId: string) => void;
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
 * `statusByTab` slice changes identity (via `aggregateStatus`'s per-project
 * inner map) only when one of its tabs ticks, so the active project
 * re-renders while siblings are skipped.
 */
function ProjectAreaInner({ theme, projectId, projectPath, isActive, statusByTab, globalRateLimits, setSidebarOpen, slots, showTabShortcuts, notifyTabs, workingTabs, onViewActiveTab, onClearTabNotify, onClearTabActivity }: Props) {
  const {
    tabs,
    activeUid,
    openClaudeTab,
    openShellTab,
    closeTab,
    setActive: setActiveTab,
    setTabResume,
    newSessionInTab,
  } = useTabs(projectPath, projectId);
  useProjectCloseCleanup(tabs);

  const status = withGlobalLimits((activeUid && statusByTab.get(activeUid)) || null, globalRateLimits);

  const closeTabAndClear = useTabNotify({
    projectId, isActive, activeUid, closeTab, onViewActiveTab, onClearTabNotify, onClearTabActivity,
  });

  useNotifyActivateTab(projectId, setActiveTab);

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
      if (uid) closeTabAndClear(uid);
    });
    return () => {
      void unlistenNew.then((fn) => fn());
      void unlistenShell.then((fn) => fn());
      void unlistenClose.then((fn) => fn());
    };
  }, [isActive, openClaudeTab, openShellTab, closeTabAndClear]);

  useLayoutKeyboard({
    tabs,
    setActive: setActiveTab,
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
        setActiveTab(existing.uid);
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
    [tabs, activeUid, setActiveTab, openClaudeTab, setTabResume],
  );

  // "+ New" in the sidebar. Mirrors `pickSession`'s intent model: a plain
  // click reuses the active claude tab (restarting it on a fresh session),
  // Cmd-click (`newTab`) opens a new tab. If the active tab isn't a claude
  // tab, there's nothing to reuse, so fall back to a new tab.
  const startNewSession = useCallback(
    (newTab: boolean) => {
      const activeTab = tabs.find((t) => t.uid === activeUid);
      if (newTab || activeTab?.kind !== 'claude') {
        openClaudeTab();
        return;
      }
      newSessionInTab(activeTab.uid);
    },
    [tabs, activeUid, openClaudeTab, newSessionInTab],
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
    (ch: Channel<ArrayBuffer>, cols: number, rows: number) => openCommandTerminal(projectPath, ch, cols, rows),
    [projectPath]);

  return (
    <>
      <ProjectChrome
        isActive={isActive}
        slots={slots}
        projectPath={projectPath}
        status={status}
        tabBar={{
          tabs,
          activeUid,
          sessions,
          onPickTab: setActiveTab,
          onCloseTab: closeTabAndClear,
          notify: notifyTabs,
          working: workingTabs,
          showShortcuts: showTabShortcuts,
          projectName: basename(projectPath),
        }}
        sessionsList={{
          sessions,
          activeSessionId: tabs.find((t) => t.uid === activeUid)?.sessionId ?? null,
          openSessionIds: sessionIdsOpen,
          onPick: pickSession,
          onNew: startNewSession,
        }}
      />
      <div className={`project-area${isActive ? ' is-active' : ''}`}>
        <div className="layout-workspace">
          {tabs.map((tab) => (
            <TabPane
              key={tab.uid}
              tab={tab}
              projectId={projectId}
              projectPath={projectPath}
              theme={theme}
              isActive={tab.uid === activeUid} projectIsActive={isActive}
              onSpawnFailed={tab.isPrimary ? undefined : () => closeTabAndClear(tab.uid)}
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
