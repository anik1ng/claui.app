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
- `ipc.rs` — the Tauri commands (`open_project`, `open_command_terminal`,
  `pty_input`, `pty_resize`, `pty_close`, `list_sessions`, `get_window_state`,
  `save_window_state`, `cleanup_project_status`) and the `claude:not-found` /
  `terminal:exit` / `status:update` events. `build_spawn_env(captured,
  is_primary, project_id)` layers three sources for the spawned claude's env:
  (1) every variable from `shell_env::get()` (the interactive-shell snapshot —
  this is what brings `FNM_DIR` / `NVM_DIR` / `ASDF_*` / `MISE_*` and the
  shell's PATH, which is the only place fnm's per-shell node symlink ever
  appears); (2) `augment_path` prepends `extra_path_dirs` (Homebrew /
  `~/.local/bin` / `~/.cargo/bin` / ...) to that PATH as a safety net for
  users whose `.zshrc` doesn't set them up; (3) the `CLAUI_*` overlays
  (`CLAUI_ACTIVE`, `CLAUI_PRIMARY`, `CLAUI_STATUS_FILE`).
- `shell_env.rs` — captures the user's `$SHELL -ilc 'env'` snapshot once at
  app start, parses it between sentinels (chatter-tolerant, NUL-separated),
  caches it in a `OnceLock`. `warm()` spawns the capture on a bg thread from
  `lib.rs::run`'s setup so its 50-200 ms cost overlaps with window paint.
  Failures (timeout, missing sentinels, shell crash) return an empty map and
  `build_spawn_env` falls back to its `augment_path`-only behaviour. This is
  the same trick VSCode / Cursor / Warp use via the `shell-env` npm package
  to bridge launchd's minimal `.app` PATH to the user's terminal env.
- `menu.rs` — builds the native macOS menu; the File submenu owns the
  `Add Project (⌘⇧N)` / `Close Project (⌘⇧W)` / `New Claude Tab (⌘⇧T)` /
  `New Terminal Tab (⌘T)` / `Close Tab (⌘W)` accelerators and emits
  `menu:add-project` / `menu:close-project` / `menu:new-claude-tab` /
  `menu:new-shell-tab` / `menu:close-tab` events.
- `statusline.rs` — installs the wrapper script that captures `claude`'s
  statusline JSON, watches `/tmp/claui/` for `status-<projectId>.json` files
  (one per primary claude), and emits one `status:update` per project with
  payload `{ projectId, status }`. `filename_to_project_id` is a pure helper
  for extracting the id from the filename.
- `sessions.rs` — reads a project's `claude` session files from
  `~/.claude/projects/<encoded>/` for the sessions sidebar.
- `claude.rs` — locates the `claude` binary on `$PATH` and common install dirs.
- `window_state.rs` — types + atomic save/load for `<app_config_dir>/window.json`
  (the persisted list of open projects). Versioned; stale paths are filtered
  on load.

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
- `layout/ProjectArea.tsx` — one project's terminal stack (workspace
  TabPanes + drawer). All open projects' `ProjectArea` instances are
  mounted simultaneously; the active one is marked `.is-active` (CSS class,
  not inline style), others are `visibility: hidden` on a
  `position: absolute; inset: 0` container so xterm geometry and scrollback
  survive a project switch. The window chrome — `WorkspaceTabBar`,
  `StatusBar`, `SessionsSection` — is rendered into App-level slots
  (`#workspace-tabs-slot`, `#status-slot`, `#sessions-slot`) via
  `createPortal`. The portals are gated on `isActive`, so only one
  project's chrome ever occupies the slots. Per-project `useTabs(path, id)`,
  `useSessionsPolling(path)`, drawer state. Menu listeners
  (`menu:new-claude-tab` / `menu:new-shell-tab` / `menu:close-tab`) are
  gated on `isActive` so only the visible project responds.
