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
  `save_window_state`, `cleanup_tab_status`, `cleanup_tab_notify`,
  `stash_pending_activation`, `activate_pending`) and the `claude:not-found` /
  `terminal:exit` / `status:update` / `notify:update` / `notify:activate`
  events. `build_spawn_env(captured, project_id, tab_id)` layers three sources
  for the spawned claude's env:
  (1) every variable from `shell_env::get()` (the interactive-shell snapshot —
  this is what brings `FNM_DIR` / `NVM_DIR` / `ASDF_*` / `MISE_*` and the
  shell's PATH, which is the only place fnm's per-shell node symlink ever
  appears); (2) `augment_path` prepends `extra_path_dirs` (Homebrew /
  `~/.local/bin` / `~/.cargo/bin` / ...) to that PATH as a safety net for
  users whose `.zshrc` doesn't set them up; (3) the `CLAUI_*` overlays
  (`CLAUI_ACTIVE`, `CLAUI_PROJECT_ID`, `CLAUI_TAB_ID`, `CLAUI_NOTIFY_FILE`,
  `CLAUI_STATUS_FILE`). Every claude tab gets its own
  `CLAUI_STATUS_FILE=status-<tabId>.json`; there is no `CLAUI_PRIMARY`.
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
  statusline JSON, watches `/tmp/claui/` for `status-<tabId>.json` files
  (one per claude tab), and emits one `status:update` per tab with payload
  `{ projectId, tabId, status }`. The wrapper writes a
  `{"projectId":…,"payload":<claude's verbatim JSON>}` envelope gated on
  `CLAUI_STATUS_FILE` + non-empty input — every in-claui claude tab writes
  its own file; there is no `CLAUI_PRIMARY` gate. `filename_to_tab_id` is a
  pure helper for extracting the tab id from the filename.
