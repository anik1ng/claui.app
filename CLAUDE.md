# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What claui is

claui is a Tauri 2 desktop GUI shell for Claude Code. It hosts the real installed
`claude` CLI inside an `xterm.js` terminal and wraps it in a native shell. It does
not call the Anthropic API and never handles credentials — the user logs into
`claude` itself.

## Commands

Run from the repository root:

- `npm run tauri dev` — run the app (builds the Rust core + serves the webview).
- `npm run tauri build` — production build.
- `npm run build` — build the frontend only (`tsc` typecheck + `vite build`).
- `npm test` — frontend unit tests (Vitest). Single file: `npx vitest run src/terminal/xtermTheme.test.ts`; by name: `npx vitest run -t "appends a monospace fallback"`.
- `cargo test --manifest-path src-tauri/Cargo.toml` — Rust tests. One module: append `state::`; one test: `state::tests::alloc_id_is_monotonic`.
- `cargo build --manifest-path src-tauri/Cargo.toml` — build the Rust core only.

Build toolchain is plain `cargo` + `npm` — Rust (stable) and Node.js 20+, nothing else.

## Architecture

Two halves communicating over Tauri IPC:

- **Rust core** (`src-tauri/src/`) — spawns and owns PTYs. It does nothing else terminal-related.
- **Webview** (`src/`, React + TypeScript) — owns the terminal entirely, via `xterm.js`.

The load-bearing decision: **`xterm.js`, in the webview, does all VT parsing,
rendering, input encoding, selection, and scrollback.** Rust never parses VT and
has no renderer. Only raw PTY bytes cross the IPC boundary:

- **Output:** PTY → `PtySession` reader thread → a per-terminal Tauri `Channel<Vec<u8>>` → `term.write()`.
- **Input:** `term.onData()` → `pty_input` command → `PtySession.write()`.
- **Resize:** `FitAddon` → `pty_resize` command → `PtySession.resize()`.

### Rust modules (`src-tauri/src/`)

- `pty.rs` — `PtySession`: one PTY + child process. Output goes to an injected
  sink closure; child exit to an `on_exit` closure. Killed on `Drop`.
- `state.rs` — `AppState`: a `Mutex`-guarded registry of live `PtySession`s
  keyed by id, plus the current project path and an id counter.
- `ipc.rs` — the five Tauri commands (`get_last_project`, `open_project`,
  `open_command_terminal`, `pty_input`, `pty_resize`) and the
  `claude:not-found` / `terminal:exit` events.
- `claude.rs` — locates the `claude` binary on `$PATH` and common install dirs.

### Frontend (`src/`)

- `terminal/TerminalView.tsx` — one terminal: an `xterm.js` `Terminal` with the
  Fit / WebGL / WebLinks addons, wired to IPC. Serves both the `claude` pane and
  the command terminal via an injected `open` callback.
- `terminal/xtermTheme.ts` — pure: claui `Theme` → `xterm.js` options.
- `theme/themeStore.ts` — the `Theme` TypeScript types, the built-in
  `defaultTheme`, and applying the theme to the app chrome via CSS variables.
- `layout/Layout.tsx` — main pane plus the slide-out command-terminal drawer.
- `ipc/commands.ts` — typed `invoke` wrappers and the output-`Channel` helper.

## Conventions and non-obvious points

- **`docs/superpowers/` is gitignored** — the design spec and implementation
  plans live there, local-only; never commit them. The current spec,
  `docs/superpowers/specs/2026-05-21-claui-v1-xterm-design.md`, holds the
  phase-2+ roadmap (split panes, tabs, dashboard sidebar, git panel).
- An earlier version built the terminal from scratch on `libghostty-vt` (a Rust
  VT engine + a hand-written canvas renderer). It was abandoned for `xterm.js`
  and the repository was re-initialized. Do not re-introduce libghostty.
- `src/main.tsx` deliberately omits `React.StrictMode`: effects spawn real OS
  processes, and StrictMode's double-invoke would spawn duplicates.
- The webview resolves fonts differently from a native terminal. `xtermTheme.ts`
  always appends a `Menlo, monospace` fallback to the configured `font-family`,
  so the terminal can never render a proportional font when that family is
  unavailable.
- v1 is the terminal core only. Splits, tabs, and the dashboard are later phases.
- TDD: pure logic carries tests (`cargo test`, Vitest); the terminal and UI are
  verified by running the app — `cargo test` passing does not prove the UI works.
- All code, comments, commit messages, and documentation are written in English.