- `projects/useProjects.ts`, `projects/projectsReducer.ts`,
  `projects/types.ts`, `projects/ProjectsSection.tsx`,
  `projects/useProjectSwitchKeyboard.ts` — the list of open projects and
  its top-of-sidebar rendering. `useProjects` reads `window.json` at mount
  (via `getWindowState`) and debounced-writes it back on every state change
  (250 ms). Duplicate-path adds focus the existing entry instead of
  appending. `ProjectsSection` renders projects as `<ListRow>`s into the
  top of the right sidebar; it returns `null` when only one project is
  open (no choice to surface). `useProjectSwitchKeyboard` handles
  `Cmd+Alt+1..9` for project switching at the App level.
- `status/useStatusByProject.ts` — listens to `status:update` events with
  the `{ projectId, status }` shape, aggregates them into
  `Map<projectId, StatusPayload>`. `App` slices the map per project and
  passes the active entry into each `ProjectArea`. Belt-and-suspenders
  content-dedupe (field-by-field equality) keeps identical payloads from
  flipping Map identity and forcing unnecessary re-renders.
- `status/StatusBar.tsx` — the bottom status bar (model, context, cost,
  limits), fed by the active project's status slice. Portaled into
  `#status-slot` at App-level by the active `ProjectArea`.
- `sessions/Sidebar.tsx` — the right-hand sidebar shell. A bare flex
  column that wraps two sections: `<ProjectsSection>` (rendered directly
  by `App`) on top, and `#sessions-slot` (portal target for the active
  project's `<SessionsSection>`) on the bottom.
- `sessions/SessionsSection.tsx` — the active project's session list,
  rendered as `<ListRow>`s. Portaled into `#sessions-slot` by the active
  `ProjectArea`. Each row carries the session title + relative-time meta;
  rows whose session is currently held by some workspace tab get a small
  `↗` badge.
- `sessions/ListRow.tsx` — the unified row used by both
  `ProjectsSection` and `SessionsSection`. One visual contract: label
  on the left (truncated with ellipsis), optional meta on the right,
  hover-revealed `×` close button when `onClose` is provided, accent
  strip on the left edge when active.
- `ipc/commands.ts` — typed `invoke` wrappers and the output-`Channel`
  helper. Hosts the `ProjectEntry` / `WindowState` / `StatusUpdate` types
  the webview shares with Rust.
- `tabs/useTabs.ts`, `tabs/tabsReducer.ts`, `tabs/types.ts`,
  `tabs/openSessionIds.ts`, `tabs/tabTitle.ts`, `tabs/keyboard.ts` —
  the workspace tab list and its pure helpers. Each Tab descriptor is a
  kind (`claude` / `shell`), an `isPrimary` flag, and resume/session ids.
  `TerminalView` retains PTY ownership; `useTabs` only manages tab
  descriptors. The first claude tab of each open project is pinned —
  `closeTab` on it returns the state unchanged. `useTabs` is keyed by
  `projectId` so each project's `status:update` events bind to its own
  primary tab (cross-project status bleed is filtered out).
- `layout/TitleBar.tsx`, `layout/Icons.tsx` — the 32px strip claui draws
  at the very top of the window, replacing the native macOS title bar
  (which is hidden via `TitleBarStyle::Overlay` in `lib.rs`). Left ~78px
  reserved for the overlaid traffic lights; centre is
  `#workspace-tabs-slot` — the active `ProjectArea` portals its
  `<WorkspaceTabBar>` into it via `createPortal`. Right end has a
  hover-revealed toolbar of inline SVG icons (claude / terminal /
  browser-placeholder / split-pane-placeholder). The toolbar's
  claude/terminal buttons emit `menu:new-claude-tab` /
  `menu:new-shell-tab` events via Tauri `emit()` so the active
  ProjectArea picks them up. The strip carries `-webkit-app-region: drag`
  so the user can still drag the window from it; interactive children
  override with `no-drag`. `Icons.tsx` hosts the Lucide-style SVG paths.
- `tabs/WorkspaceTabBar.tsx` — the workspace tab strip, rendered into
  the title bar via portal. Returns `null` when `tabs.length < 2` (a
  single primary needs no switcher). Uses the same `<IconClaudeMascot>` /
  `<IconTerminal>` SVG icons as the title-bar toolbar so the visual
  language is consistent.
- `layout/useLayoutKeyboard.ts` — extracted keydown effect for the
  drawer / sidebar toggles and the numeric tab switcher (`Cmd+1..9`).
  `Cmd+T` / `Cmd+Shift+T` / `Cmd+W` are NOT here — they're owned by the
  macOS File menu (see `src-tauri/src/menu.rs`); `ProjectArea` subscribes
  to the corresponding `menu:*` events the Rust side emits on click. The
  hook accepts an `enabled` flag so only the active project's installation
  runs.
- `sessions/useSessionsPolling.ts` — extracted from `Sidebar.tsx`;
  `ProjectArea` calls it once per project and feeds the result into both
  the sessions section (via portal) and the workspace tab bar (for
  titles).

## Conventions and non-obvious points

- **`docs/superpowers/` is gitignored** — design specs and implementation plans
  live there, local-only; never commit them. Specs/plans for shipped phases are
  pruned once implemented. The forward roadmap (split panes, dashboard sidebar,
  git panel) is tracked here as the work is picked up; each phase gets its own
  spec alongside.
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
  `.claude/settings.local.json`; one file per project), the sessions sidebar,
  workspace tabs (`Cmd+T` / `Cmd+Shift+T` / `Cmd+1..9` / `Cmd+W`), and
  multi-project tabs (`Cmd+Shift+N` Add Project / `Cmd+Shift+W` Close Project
  / `Cmd+Alt+1..9` switch project). The sessions sidebar marks rows whose
  session is currently open in some tab. Open projects + the active one
  persist to `<app_config_dir>/window.json` and restore on next launch
  (workspace tabs inside a project do NOT persist; each restored project
  boots with one fresh primary claude). Split panes, the dashboard, and a
  git panel are later phases.