- `notify.rs` — the notification pipeline's Rust half. Pure helpers
  (`notify_file_path`, `filename_to_tab_id`, `parse`, `is_safe_tab_id`);
  `merge_hooks` idempotently injects claui's Claude `Notification` /
  `StopFailure` hooks into a project's `.claude/settings.local.json`
  (`Notification`+`idle_prompt` → `done`, `Notification`+`permission_prompt`
  → `attention`, `StopFailure` → `error`; the kind is the script's CLI arg);
  `install_script` writes `/tmp/claui/claui-notify.sh`; `purge_stale_files`
  wipes leftovers at startup. Each claude tab's hook writes
  `/tmp/claui/notify-<tabId>.json` = `{ projectId, kind }`. The
  `statusline.rs` watcher also calls `process_path`, which reads one file and
  emits `notify:update` with payload `{ projectId, tabId, kind }`. Like the
  statusline wrapper, the notify script does not gate on `CLAUI_PRIMARY` (which
  no longer exists) — every claude tab signals for itself.
- `sessions.rs` — reads a project's `claude` session files from
  `~/.claude/projects/<encoded>/` for the sessions sidebar.
- `capabilities.rs` — read-only snapshot for the capabilities sidebar:
  enabled plugins (joining `~/.claude/settings.json` `enabledPlugins` with
  `plugins/installed_plugins.json` install paths) and the skills/agents they
  ship, plus the effective hooks/permissions (global settings merged with the
  project's `.claude/settings.local.json`). Pure helpers (`resolve_enabled_plugins`,
  `skills_under`, `agents_under`, `flatten_hooks`, `flatten_permissions`) are
  `cargo test`-covered; the `read_capabilities_from` IO entry degrades every
  unreadable source to empty (never panics). Exposed as `get_capabilities`.
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
- `scroll/*` — one macOS-style overlay scrollbar shared by the terminal and the
  sessions/projects sidebar. `overlayScrollbarGeometry.ts` is the pure (tested)
  thumb math; `scrollSources.ts` adapts a native scroll element
  (`domScrollSource`) or an xterm `Terminal` (`xtermScrollSource`, via the public
  `onScroll`/`buffer.active`/`scrollToLine` API) to a common interface;
  `createOverlayScrollbar.ts` renders the thumb — invisible at rest, fades in on
  scroll or near the right edge, fades out when idle, stays up while hovered or
  dragged; the track is never drawn and never blocks the content.
  `useOverlayScrollbar.ts` is the sidebar's callback-ref hook. xterm 6 ships its
  own VSCode-style scrollbar that reveals on ANY mouse-over of the terminal — it
  and the native viewport scrollbar are hidden in `TerminalView.css` so only this
  overlay shows.
- `terminal/dropPaths.ts`, `terminal/activePty.ts`, `terminal/useFileDrop.ts`
  — file/image drag-and-drop. `useFileDrop` (called once in `App`) listens for
  the window-global `tauri://drag-drop` event and types the dropped paths into
  the active terminal's PTY. `dropPaths.formatDroppedPaths` POSIX-single-quote-
  escapes each path (so spaces and shell metacharacters are inert) and rejects
  any path with control characters (a raw newline is a tty line submission no
  quoting can neutralize). `activePty` is a module-level registry of the active
  terminal's PTY id; `TerminalView` registers via the `useActivePty` hook keyed
  on *activation* (active project × active tab), NOT DOM focus — a project
  switch never refocuses the new terminal, so focus-based routing would send
  drops to the previously-focused (hidden) terminal. The Tauri drag-drop
  handler is left ENABLED in `lib.rs` for this; it also suppresses WKWebView's
  default "navigate to the dropped file" behaviour.
- `notify/*` — the notification pipeline's webview half: `notifyStore.ts`
  (kinds, per-project worst-kind aggregation, OS-notify decision logic),
  `useNotifyByProject.ts`, `useWindowFocus.ts`, `useTabNotify.ts` (deep-link
  tab activation), `osNotification.ts`, `useListen.ts`. See the strip-channel
  notes under "Conventions" below.
- `updater/useUpdaterCheck.ts` + `updater/UpdateToast.tsx` — the auto-updater
  check and its toast. `project/ProjectPicker.tsx` + `project/pickProjectFolder.ts`
  — the empty-state folder picker.
- `theme/themeStore.ts` — the `Theme` TypeScript types, the built-in
  `defaultTheme`, and applying the theme to the app chrome via CSS variables.
- `layout/ProjectArea.tsx` — one project's terminal stack (workspace
  TabPanes + drawer). All open projects' `ProjectArea` instances are
  mounted simultaneously; the active one is marked `.is-active` (CSS class,
  not inline style), others are `visibility: hidden` on a
  `position: absolute; inset: 0` container so xterm geometry and scrollback
  survive a project switch. The window chrome — `WorkspaceTabBar`,
  `StatusBar`, `SessionsSection`, `CapabilitiesSection` — is rendered into
  App-level slots (`#workspace-tabs-slot`, `#status-slot`, `#sessions-slot`,
  `#capabilities-slot`) via `createPortal`, factored into the
  `layout/ProjectChrome.tsx` component (the four portals) which `ProjectArea`
  renders in one line; App tracks the slot nodes via `layout/useChromeSlots.ts`.
  The portals are gated on `isActive`, so only one
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
  `Cmd+1..9` for project switching at the App level.
- `status/useStatusByProject.ts` — listens to `status:update` events with
  the `{ projectId, tabId, status }` shape, aggregates them into a nested
  `Map<projectId, Map<tabId, StatusPayload>>` via a pure `aggregateStatus`.
  `App` slices the outer map per project and passes the inner map into each
  `ProjectArea`; `ProjectArea` selects the active tab's payload for the
  StatusBar. Referential stability (only the touched project's inner map gets
  a new reference; sibling projects keep identity) and field-by-field
  content-dedupe keep React.memo effective across per-tab status ticks.
- `status/StatusBar.tsx` — the bottom status bar (model, context, cost,
  limits), fed by the active project's status slice. Portaled into
  `#status-slot` at App-level by the active `ProjectArea`.
