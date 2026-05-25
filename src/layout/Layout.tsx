import { useCallback, useEffect, useState } from 'react';
import { TerminalView } from '../terminal/TerminalView';
import { StatusBar } from '../status/StatusBar';
import { Sidebar } from '../sessions/Sidebar';
import { useSessionsPolling } from '../sessions/useSessionsPolling';
import { WorkspaceTabBar } from '../tabs/WorkspaceTabBar';
import { useTabs } from '../tabs/useTabs';
import { openSessionIds } from '../tabs/openSessionIds';
import { useLayoutKeyboard } from './useLayoutKeyboard';
import { TabPane } from './TabPane';
import { TitleBar } from './TitleBar';
import { listen } from '@tauri-apps/api/event';
import {
  type Channel,
  openCommandTerminal,
  type StatusPayload,
} from '../ipc/commands';
import type { Theme } from '../theme/themeStore';
import './Layout.css';

interface Props {
  theme: Theme;
  projectPath: string;
  onRequestProjectSwitch: () => void;
}

export function Layout({ theme, projectPath, onRequestProjectSwitch }: Props) {
  const {
    tabs,
    activeUid,
    openClaudeTab,
    openShellTab,
    closeTab,
    setActive,
  } = useTabs(projectPath);

  const sessions = useSessionsPolling(projectPath);
  const sessionIdsOpen = openSessionIds(tabs);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEverOpened, setDrawerEverOpened] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(220);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [status, setStatus] = useState<StatusPayload | null>(null);

  useEffect(() => {
    const unlisten = listen<StatusPayload>('status:update', (e) =>
      setStatus(e.payload),
    );
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // macOS File menu owns ⌘T / ⌘⇧T / ⌘W (see src-tauri/src/menu.rs). The
  // menu accelerators fire before the webview ever sees the keystroke; we
  // just subscribe to the events the Rust side emits on click.
  useEffect(() => {
    const unlistenNew = listen('menu:new-claude-tab', () => openClaudeTab());
    const unlistenShell = listen('menu:new-shell-tab', () => openShellTab());
    const unlistenClose = listen('menu:close-tab', () => {
      if (activeUid) closeTab(activeUid);
    });
    return () => {
      void unlistenNew.then((fn) => fn());
      void unlistenShell.then((fn) => fn());
      void unlistenClose.then((fn) => fn());
    };
  }, [activeUid, openClaudeTab, openShellTab, closeTab]);

  useLayoutKeyboard({
    tabs,
    setActive,
    drawerOpen,
    setDrawerOpen,
    setDrawerEverOpened,
    setSidebarOpen,
  });

  // Sessions sidebar click router (see spec §6.4).
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

  // Drawer height drag — unchanged.
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
    <div className="layout">
      <TitleBar
        projectPath={projectPath}
        onOpenClaude={() => openClaudeTab()}
        onOpenShell={openShellTab}
        onOpenProject={onRequestProjectSwitch}
      />
      <WorkspaceTabBar
        tabs={tabs}
        activeUid={activeUid}
        sessions={sessions}
        onPickTab={setActive}
        onCloseTab={closeTab}
      />
      <div className="layout-body">
        <div className="layout-left">
          <div className="layout-workspace">
            {tabs.map((tab) => (
              <TabPane
                key={tab.uid}
                tab={tab}
                projectPath={projectPath}
                theme={theme}
                isActive={tab.uid === activeUid}
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
        {sidebarOpen && (
          <Sidebar
            sessions={sessions}
            activeSessionId={status?.sessionId ?? null}
            openSessionIds={sessionIdsOpen}
            onPickSession={pickSession}
            onNewSession={() => openClaudeTab()}
          />
        )}
      </div>
      <StatusBar status={status} />
    </div>
  );
}
