import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { listen } from '@tauri-apps/api/event';
import '@xterm/xterm/css/xterm.css';
import { themeToXterm } from './xtermTheme';
import { isShiftEnterTrigger } from './keyHandler';
import { type Channel, makeOutputChannel, ptyClose, ptyInput, ptyResize } from '../ipc/commands';
import { useActivePty } from './activePty';
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
  /**
   * True when this is the window's active terminal (active project × active
   * tab). Drives the `activePty` registry that `useFileDrop` routes dropped
   * paths to. Tracked by activation — NOT by DOM focus — so a project switch
   * (which doesn't refocus the new terminal) still points drops at the
   * visible terminal rather than the previously-focused one.
   */
  isActiveTerminal?: boolean;
  /**
   * Called when `open()` rejects (PTY spawn failed — claude binary missing,
   * cwd vanished, etc.). The host can use this to remove the dead tab so it
   * doesn't keep occupying a sessionId in the open-tabs set forever.
   */
  onSpawnFailed?: () => void;
}

export function TerminalView({ theme, open, autoFocus, isActiveTerminal = false, onSpawnFailed }: Props) {
  // Latest onSpawnFailed via ref so the main effect doesn't re-run when the
  // callback identity changes (it's an inline arrow at the call site).
  const onSpawnFailedRef = useRef(onSpawnFailed);
  onSpawnFailedRef.current = onSpawnFailed;
  const hostRef = useRef<HTMLDivElement>(null);
  // Lives across the main effect so a separate autoFocus effect (below) can
  // call .focus() when the tab becomes active without tearing down the term.
  const termRef = useRef<Terminal | null>(null);
  const [exited, setExited] = useState(false);
  // This terminal's live PTY id, surfaced as state so the activation effect
  // (below) can register it in the activePty file-drop registry. null until
  // the PTY spawns / after it exits.
  const [ptyId, setPtyId] = useState<number | null>(null);
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
      lineHeight: cfg.lineHeight,
      letterSpacing: cfg.letterSpacing,
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
    termRef.current = term;
    if (autoFocus) term.focus();

    let id: number | null = null;
    let cancelled = false;
    // Dedupe noop SIGWINCH: the ResizeObserver tick and the font-ready
    // re-measure both used to send ptyResize unconditionally. claude (and
    // most TUIs) repaint their full UI on SIGWINCH including the intro
    // banner — if the banner already scrolled into scrollback, the repaint
    // adds a duplicate copy that the user sees when scrolling or resizing.
    // Track the last cols/rows sent to the PTY and skip when unchanged.
    let lastSentCols = 0;
    let lastSentRows = 0;
    const sendResizeIfChanged = () => {
      if (id == null) return;
      if (term.cols === lastSentCols && term.rows === lastSentRows) return;
      lastSentCols = term.cols;
      lastSentRows = term.rows;
      void ptyResize(id, term.cols, term.rows);
    };

    const channel = makeOutputChannel((bytes) => term.write(bytes));
    open(channel, term.cols, term.rows)
      .then((tid) => {
        // If teardown already ran, the PTY still spawned on the backend —
        // close it now, since the cleanup below never saw its id.
        if (cancelled) {
          void ptyClose(tid);
        } else {
          id = tid;
          setPtyId(tid);
          startedAtRef.current = Date.now();
          // Race fix: `document.fonts.ready` may have resolved and refit
          // `term.cols/rows` between the `open()` call and this `.then()`
          // (warm font cache + slow IPC round-trip). The spawn used the
          // pre-refit dims; sync now so the PTY isn't stuck at the
          // Menlo-measured geometry while xterm renders Monaspace-measured.
          // Goes through the dedupe path so we don't re-send the same dims.
          if (term.cols > 0 && term.rows > 0) {
            sendResizeIfChanged();
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExited(true);
          onSpawnFailedRef.current?.();
        }
      });

    const dataSub = term.onData((data) => {
      if (id != null) void ptyInput(id, data);
    });

    // Shift+Enter would otherwise emit the same `\r` as plain Enter — claude
    // (and any other TUI built on Ink / readline) then sees the two as
    // identical and treats Shift+Enter as "submit". Intercept the keydown
    // and emit a bare LF (`\n`, byte 0x0A). Claude's Ink-based input handler
    // reads PTY bytes in raw mode and distinguishes CR (submit) from LF
    // (newline-in-input). This matches ghostty's recommended config —
    // `keybind = shift+enter=text:\n` — which is the documented fix.
    //
    // `e.preventDefault()` is load-bearing: xterm.js's `_keyDown` (in
    // node_modules/@xterm/xterm/src/browser/CoreBrowserTerminal.ts:1025)
    // returns early on `_customKeyEventHandler(...) === false`, which means
    // it does NOT set `_keyDownHandled = true`. The browser then auto-fires
    // a keypress event for Enter, and xterm.js's `_keyPress` handler
    // (same file:1140) checks `_keyDownHandled` — sees false — and emits
    // the default `\r` via `triggerDataEvent`. PTY ends up receiving BOTH
    // our `\n` AND xterm.js's `\r`, and the `\r` triggers submit.
    // `preventDefault()` on the keydown event cancels the subsequent
    // keypress event per DOM spec, breaking that double-emission.
    //
    // `term.scrollToBottom()` mirrors xterm.js's default `scrollOnUserInput`
    // behaviour (CoreBrowserTerminal.ts:1033-1035): when the user has
    // scrolled into history and types, the viewport snaps back to the
    // prompt. Our intercept exits before that path, so without this call
    // a Shift+Enter while scrolled up inserts the newline invisibly.
    //
    // Trade-off: in a shell tab zsh will still submit on Shift+Enter
    // because the canonical-mode tty driver translates LF the same as CR
    // (ICRNL). Acceptable — Shift+Enter in a shell isn't a standard
    // multiline gesture (users rely on `\` + Enter or here-docs).
    term.attachCustomKeyEventHandler((e) => {
      if (isShiftEnterTrigger(e)) {
        e.preventDefault();
        if (id != null) void ptyInput(id, '\n');
        term.scrollToBottom();
        return false;
      }
      return true;
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
      // Skip when host is zero-sized — happens when the drawer collapses
      // (.layout-drawer height transitions to 0 with the inner TerminalView
      // still mounted). FitAddon's proposeDimensions would clamp to a
      // minimum 2x1 cell grid and we'd ship SIGWINCH(2, 1) to the shell,
      // which many shells handle by erasing the prompt or hanging until
      // the next resize.
      if (host.clientHeight === 0 || host.clientWidth === 0) return;
      if (!pendingFit) {
        pendingFit = requestAnimationFrame(() => {
          pendingFit = 0;
          applyFit();
        });
      }
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(sendResizeIfChanged, 80);
    });
    observer.observe(host);

    // Bundled @font-face fonts (Monaspace Neon, NF, Geist) load asynchronously,
    // and the terminal we just constructed measured cell width against whatever
    // face was available at that moment — likely the system fallback (Menlo).
    // Once the real fonts arrive, force xterm to re-measure: setting `fontFamily`
    // to its current value triggers the renderer's font-change handler, which
    // recomputes cell dimensions. Then refit so cols/rows match the new metrics.
    // Without this, Nerd Font glyphs render against a Menlo-sized cell grid and
    // the line wraps wrong; in the worst case PUA codepoints render as tofu
    // because the font-family chain was resolved before NF finished loading.
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      // Bundled @font-face fonts (Monaspace Neon, NF, Geist) load
      // asynchronously, and the terminal we constructed earlier measured
      // cell width against whatever face was available at that moment —
      // likely the Menlo fallback. Once the real fonts arrive, xterm
      // must re-measure. Two subtleties:
      //
      // 1. xterm.js's OptionsService.setOption short-circuits when the
      //    new value equals the old (see node_modules/@xterm/xterm/src/
      //    common/services/OptionsService.ts:134), so a self-assign is a
      //    no-op. Toggle through a sentinel value (trailing space) and
      //    back to force two fire('fontFamily') events — both pass the
      //    equality check and reach the renderer's font-change handler.
      // 2. After applyFit may have changed term.cols/rows, the
      //    ResizeObserver does NOT fire (only font metrics changed, the
      //    host element didn't), so the debounced ptyResize never runs.
      //    Push it explicitly so the backend PTY isn't left at the old
      //    geometry.
      const ff = term.options.fontFamily;
      term.options.fontFamily = `${ff} `;
      term.options.fontFamily = ff;
      applyFit();
      sendResizeIfChanged();
    });

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
      termRef.current = null;
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

  // Focus when autoFocus flips true *after* mount (tab switch, drawer open).
  // Lives in its own effect so changes don't tear down the term; reads the
  // current Terminal via termRef set by the main effect above.
  useEffect(() => {
    if (autoFocus) termRef.current?.focus();
  }, [autoFocus]);

  // Register this terminal as the file-drop target while it's the active
  // terminal with a live PTY (see useActivePty for why activation, not focus).
  useActivePty(isActiveTerminal, ptyId);

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