- `sessions/Sidebar.tsx` — the right-hand sidebar shell. A bare flex
  column wrapping `<ProjectsSection>` (rendered directly by `App`) on top,
  then `#sessions-slot` and `#capabilities-slot` (portal targets for the
  active project's `<SessionsSection>` and `<CapabilitiesSection>`). The two
  slots split the remaining height as independent scroll regions; the
  `.sidebar` is `position: relative` so the overlay scrollbars anchor to it.
- `sessions/SessionsSection.tsx` — the active project's session list,
  rendered as `<ListRow>`s. Portaled into `#sessions-slot` by the active
  `ProjectArea`. Each row carries the session title + relative-time meta;
  rows whose session is currently held by some workspace tab get a small
  `↗` badge.
- `capabilities/*` — the read-only capabilities panel: `useCapabilities.ts`
  (calls `get_capabilities` on mount + window focus, gated to the active
  project), `CapabilitiesSection.tsx` (collapsible Skills / Plugins / Agents /
  Hooks / Permissions `<details>` groups, per-group open state persisted to
  `localStorage`), `types.ts`, `capabilities.css`. Info-only — no toggles or
  actions. Portaled into `#capabilities-slot` by the active `ProjectArea`. MCP
  (claude.ai connectors live remotely) and Todos are deliberately out of scope.
- `sessions/ListRow.tsx` — the unified row used by both
  `ProjectsSection` and `SessionsSection`. One visual contract: label
  on the left (truncated with ellipsis), optional meta on the right,
  hover-revealed `×` close button when `onClose` is provided. Active state
  is a background highlight; the left-edge strip carries notification
  status (see the strip channel below), NOT active state.
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
  `projectId` so each project's `status:update` events are filtered by
  `projectId` and routed to the tab named by the event's `tabId`
  (cross-project status bleed is filtered out).
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
  drawer / sidebar toggles and the numeric tab switcher (`Ctrl+1..9`).
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
- The Tauri drag-drop handler is intentionally **enabled** (we do NOT call
  `.disable_drag_drop_handler()`): it is the only source of a dropped file's
  absolute path and it suppresses WKWebView's default "navigate to the dropped
  file" behaviour. An old comment claimed disabling it was REQUIRED for the
  title-bar `-webkit-app-region: drag`; a 2026-06-02 spike disproved that on the
  current Tauri — window drag and file-drop no longer conflict. Don't re-disable
  it (see `docs/DECISIONS.md` and the `terminal/` drag-drop modules above).
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
  `.claude/settings.local.json`; one file per tab), the sessions sidebar,
  workspace tabs (`Cmd+T` / `Cmd+Shift+T` / `Ctrl+1..9` / `Cmd+W`), and
  multi-project tabs (`Cmd+Shift+N` Add Project / `Cmd+Shift+W` Close Project
  / `Cmd+1..9` switch project). The sessions sidebar marks rows whose
  session is currently open in some tab. Open projects + the active one
  persist to `<app_config_dir>/window.json` and restore on next launch
  (workspace tabs inside a project do NOT persist; each restored project
  boots with one fresh primary claude). Notifications surface Claude events
  through a single strip channel (done / attention / error) on workspace tabs,
  sidebar rows, and the single-tab title-bar heading, plus focus-aware system
  notifications (see the strip-channel notes below). Workspace tabs share the
  title-bar width equally. Dropping a file or image onto the window inserts its
  path into the active terminal (and no longer lets WKWebView open the file in
  place of the app). Split panes, the dashboard, and a git panel are later
  phases.
