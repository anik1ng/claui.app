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
- `npm run lint` — ESLint over `src/` (flat config in `eslint.config.js`).
- `npm run typecheck` — `tsc --noEmit`; reports type errors with no build output.
- `npm test` — frontend unit tests (Vitest). Single file: `npx vitest run src/terminal/xtermTheme.test.ts`; by name: `npx vitest run -t "appends a monospace fallback"`.
- `cargo test --manifest-path src-tauri/Cargo.toml` — Rust tests. One module: append `state::`; one test: `state::tests::alloc_id_is_monotonic`.
- `cargo build --manifest-path src-tauri/Cargo.toml` — build the Rust core only.

Build toolchain is plain `cargo` + `npm` — Rust (stable) and Node.js 20+, nothing else.

## Linting and discipline

- `docs/AUDIT_RULES.md` — the rules governing AI-assisted edits: file-size and
  complexity limits (Section 1), documentation discipline (Section 8), and the
  exceptions list (Section 9). Sections 2–7 are reserved for claui-specific
  invariants. `[lint]`-tagged rules are enforced mechanically by
  `eslint.config.js` and `src-tauri/Cargo.toml`'s `[lints.*]` sections;
  `[review]` rules are checked during audits.
- `docs/DECISIONS.md` — append-only log of decisions that change an invariant
  or relax/tighten an audit rule. Per AUDIT_RULES R8.3, update the docs in the
  same commit as the code change they describe.
- `.githooks/pre-commit` runs typecheck + ESLint + Vitest on staged TS and
  clippy + tests on staged Rust. Activate it once per clone:
  `git config core.hooksPath .githooks`.

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
  keyed by id, plus an id counter.
- `ipc.rs` — the Tauri commands (`get_last_project`, `open_project`,
  `open_command_terminal`, `pty_input`, `pty_resize`, `pty_close`,
  `list_sessions`) and the `claude:not-found` / `terminal:exit` /
  `status:update` events.
- `menu.rs` — builds the native macOS menu; `File → Open Project` emits
  `menu:open-project`.
- `statusline.rs` — installs the wrapper script that captures `claude`'s
  statusline JSON, watches its output file, and emits `status:update`.
- `sessions.rs` — reads a project's `claude` session files from
  `~/.claude/projects/<encoded>/` for the sessions sidebar.
- `claude.rs` — locates the `claude` binary on `$PATH` and common install dirs.

### Frontend (`src/`)

- `terminal/TerminalView.tsx` — one terminal: an `xterm.js` `Terminal` with the
  Fit / WebLinks addons, wired to IPC. Serves both the `claude` pane and the
  command terminal via an injected `open` callback. The WebGL addon is
  deliberately NOT loaded — its texture re-allocation on resize leaves the
  canvas blank for ~500ms in WKWebView. xterm's default DOM renderer reflows
  as plain DOM nodes and is invisible on resize.
- `terminal/xtermTheme.ts` — pure: claui `Theme` → `xterm.js` options.
- `theme/themeStore.ts` — the `Theme` TypeScript types, the built-in
  `defaultTheme`, and applying the theme to the app chrome via CSS variables.
- `layout/Layout.tsx` — status bar, main pane, the slide-out command-terminal
  drawer, and the sessions sidebar.
- `status/StatusBar.tsx` — the bottom status bar (model, context, cost, limits),
  fed by the `status:update` event.
- `sessions/Sidebar.tsx` — the sessions list; clicking a row resumes that
  `claude` session.
- `ipc/commands.ts` — typed `invoke` wrappers and the output-`Channel` helper.
- `tabs/useTabs.ts`, `tabs/tabsReducer.ts`, `tabs/types.ts`, `tabs/openSessionIds.ts`, `tabs/tabTitle.ts`, `tabs/keyboard.ts` — the workspace tab list and its pure helpers. Each Tab descriptor is a kind (`claude` / `shell`), an `isPrimary` flag, and resume/session ids. `TerminalView` retains PTY ownership; `useTabs` only manages tab descriptors. The first claude tab of each open project is pinned — `closeTab` on it returns the state unchanged.
- `tabs/WorkspaceTabBar.tsx`, `tabs/HoverToolbar.tsx` — the 28px ribbon at the top of the window. Always rendered; the tab strip inside renders only when `tabs.length >= 2`. The toolbar at the right end (claude, terminal, open-project, plus placeholders for browser and split-pane) is baseline-visible — it's the only mouse path for opening tabs or switching projects when the strip is hidden. A project tab strip (for multi-project mode) is deferred to Phase 3b — Phase 3a always has exactly one project, so a strip would be pure noise.
- `layout/useLayoutKeyboard.ts` — extracted keydown effect for the drawer / sidebar / sessions sidebar toggles and the numeric tab switcher (`Cmd+1..9`). `Cmd+T` / `Cmd+Shift+T` / `Cmd+W` are NOT here — they're owned by the macOS File menu (see `src-tauri/src/menu.rs`); `Layout` subscribes to the `menu:new-claude-tab` / `menu:new-shell-tab` / `menu:close-tab` events the Rust side emits on click.
- `sessions/useSessionsPolling.ts` — extracted from `Sidebar.tsx`; `Layout` calls it once and feeds the result into both the sidebar and the workspace tab bar (for titles).

