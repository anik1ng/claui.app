import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { TerminalView } from '../terminal/TerminalView';
import { StatusBar } from '../status/StatusBar';
import { Sidebar } from '../sessions/Sidebar';
import { useSessionsPolling } from '../sessions/useSessionsPolling';
import {
  type Channel,
  openCommandTerminal,
  openProject,
  type StatusPayload,
} from '../ipc/commands';
import type { Theme } from '../theme/themeStore';
import './Layout.css';

interface Props {
  theme: Theme;
  projectPath: string;
  onRequestProjectSwitch: () => void;
}

/**
 * Which session the claude terminal should run: a resume id (or null for a
 * fresh session), plus a nonce so picking the same session — or "+ New"
 * twice — still changes the `open` callback identity and re-runs the terminal.
 */
interface SessionTarget {
  resumeId: string | null;
  nonce: number;
}

export function Layout({ theme, projectPath }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEverOpened, setDrawerEverOpened] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(220);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [sessionTarget, setSessionTarget] = useState<SessionTarget>({
    resumeId: null,
    nonce: 0,
  });
  const sessions = useSessionsPolling(projectPath);

  // React's "adjust state when a prop changes" pattern: switching projects
  // must drop a resume id that belongs to the old project. Resetting here —
  // during render — lands in the same render as the projectPath change, so
  // the claude terminal re-runs exactly once.
  const [prevProject, setPrevProject] = useState(projectPath);
  if (projectPath !== prevProject) {
    setPrevProject(projectPath);
    setSessionTarget({ resumeId: null, nonce: 0 });
  }

  // Live Claude Code state, pushed by the statusline watcher.
  useEffect(() => {
    const unlisten = listen<StatusPayload>('status:update', (e) => setStatus(e.payload));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Ctrl+` toggles the command drawer; Ctrl+B the sidebar; Esc closes the drawer.
  // NOTE: the listener runs in the CAPTURE phase and stops propagation, so the
  // event never reaches xterm.js — otherwise xterm would consume Ctrl+B (it's
  // ASCII STX, a useful VT control char) before our handler ran and the
  // shortcut would silently do nothing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        e.stopPropagation();
        setDrawerEverOpened(true);
        setDrawerOpen((v) => !v);
      } else if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        e.stopPropagation();
        setSidebarOpen((v) => !v);
      } else if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drawerOpen]);

  const openClaude = useCallback(
    (ch: Channel<ArrayBuffer>, cols: number, rows: number) =>
      openProject(projectPath, ch, cols, rows, sessionTarget.resumeId ?? undefined, true),
    [projectPath, sessionTarget],
  );
  const openShell = useCallback(
    (ch: Channel<ArrayBuffer>, cols: number, rows: number) =>
      openCommandTerminal(projectPath, ch, cols, rows),
    [projectPath],
  );

  // Picking the already-active session would needlessly restart it.
  // The double-check protects the launch window: status only flips to
  // the new sessionId once `claude` has written its first statusline
  // JSON line, which can take several seconds; until then a second
  // click on the same row would otherwise bump the nonce, tear down
  // the in-flight terminal, and respawn claude from scratch. The
  // resumeId guard catches that gap by matching against the target
  // we already sent.
  const pickSession = (id: string) => {
    if (id === status?.sessionId) return;
    if (id === sessionTarget.resumeId) return;
    setSessionTarget((t) => ({ resumeId: id, nonce: t.nonce + 1 }));
  };
  const newSession = () => {
    setSessionTarget((t) => ({ resumeId: null, nonce: t.nonce + 1 }));
  };

  // Divider drag to resize the drawer.
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

  return (
    <div className="layout">
      <StatusBar status={status} />
      <div className="layout-body">
        <div className="layout-left">
          <div className="layout-main">
            <TerminalView theme={theme} open={openClaude} autoFocus />
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
            openSessionIds={new Set()}
            onPickSession={pickSession}
            onNewSession={newSession}
          />
        )}
      </div>
    </div>
  );
}
