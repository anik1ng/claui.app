import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
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
  // Bumped to force the effect to re-run — a fresh terminal and a freshly
  // spawned process. Driven by both the auto-restart and the manual button.
  const [restartKey, setRestartKey] = useState(0);
  // When the current process was spawned — used to tell a normal exit (which
  // auto-restarts) from a crash loop (a process that dies right after spawn).
  const startedAtRef = useRef(0);

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
    // Deliberately NOT loading the WebGL addon: in WKWebView its texture
    // re-allocation on resize takes long enough that fast window drags
    // leave the canvas blank for ~500ms. xterm.js's default DOM renderer
    // has no canvas at all (each cell is a styled DOM node), so a resize
    // is a plain DOM reflow — invisible to the user. The trade-off is
    // scroll perf for very large outputs, which doesn't matter for an
    // interactive Claude Code session. If we ever need to render huge
    // logs, the recommended path is the Canvas addon (better resize
    // behaviour than WebGL while still GPU-friendly), not WebGL.
    fit.fit();
    if (autoFocus) term.focus();

    let id: number | null = null;
    let cancelled = false;

    const channel = makeOutputChannel((bytes) => term.write(bytes));
    open(channel, term.cols, term.rows)
      .then((tid) => {
        // If teardown already ran, the PTY still spawned on the backend —
        // close it now, since the cleanup below never saw its id.
        if (cancelled) {
          void ptyClose(tid);
        } else {
          id = tid;
          startedAtRef.current = Date.now();
        }
      })
      .catch(() => {
        if (!cancelled) setExited(true);
      });

    const dataSub = term.onData((data) => {
      if (id != null) void ptyInput(id, data);
    });

    // Why not `fit.fit()`? FitAddon.fit() unconditionally calls
    // `_renderService.clear()` before `term.resize()` whenever cols/rows
    // change (see node_modules/@xterm/addon-fit/src/FitAddon.ts) — that
    // wipes the canvas to background for one frame, producing the visible
    // "content disappears" blink during a window drag (cols change every
    // few pixels of motion). `term.resize()` on its own triggers a fresh
    // render with the new geometry, no pre-clear needed.
    //
    // Also split visual reflow from PTY notification: ptyResize is
    // expensive (IPC + SIGWINCH; claude re-renders at the new size). The
    // 80ms debounce keeps drags from hammering the PTY while the
    // resize() side stays free to track the window per frame.
    const applyFit = () => {
      const dims = fit.proposeDimensions();
      if (!dims || isNaN(dims.cols) || isNaN(dims.rows)) return;
      if (dims.cols === term.cols && dims.rows === term.rows) return;
      term.resize(dims.cols, dims.rows);
    };
    let pendingFit = 0;
    let resizeTimer = 0;
    const observer = new ResizeObserver(() => {
      if (!pendingFit) {
        pendingFit = requestAnimationFrame(() => {
          pendingFit = 0;
          applyFit();
        });
      }
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (id != null) void ptyResize(id, term.cols, term.rows);
      }, 80);
    });
    observer.observe(host);

    const exitUnlisten = listen<{ id: number; code: number }>(
      'terminal:exit',
      (event) => {
        if (event.payload.id !== id) return;
        // Self-heal: a process that ran for a while and then exited is
        // respawned silently. One that dies within seconds of spawning is
        // crash-looping — show the overlay instead of restarting forever.
        if (Date.now() - startedAtRef.current > 3000) {
          setRestartKey((k) => k + 1);
        } else {
          setExited(true);
        }
      },
    );

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(resizeTimer);
      if (pendingFit) cancelAnimationFrame(pendingFit);
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
        <div className="terminal-exited">
          <button
            type="button"
            className="terminal-exited-btn"
            autoFocus
            onClick={() => setRestartKey((k) => k + 1)}
          >
            process exited — restart
          </button>
        </div>
      )}
    </div>
  );
}
