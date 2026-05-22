import { useCallback, useEffect, useState } from 'react';
import { TerminalView } from '../terminal/TerminalView';
import { type Channel, openCommandTerminal, openProject } from '../ipc/commands';
import type { Theme } from '../theme/themeStore';
import './Layout.css';

interface Props {
  theme: Theme;
  projectPath: string;
}

export function Layout({ theme, projectPath }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEverOpened, setDrawerEverOpened] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(220);

  // Ctrl+` toggles the command drawer; Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setDrawerEverOpened(true);
        setDrawerOpen((v) => !v);
      } else if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const openClaude = useCallback(
    (ch: Channel<ArrayBuffer>, cols: number, rows: number) =>
      openProject(projectPath, ch, cols, rows),
    [projectPath],
  );
  const openShell = useCallback(
    (ch: Channel<ArrayBuffer>, cols: number, rows: number) =>
      openCommandTerminal(ch, cols, rows),
    [],
  );

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
      <div className="layout-main">
        <TerminalView theme={theme} open={openClaude} autoFocus />
      </div>
      {drawerOpen && <div className="layout-divider" onMouseDown={startDrag} />}
      {drawerEverOpened && (
        <div className="layout-drawer" style={{ height: drawerOpen ? drawerHeight : 0 }}>
          <TerminalView theme={theme} open={openShell} autoFocus={drawerOpen} />
        </div>
      )}
    </div>
  );
}