## Conventions and non-obvious points

- **`docs/superpowers/` is gitignored** — design specs and implementation plans
  live there, local-only; never commit them. The v1 spec
  `docs/superpowers/specs/2026-05-21-claui-v1-xterm-design.md` holds the
  forward roadmap (tabs, split panes, dashboard sidebar, git panel); subsequent
  per-phase specs sit alongside it.
- An earlier version built the terminal from scratch on `libghostty-vt` (a Rust
  VT engine + a hand-written canvas renderer). It was abandoned for `xterm.js`
  and the repository was re-initialized. Do not re-introduce libghostty.
- `src/main.tsx` deliberately omits `React.StrictMode`: effects spawn real OS
  processes, and StrictMode's double-invoke would spawn duplicates.
- The main window is built programmatically in `lib.rs::run`'s setup callback
  (NOT auto-created from `tauri.conf.json`, whose `windows` array is empty).
  `WebviewWindowBuilder` is the only Tauri 2 mechanism that lets us pass
  `.theme(Some(Theme::Dark))` + `.initialization_script(...)`, which together
  kill the cold-start white flash: the theme sets NSAppearance so WKWebView
  paints a matching surface before HTML loads, and the init script forces
  `documentElement.style.colorScheme = 'dark'` so canvas/scrollbar/form-control
  defaults stay dark too. Tauri's `backgroundColor` config field is documented
  as "Not implemented for the webview layer" on macOS / iOS and does NOT help.
- The webview resolves fonts differently from a native terminal.
  `xtermTheme.ts` builds a font-family chain shaped
  `<configured>, "<iconFontFamily>", Menlo, monospace`. The configured
  family covers Latin / Cyrillic / box-drawing, the icon family (default
  `Monaspace Neon NF`) supplies Nerd Font glyphs in the PUA via per-glyph
  fallback, and `Menlo, monospace` is the final safety net so the
  terminal can never render a proportional font.
- Shipped today: the terminal core, the macOS menu / project switching, the
  status bar at the bottom of the window (model / context / cost / 5h+7d
  limits, captured via a `statusLine` wrapper claui writes into project-local
  `.claude/settings.local.json`; locked to the primary claude tab), the
  sessions sidebar, plus workspace tabs (Cmd+T / Cmd+Shift+T / Cmd+1..9 /
  Cmd+W), a pinned primary claude per project, and the hover toolbar for
  opening claude/terminal in a new tab. The sessions sidebar marks rows whose
  session is currently open in some tab. Split panes, the
  dashboard, and a git panel are later phases.
- The primary claude of each open project gets `CLAUI_PRIMARY=1` in its env
  in addition to `CLAUI_ACTIVE=1` (see `src-tauri/src/ipc.rs::build_spawn_env`).
  The statusline wrapper writes the global status file only when `CLAUI_PRIMARY`
  is set, so the status bar always reflects the primary tab even when multiple
  claudes are alive. Non-primary claudes still run the wrapper (claude requires
  a statusline command) but their wrapper invocations short-circuit out of the
  file-write branch.
- The macOS File menu (`src-tauri/src/menu.rs`) owns the `Cmd+T` /
  `Cmd+Shift+T` / `Cmd+W` accelerators. macOS intercepts menu shortcuts
  before the webview, so the webview doesn't (and must not) bind these
  in JS — it subscribes to the `menu:new-claude-tab` / `menu:new-shell-tab`
  / `menu:close-tab` events emitted from `on_menu_event`. The "primary
  tab is unclosable" invariant lives in `tabsReducer`: a `closeTab`
  action on the primary returns the state unchanged, so the menu's
  Cmd+W fires harmlessly when the primary is active. We removed the
  predefined `.close_window()` item from the Window submenu because its
  default `Cmd+W` would otherwise fight File → Close Tab; the red
  traffic-light button remains the way to close the window.
- TDD: pure logic carries tests (`cargo test`, Vitest); the terminal and UI are
  verified by running the app — `cargo test` passing does not prove the UI works.
- All code, comments, commit messages, and documentation are written in English.