- Every claude tab gets `CLAUI_ACTIVE=1`, `CLAUI_PROJECT_ID`, `CLAUI_TAB_ID`,
  `CLAUI_NOTIFY_FILE`, and its own
  `CLAUI_STATUS_FILE=/tmp/claui/status-<tabId>.json` in its env (see
  `src-tauri/src/ipc.rs::build_spawn_env`). The statusline wrapper writes a
  `{"projectId":…,"payload":<claude's verbatim JSON>}` envelope to
  `$CLAUI_STATUS_FILE` whenever the file is set and the input is non-empty —
  there is no `CLAUI_PRIMARY` gate; every claude tab self-reports its own
  status. The Rust watcher iterates `/tmp/claui/status-*.json` on every FS
  event and emits one `status:update` per file with payload
  `{ projectId, tabId, status }`; the webview's `useStatusByProject`
  aggregates them into `Map<projectId, Map<tabId, StatusPayload>>`. The
  bottom StatusBar and sidebar highlight follow the ACTIVE tab's payload
  (`ProjectArea` selects `statusByTab.get(activeUid)`). The tab "primary"
  flag survives only as the pinned/unclosable first tab in `tabsReducer` —
  it has no status-pipeline role.
- Notifications surface Claude events via a **single strip channel** — no dots.
  The pipeline: claui merges `Notification` / `StopFailure` hooks into each
  project's `.claude/settings.local.json` (`notify::merge_hooks`); when claude
  fires one, `claui-notify.sh <kind>` writes `/tmp/claui/notify-<tabId>.json` =
  `{ projectId, kind }` (env `CLAUI_NOTIFY_FILE` / `CLAUI_PROJECT_ID` /
  `CLAUI_TAB_ID` come from `build_spawn_env`); the `/tmp/claui` watcher emits
  `notify:update` with `{ projectId, tabId, kind }`; `useNotifyByProject`
  aggregates into `Map<projectId, Map<tabId, kind>>`. Three kinds: `done`
  (`--claui-notify-done` #0070F3, static), `attention` (`--claui-notify-attention`
  #FF990A, `claui-pulse-soft` 1.8 s), `error` (`--claui-notify-error` #DA3036,
  `claui-pulse-hard` 0.9 s); the channel is transparent (invisible) when idle —
  only a real signal paints it. `prefers-reduced-motion` disables the pulse. The channel is: the
  left-edge strip on sidebar rows (`ListRow.css`), the bottom underline on
  workspace tabs (`WorkspaceTabBar.css`), and a small colour bar beside the
  project name in the single-tab title-bar heading. **Colour = notification
  semantics only.** Active/selected state is shown by background highlight, not
  colour — `--claui-accent` (blue) is removed from all active-state styling and
  reserved exclusively for `done`. Per-project channel colour = worst kind across
  tabs (`worstKind`). In-app suppression: the strip is suppressed only for the
  exact tab being viewed while the window is focused; the signal is cleared on
  view via `markViewed`; closing a tab clears its entry and removes its temp file
  (`cleanup_tab_notify`, which whitelists the tab id charset to block path
  traversal). **System (OS) notifications** fire via `tauri-plugin-notification`
  only when the claui window is NOT focused, and only for `attention` and `error`
  (`done` is always silent). One notification per state-entry per project; a
  transition to a higher severity (attention → error) counts as a new entry;
  cleared on view. Click deep-link: JS `onAction` → Rust `activate_pending`
  (`show()` + `set_focus()` the main window, emit `notify:activate
  {projectId, tabId}`); App switches project, `useNotifyActivateTab` selects the
  tab. The pending target is stashed by `stash_pending_activation` before the
  banner shows (last-one-wins if multiple fire before a click). If OS permission
  is denied, claui degrades to in-app-only. `done` fires on `Notification`+
  `idle_prompt` (~60 s after turn end) — this is intentional: it means the user
  actually stepped away, not merely clicked Stop. Sound and preferences UI are
  deferred (no settings infra yet).
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
  traffic-light button remains the way to close the window. `Cmd+1..9`
  (project switch) is handled in `src/projects/useProjectSwitchKeyboard.ts`
  at the App level via a capture-phase keydown listener — nine items don't
  deserve menu entries.
- TDD: pure logic carries tests (`cargo test`, Vitest); the terminal and UI are
  verified by running the app — `cargo test` passing does not prove the UI works.
- All code, comments, commit messages, and documentation are written in English.
