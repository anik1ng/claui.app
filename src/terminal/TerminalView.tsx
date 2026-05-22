import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';
import { themeToXterm } from './xtermTheme';
import { type Channel, makeOutputChannel, ptyClose, ptyInput, ptyResize } from '../ipc/commands';
import type { Theme } from '../theme/themeStore';
import './TerminalView.css';

interface Props {
  theme: Theme;
  /**
   * Opens a backend terminal bound to `onOutput`; resolves to its id.
   * Must be a stable reference (wrap in `useCallback`) — a new identity
   * re-runs the effect and recreates the terminal.
   */
  open: (onOutput: Channel<ArrayBuffer>, cols: number, rows: number) => Promise<number>;
  autoFocus?: boolean;
}

export function TerminalView({ theme, open, autoFocus }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [exited, setExited] = useState(false);
  // Bumped by the restart affordance to force the effect to re-run — a fresh
  // terminal and a freshly spawned process.
  const [restartKey, setRestartKey] = useState(0);

  useEffect(() => {
    // Re-runs on a project switch or a restart — clear the exited overlay.
    setExited(false);
    const host = hostRef.current!;
    const cfg = themeToXterm(theme);
    const term = new Terminal({
      theme: cfg.theme,
      fontFamily: cfg.fontFamily,
      fontSize: cfg.fontSize,
      cursorStyle: cfg.cursorStyle,
      cursorBlink: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(host);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL unavailable — xterm.js falls back to its default renderer.
    }
    fit.fit();
    if (autoFocus) term.focus();

    let id: number | null = null;
    let cancelled = false;

    const channel = makeOutputChannel((bytes) => term.write(bytes));
    open(channel, term.cols, term.rows)
      .then((tid) => {
        // If teardown already ran, the PTY still spawned on the backend —
        // close it now, since the cleanup below never saw its id.
        if (cancelled) void ptyClose(tid);
        else id = tid;
      })
      .catch(() => {
        if (!cancelled) setExited(true);
      });

    const dataSub = term.onData((data) => {
      if (id != null) void ptyInput(id, data);
    });

    let resizeTimer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        fit.fit();
        if (id != null) void ptyResize(id, term.cols, term.rows);
      }, 80);
    });
    observer.observe(host);

    const exitUnlisten = listen<{ id: number; code: number }>(
      'terminal:exit',
      (event) => {
        if (event.payload.id === id) setExited(true);
      },
    );

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(resizeTimer);
      dataSub.dispose();
      void exitUnlisten.then((fn) => fn());
      term.dispose();
      if (id != null) void ptyClose(id);
    };
    // INVARIANT: this dependency list is hand-tuned, so exhaustive-deps is
    // disabled for it. `autoFocus` is deliberately excluded — Layout passes
    // `autoFocus={drawerOpen}`, which flips on every command-drawer toggle,
    // and re-running would respawn the shell PTY each time. `restartKey` is
    // deliberately included though the body never reads it: bumping it is how
    // the restart affordance forces a fresh terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, open, restartKey]);

  return (
    <div className="terminal-view">
      <div ref={hostRef} className="terminal-host" />
      {exited && (
        <button
          type="button"
          className="terminal-exited"
          onClick={() => setRestartKey((k) => k + 1)}
        >
          process exited · restart
        </button>
      )}
    </div>
  );
}