- The primary claude of each open project gets `CLAUI_PRIMARY=1` AND
  `CLAUI_STATUS_FILE=/tmp/claui/status-<projectId>.json` in its env, in
  addition to `CLAUI_ACTIVE=1` (see `src-tauri/src/ipc.rs::build_spawn_env`).
  The statusline wrapper reads `$CLAUI_STATUS_FILE` and writes there only
  when `CLAUI_PRIMARY` is set, so each project's primary writes to its own
  file. The Rust watcher iterates `/tmp/claui/status-*.json` on every FS
  event and emits one `status:update` per file with payload `{ projectId,
  status }`; the webview's `useStatusByProject` aggregates them into a Map
  keyed by projectId. Non-primary claudes still run the wrapper (claude
  requires a statusline command) but their wrapper invocations short-circuit
  out of the file-write branch because `CLAUI_PRIMARY` is unset.
- The macOS File menu (`src-tauri/src/menu.rs`) owns the
  `Cmd+Shift+N Add Project` / `Cmd+Shift+W Close Project` / `Cmd+T New Terminal
  Tab` / `Cmd+Shift+T New Claude Tab` / `Cmd+W Close Tab` accelerators.
  macOS intercepts menu shortcuts before the webview, so the webview doesn't
  (and must not) bind these in JS — it subscribes to the `menu:add-project`
  / `menu:close-project` / `menu:new-claude-tab` / `menu:new-shell-tab` /
  `menu:close-tab` events emitted from `on_menu_event`. App listens for the
  project events; each `ProjectArea` listens for the tab events but only
  when `isActive`, so exactly one ProjectArea handles a given keypress. The
  "primary tab is unclosable" invariant lives in `tabsReducer`: a `closeTab`
  action on the primary returns the state unchanged. We removed the
  predefined `.close_window()` item from the Window submenu because its
  default `Cmd+W` would otherwise fight File → Close Tab; the red
  traffic-light button remains the way to close the window. `Cmd+Alt+1..9`
  (project switch) is handled in `src/projects/useProjectSwitchKeyboard.ts`
  at the App level via a capture-phase keydown listener — nine items don't
  deserve menu entries.
- TDD: pure logic carries tests (`cargo test`, Vitest); the terminal and UI are
  verified by running the app — `cargo test` passing does not prove the UI works.
- All code, comments, commit messages, and documentation are written in English.
