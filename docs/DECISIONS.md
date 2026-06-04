# Architecture Decisions

This file records decisions that change architectural invariants, relax or tighten audit rules, or commit the project to a path that's costly to reverse. It's referenced from docs/AUDIT_RULES.md when those rules require an explicit decision to override.

Entries are append-only. Each entry has a date, a short title, context, the decision, and consequences.

---

### 2026-05-22 — Lint and documentation-discipline system imported from Tinker

**Context.** claui had no mechanical enforcement of file-size, complexity, or code-quality limits, and no written documentation-discipline rules — `npm run build` typechecked and `cargo build` compiled, but nothing capped file growth or flagged a stray `.unwrap()` in a command handler. The sibling project Tinker (also Tauri 2 + React + TypeScript) had a matured system built around the same constraint claui shares: the primary editor is Claude Code, so every edit is a first read, and smaller, well-documented files reduce drift.

**Decision.** Port the *universal* skeleton of that system, not Tinker's domain rules. Landed together: `eslint.config.js` (flat config — `max-lines` 250, `max-lines-per-function` 50 / 150 for `.tsx`, `complexity` 20, the `no-floating-promises` / `no-misused-promises` / `consistent-type-imports` / `no-explicit-any` quality set, the `no-unsafe-*` family off, React hooks rules); `src-tauri/Cargo.toml` `[lints.rust]` + `[lints.clippy]` (clippy `all` + `pedantic`, `unsafe_code = "forbid"`, pragmatic allows, `unwrap_used` allowed while `expect_used` + `panic` stay warned); `src-tauri/clippy.toml` (`too-many-lines-threshold = 50`); `.githooks/pre-commit` (staged-file typecheck + ESLint + Vitest + clippy + cargo test); and `docs/AUDIT_RULES.md` / `docs/DECISIONS.md`. Tinker-specific rules — CodeMirror extension handling, markdown-renderer bans, encryption seams, workspace-locking invariants — were excluded. AUDIT_RULES.md sections 2–7 are left reserved (numbered, empty) for claui-specific invariants (PTY ownership, the xterm.js VT boundary) that have not been written yet.

**Consequences.** `npm run lint`, `npm run typecheck`, `cargo clippy -- -D warnings`, and `cargo test` now gate every commit through `.githooks/pre-commit` (activated per-clone with `git config core.hooksPath .githooks`). Making the current code pass required small fixes, not just config: six clippy findings (`semicolon_if_nothing_returned`, `redundant_closure_for_method_calls`, `cast_possible_wrap`, `map_unwrap_or`, a test-only `.expect()` rewritten to `.unwrap()`, and one documented fatal-panic site in `lib.rs::run` that took `#[allow(clippy::expect_used)]` + a WHY comment), and three frontend fixes (two floating/misused promises voided in `App.tsx` and `ProjectPicker.tsx`; the `Channel` type re-routed through `commands.ts` so no component imports `@tauri-apps/api/core` directly). `unsafe_code = "forbid"` was verified safe — claui's own code contains no `unsafe`. No file or function needed a Section 9 exception; the codebase fits the limits as imported.

**References.** docs/AUDIT_RULES.md (Sections 1, 8–10), eslint.config.js, package.json, src-tauri/Cargo.toml `[lints.*]`, src-tauri/clippy.toml, .githooks/pre-commit, CLAUDE.md. Source system: the Tinker project.

---

### 2026-05-22 — AUDIT_RULES sections 2-3 populated with claui's architecture and frontend invariants

**Context.** The lint-system import (entry above) left AUDIT_RULES.md sections 2-7 reserved but empty. That left a gap: the IPC-funnel constraint was already enforced by `no-restricted-imports` in `eslint.config.js`, but no written R-rule documented it, and several load-bearing invariants lived only in `CLAUDE.md` prose or in code comments — places an audit prompt reads as background, not as checkable rules.

**Decision.** Section 2 (Architecture invariants) and Section 3 (Frontend conventions) are now populated with rules that codify invariants already true of the codebase: the `xterm.js` VT boundary and raw-bytes IPC contract (R2.1), single-owner PTY lifecycle (R2.2), the libghostty prohibition (R2.3), the `commands.ts` IPC funnel (R3.1 — the `[lint]` rule that finally names the existing ESLint check), the no-`StrictMode` omission (R3.2), the terminal font fallback (R3.3), and the stable-`open`-callback requirement (R3.4). No code changed and no new invariant was introduced — the rules document existing decisions so periodic audits can check them. Sections 4-7 remain reserved.

**Consequences.** `/review` and `/ultrareview` now have claui-specific `[review]` rules to check, not just the generic Section 1 limits. R3.1 closes the lint/doc gap — the ESLint restriction now has a named rule behind it. Future changes to these invariants require the Section 10 update discipline (a DECISIONS.md entry for anything that changes what is allowed).

**References.** docs/AUDIT_RULES.md Sections 2-3. eslint.config.js (`no-restricted-imports`, R3.1). CLAUDE.md "Architecture" and "Conventions and non-obvious points".

---

### 2026-05-25 — Workspace tabs (phase 3a)

**Context.** The single-claude window couldn't host multiple parallel sessions or quick context switches. Tabs were the first named item in the "Planned" list in README.md and the forward roadmap in the v1 spec.

**Decision.** The Layout switches to a tab-driven scaffold. The top of the window now carries a 38px project tab strip + a 28px workspace tab strip; the workspace area renders every open tab's `<TerminalView>` simultaneously with the active one `visibility: visible` and inactives hidden; the status bar moves to the bottom of the window. The first claude tab of each open project is pinned ("primary") — it has no close affordance and `Cmd+W` on it is a no-op (the `useLayoutKeyboard` hook swallows the event so the macOS Window menu's Cmd+W → close_window binding doesn't reach it). The status bar is locked to the primary claude's session — only the primary claude's wrapper script writes the global status file, gated on a new `CLAUI_PRIMARY=1` env marker.

**Consequences.** The two-strip layout (project on top, workspace below) cleanly nests the two axes and matches macOS app conventions (Safari, Terminal.app, iTerm). Pinning the primary tab gives the project a guaranteed-alive `claude` whose status the bar can always reflect — that single source of truth avoids the per-tab statusline routing complexity that a fully decoupled design would require, deferring it to a later phase. New module `src/tabs/` follows the established `src/<domain>/` layout. The keydown handler was extracted into `src/layout/useLayoutKeyboard.ts` to keep `Layout.tsx`'s function body under R1.5's 150-line `.tsx` cap. Scope cut for 3a: multiple projects alive simultaneously, split panes inside a tab, browser-type tabs, drag-to-reorder, persistence across launches, per-tab status bar, automatic sessionId discovery for fresh non-primary tabs.

**References.** `src/tabs/`, `src/layout/useLayoutKeyboard.ts`, `src/sessions/useSessionsPolling.ts`, `src-tauri/src/ipc.rs` (`build_spawn_env`, `CLAUI_PRIMARY`). Spec: `docs/superpowers/specs/2026-05-25-project-tabs-design.md` (gitignored; local-only).

---

### 2026-05-25 — Tab chrome collapses when there is no choice; ⌘ shortcuts move into the File menu

**Context.** Right after Phase 3a shipped, the default state (one project, one claude) showed two stacked tab strips — a 38px project bar with a single `claui` tab and a 28px workspace bar with a single `claude` tab — totalling ~66px of vertical chrome that didn't inform anything. Polished-app convention is that chrome appears only when it represents a choice; with one item there's nothing to choose. Hiding the bars surfaced a discoverability question: with no visible `＋` affordance, how does a new user learn to open another tab?

**Decision.** Two coupled changes. (1) The `<ProjectTabBar>` component is deleted (Phase 3a is always single-project; the component will be reconstructed in Phase 3b when multi-project lands). `<WorkspaceTabBar>` returns `null` when `tabs.length <= 1`, so the bar appears the moment a second tab is created and disappears when it's closed. (2) `Cmd+T` / `Cmd+Shift+T` / `Cmd+W` are removed from the webview's keydown handler and re-bound as macOS File menu items (New Claude Tab / New Terminal Tab / Close Tab) in `src-tauri/src/menu.rs`. The menu accelerators are intercepted by macOS before the webview, and the Rust side emits `menu:new-claude-tab` / `menu:new-shell-tab` / `menu:close-tab` events that `Layout` subscribes to. The Window submenu's predefined `.close_window()` is dropped to avoid a `Cmd+W` accelerator collision; the red traffic-light remains the way to close the window.

**Consequences.** The default state of claui is now chrome-free for the single-task case — only the bottom status bar and the right sessions sidebar remain (and the sidebar is already user-toggleable via `Ctrl+B`). Discoverability lives in the macOS menu bar: any Mac user looking for the keyboard shortcut will find `File → New Claude Tab ⌘T` exactly where they expect. The JS keyboard handler (`src/layout/useLayoutKeyboard.ts`) shrinks to drawer/sidebar toggles plus the numeric tab switcher (`Cmd+1..9`) — `keyboardEventToAction` in `src/tabs/keyboard.ts` correspondingly drops its `newClaudeTab` / `newShellTab` / `closeActive` variants and the test file loses three tests. The "primary tab is unclosable" invariant now lives entirely in `tabsReducer` (its `closeTab` action on a primary returns the state unchanged) — the manual `preventDefault` swallow in `useLayoutKeyboard` was no longer needed once `Cmd+W` left the JS keydown handler. `<ProjectTabBar>`, its CSS, and `src/tabs/basename.ts` are deleted; Phase 3b will reconstruct them from the spec.

**References.** `src-tauri/src/menu.rs` (the four File items and their `on_menu_event` arm), `src/tabs/WorkspaceTabBar.tsx` (the null-render guard), `src/tabs/keyboard.ts`, `src/layout/useLayoutKeyboard.ts`, `src/layout/Layout.tsx` (the three new event listeners). The earlier 2026-05-25 tabs entry above is unchanged.

---

### 2026-05-26 — Multi-project tabs (phase 3b)

**Context.** Phase 3a deferred "multiple projects alive simultaneously" — the window held exactly one open project, and `File → Open Project` / the title-bar `＋` replaced it, destroying all of its workspace tabs. Switching contexts meant restarting from scratch.

**Decision.** The window now holds N projects at once. `App.tsx` owns a new `useProjects` hook (`src/projects/useProjects.ts`) keyed off a new `<app_config_dir>/window.json` (versioned, atomic tmp+rename, debounced 250 ms). `last_project.txt` is retired; `get_last_project` is removed from Rust IPC and replaced by `get_window_state` / `save_window_state` / `cleanup_project_status`. Each project gets its own `<ProjectArea>` (today's `Layout.tsx` renamed, with `<TitleBar>` lifted up to App); all ProjectAreas stay mounted, the inactive ones hidden with `visibility: hidden` on a `position: absolute; inset: 0` container so xterm geometry and scrollback survive a switch. The 32px TitleBar drops its project-name slot and instead hosts a `<ProjectTabBar>` (`src/projects/ProjectTabBar.tsx`) — clickable tabs with hover-close, plus a `＋` add button. Per-project statusline routing: each primary claude is spawned with `CLAUI_STATUS_FILE=/tmp/claui/status-<projectId>.json` in addition to `CLAUI_PRIMARY=1`; the wrapper script now reads the path from env; the Rust watcher (`statusline.rs::start_watcher`) iterates `status-*.json` on every FS event and emits one `status:update` per file with payload `{ projectId, status }`. The webview's `useStatusByProject` aggregates events into `Map<projectId, StatusPayload>`; `useTabs(projectPath, projectId)` filters by `projectId`. Each `ProjectArea` subscribes to `menu:new-claude-tab` / `menu:new-shell-tab` / `menu:close-tab` only when `isActive`; `useLayoutKeyboard` gained an `enabled` flag with the same gate. Window-level shortcuts: `Cmd+Shift+N` (Add Project, via File menu) replaces the old `Cmd+O Open Project`; `Cmd+Shift+W` (Close Project, via File menu) is new; `Cmd+Alt+1..9` (project switch, via webview keydown in `src/projects/useProjectSwitchKeyboard.ts`) is new. The TitleBar toolbar swaps its old `IconFolderOpen` for a new `IconFolderStack` add-project button (with `Cmd+⇧+N` tooltip); the `Cmd+T`/`Cmd+⇧+T` toolbar buttons now go through `emit('menu:new-*-tab')` so the active ProjectArea's existing subscription handles them.

**Consequences.** Switching projects is now an `O(1)` visibility flip — no PTY churn, no terminal restart, no scrollback loss. Each project's status, sessions sidebar, drawer (`Ctrl+\``, now per-project), and workspace tab list are independent. Workspace tabs inside projects are still not persisted across launches (3a rule continues); each restored project boots with one fresh primary claude. Memory cost scales linearly with `projects × workspace_tabs` xterm instances — DOM-renderer instances are a few MB each, so 5 projects × 5 tabs = ~25 instances is well within budget; if multi-tens-instance workflows emerge later, switching inactive projects to `display: none` with state save/restore is the next escape valve. `tabsReducer`'s `resetForProject` action is deleted (each ProjectArea mounts once with a fixed path, so the prev-project tracker in `useTabs` is gone too). `App.tsx` is now ~115 lines (under R1.1) and renders TitleBar + ProjectTabBar + N ProjectArea siblings; the old single-Layout flow is removed. New modules: `src/projects/` (types, projectsReducer, useProjects, useProjectSwitchKeyboard, ProjectTabBar), `src/status/useStatusByProject.ts`, `src-tauri/src/window_state.rs`. The wrapper script becomes a `&'static str` (no Rust `format!` to embed paths). Pre-existing `last_project.txt` files become dead on first launch after upgrade — the user sees `ProjectPicker` once, then the new persistence layer takes over. Scope cut for 3b: workspace-tab persistence inside projects, drag-to-reorder project tabs, project overflow handling beyond `overflow: hidden`, recent-projects submenu on `＋`, cross-project session list, per-project window title, confirmation modal on close, per-project theme overrides.

**References.** `src/projects/` (new), `src/status/useStatusByProject.ts` (new), `src-tauri/src/window_state.rs` (new), `src/layout/ProjectArea.tsx` (renamed from `Layout.tsx`), `src-tauri/src/statusline.rs` (per-project wrapper + watcher), `src-tauri/src/ipc.rs` (`build_spawn_env(is_primary, project_id)`, new IPC commands, `get_last_project` removed), `src-tauri/src/menu.rs` (Add/Close Project items), `src/layout/useLayoutKeyboard.ts` (`enabled` flag), `src/App.tsx` (rewired). Spec: `docs/superpowers/specs/2026-05-26-multi-project-tabs-design.md` (gitignored; local-only). Plan: `docs/superpowers/plans/2026-05-26-multi-project-tabs.md` (gitignored; local-only).

---

### 2026-05-27 — Unified sidebar; chrome moved to App level via portals

**Context.** The first 3b implementation (entry above) put project tabs in the title bar and left the per-project chrome (workspace tab bar, sessions sidebar, status bar) inside each `<ProjectArea>`. Visually this produced two parallel horizontal tab strips of equal weight — project tabs in the title bar, workspace tabs below — which read as "navigation salad" rather than a clear two-axis hierarchy. The active workspace pane of an inactive project also bled through `visibility: hidden` because `.layout-tab-pane.active { visibility: visible }` defeated the parent's hidden inheritance. Per-project polling + `setSidebarOpen` state also fragmented control of the single shared right panel across N projects.

**Decision.** All window-level chrome moves to App level. The title bar's centre becomes `#workspace-tabs-slot`, an empty `<div>` that the active `<ProjectArea>` portals its `<WorkspaceTabBar>` into via `createPortal`. Status bar and the sessions section follow the same pattern (`#status-slot`, `#sessions-slot`). The right sidebar is composed by App: `<ProjectsSection>` at the top (App-level data, hidden when only one project is open), then a divider, then `#sessions-slot` for the active project's session list. Both sections render as `<ListRow>` — a single visual contract: label, optional right-aligned meta (timestamp), accent strip on the left when active, hover-revealed `×` for closeable rows. `<Sidebar>` is now a bare children-only container. `setSidebarOpen` is lifted to App; `useLayoutKeyboard` receives it via props (the previous per-project copy was always going to fight for ownership of a single shared panel). `IconFolderStack` (the toolbar's "add project" button) is deleted — the sidebar's `+ Add` row is now the single add-project surface, with `Cmd+⇧+N` and `File → Add Project` remaining as keyboard / menu paths.

Workspace-tab visuals are unified with the toolbar: the `✦` / `$` text glyphs are replaced by the same `<IconClaudeMascot>` and `<IconTerminal>` SVGs the toolbar uses. The visibility-inheritance bug (active workspace pane of hidden project bleeding through) is fixed by gating the override on `.project-area.is-active .layout-tab-pane.active` — the override only applies inside the active project. Status bar moves back to the bottom (a previous attempt to place it under the title bar didn't read as well in practice — that pivot lasted ~one session and is reverted).

**Consequences.** The right sidebar is now a single coherent navigation panel — projects above, sessions below, both with identical row geometry. `ProjectsSection` returns `null` when `projects.length < 2`, so the single-project case has no projects list visible (no choice to surface) — same `tabs.length < 2` guard the workspace tab bar already used. The portal pattern keeps data ownership per-project (`useTabs`, `useSessionsPolling` stay inside `ProjectArea`) while making the active project's chrome appear at App-level positions. The `usePortalSlot(id)` helper uses `useState(null) + useEffect` so the portal target is resolved after the parent commits — one frame's delay, imperceptible. `ProjectTabBar` and its CSS are deleted. The two visual-language surfaces are now: `<ListRow>` (right-sidebar rows) and `.ws-tab` (workspace tabs in title bar) — the rest of the chrome (status bar, title bar, project picker) is the same as before.

**References.** `src/sessions/ListRow.tsx` + `.css` (new). `src/projects/ProjectsSection.tsx` (new). `src/sessions/SessionsSection.tsx` (new). `src/layout/ProjectArea.tsx` (portals via `createPortal`). `src/layout/TitleBar.tsx` (`#workspace-tabs-slot`, `IconFolderStack` dropped). `src/sessions/Sidebar.tsx` (children-only shell). `src/App.tsx` (composes `<ProjectsSection>` + sidebar slots, owns `sidebarOpen`). Deleted: `src/projects/ProjectTabBar.tsx` + `.css`.

---

### 2026-05-28 — Capture interactive shell env at app start

**Context.** `build_spawn_env` in `src-tauri/src/ipc.rs` seeded spawned claudes with `PATH = extra_path_dirs(home) ∪ launchd_PATH`. That covered Homebrew, `~/.local/bin`, `~/.cargo/bin` — anything installed at a *static* directory — but every shell-driven version manager (fnm, nvm, asdf, mise, volta, rbenv, pyenv) lives at a dynamic path the user's `.zshrc` materialises via `eval "$(fnm env)"` or equivalent. Those paths only existed inside an interactive shell, so claude (and every Bash subshell its tools opened) saw a stripped-down environment where `node` / `npm` / `python` (under pyenv) / `ruby` (under rbenv) were invisible. The user dogfooding claui kept hitting this — running tools that worked fine in their Terminal failed inside claui's pane. "Base of the app, should work out of the box."

**Decision.** New module `src-tauri/src/shell_env.rs` runs `$SHELL -i -l -c '<sentinel script>'` once at app start (warmed on a bg thread from `lib.rs::run`'s setup so the 50-200 ms cost overlaps with window paint), parses the `env -0` block between sentinels, caches the result in a `OnceLock<HashMap<String, String>>`. `build_spawn_env(captured, is_primary, project_id)` now layers three sources: (1) every variable from `shell_env::get()` minus a STRIP list of session locals (`SHLVL`, `PWD`, `OLDPWD`, `_`, `TERM`, `XPC_FLAGS`, `XPC_SERVICE_NAME`); (2) `augment_path` prepends `extra_path_dirs` to the captured PATH (or to launchd PATH if capture failed) as a safety net; (3) the `CLAUI_*` overlays. The capture script uses `__CLAUI_ENV_BEGIN__` / `__CLAUI_ENV_END__` sentinels to defuse `.zshrc` chatter (motd, p10k instant prompt, welcome banners) and a 5 s timeout to defuse `.zshrc` hangs. On any failure (spawn error, timeout, missing sentinels, shell crash) the capture returns an empty map and `build_spawn_env` falls back to today's `augment_path`-only behaviour.

**Consequences.** fnm / nvm / asdf / mise / volta / rbenv / pyenv users now see their actively-managed `node`/`npm`/`python`/`ruby` from inside claui without any setup — the spawned claude inherits the same environment a hand-typed `claude` in Terminal would inherit, plus claui's own overlays. The fix is generic (not a fnm-specific patch), so future version managers Just Work. Same trick the VSCode / Cursor / Warp / GitHub Desktop family uses via the npm `shell-env` package. Cost: one `$SHELL` invocation at app start (typical ~100 ms, hard-capped at 5 s), captured shell env held in memory for the app's lifetime. The shell-init snapshot is frozen at app start — if the user edits `.zshrc` mid-session they must restart claui to pick up the change (same as VSCode). `build_spawn_env`'s signature gained a `&ShellEnv` parameter for test determinism (the production call passes `shell_env::get()`); unit tests construct synthetic maps and never touch the real `$SHELL`. Fish-shell-specific syntax is out of scope; modern macOS defaults to zsh and `$SHELL -i -l -c` works for bash too. Re-capture on `.zshrc` changes (file watcher / SIGHUP) is out of scope.

**References.** `src-tauri/src/shell_env.rs` (new), `src-tauri/src/ipc.rs` (`build_spawn_env` signature + layering), `src-tauri/src/lib.rs` (`shell_env::warm()` in setup). `CLAUDE.md` (`shell_env.rs` module entry, `build_spawn_env` description). Spec: `docs/superpowers/specs/2026-05-28-shell-env-capture-design.md` (gitignored; local-only).

---

### 2026-06-01 — Numeric switchers remapped; New-Tab accelerators swapped

**Context.** Tab switching was `Cmd+1..9` and project switching the awkward two-modifier `Cmd+Alt+1..9`. The user wanted each on a single modifier and discoverable.

**Decision.** Tabs → `Cmd+1..9` (`src/tabs/keyboard.ts`) — matching the universal macOS/browser tab convention (Safari/Chrome/iTerm/Terminal) — and projects → `Ctrl+1..9` (new pure mapper `src/projects/projectSwitchKey.ts`, used by `useProjectSwitchKeyboard`). `9` keeps the Chrome "last" convention. The two are mutually exclusive (tabs require Cmd and reject Ctrl; projects the reverse). The `e.code` Option-transmutation workaround is dropped (no Option in the new binding). Separately, the New-Tab menu accelerators were swapped: `Cmd+T` now opens a terminal tab, `Cmd+Shift+T` a Claude tab.

**Consequences.** `Ctrl+digit` no longer reaches the terminal (rarely-used control input), consistent with how `Cmd+digit` was already intercepted in capture phase. Holding either `Cmd` or `Ctrl` ~350 ms surfaces the hint badges on both tabs (`⌘N`) and projects (`⌃N`) (see `src/layout/useHeldModifier.ts`). `Ctrl+\`` and `Ctrl+B` are unaffected.

**References.** `src/tabs/keyboard.ts`, `src/projects/projectSwitchKey.ts`, `src/projects/useProjectSwitchKeyboard.ts`, `src-tauri/src/menu.rs`, `CLAUDE.md`. Spec: `docs/superpowers/specs/2026-06-01-numeric-switching-and-hud-design.md` (gitignored; local-only).

---

### 2026-06-02 — Notifications via Claude hooks, visual-only v1

**Context.** A claude tab running unattended (in a background workspace tab or an inactive project) gave no signal when it finished, needed permission, or failed. The window held N projects × M tabs simultaneously, so "which session wants me" was invisible until the user clicked through each one. The obvious detector — the terminal bell (`\a`) — carries no meaning: a bell can't distinguish "done waiting for a prompt" from "asking permission" from "errored", and claui's xterm.js owns VT parsing while Rust never sees the byte stream anyway.

**Decision.** Detect Claude events via Claude **hooks**, not the bell. claui idempotently merges `Notification` (matcher `idle_prompt` → `done`, `permission_prompt` → `attention`) and `StopFailure` (→ `error`) hooks into each project's `.claude/settings.local.json` (`notify::merge_hooks`), each pointing at `/tmp/claui/claui-notify.sh <kind>`. The hook writes `/tmp/claui/notify-<tabId>.json` = `{ projectId, kind }`; the existing `/tmp/claui` watcher calls `notify::process_path`, emitting `notify:update` with `{ projectId, tabId, kind }`. The webview (`src/notify/`) aggregates into `Map<projectId, Map<tabId, kind>>` and renders per-tab dots + urgent strips and per-project aggregate dots (worst kind wins). Per-tab attribution uses a new `CLAUI_TAB_ID` env var injected by `build_spawn_env`; unlike the statusline wrapper the notify script does NOT gate on `CLAUI_PRIMARY`, so every claude tab signals independently. v1 is **visual-only** — sound is deferred (no settings infrastructure yet to make it configurable). `preferredNotifChannel` is intentionally left untouched (the `Notification` hook fires independently of the notification channel). `cleanup_tab_notify` validates `tab_id` against a charset whitelist (`is_safe_tab_id`) to prevent path traversal when the id comes from an IPC caller.

**Consequences.** Hooks give semantic kinds the bell never could — the dot colour distinguishes done / attention / error. Each tab attributes its own signal, so a backgrounded tab three projects deep still surfaces. The cost: claui now writes Claude hooks into project settings (idempotent, preserving the user's own hooks). The signal is suppressed for / cleared on the tab being actively viewed while the window is focused (tracked via window-focus + `markViewed`), and closing a tab clears its entry and temp file. Deferred: sound, OS-level notifications, terminal-bell detection, and the `SubagentStop` / `auth_success` events. If `idle_prompt` proves unreliable in practice, the `done` row can be swapped for a `Stop` hook (noted in `notify.rs`).

**References.** `src-tauri/src/notify.rs` (new), `src-tauri/src/statusline.rs` (watcher calls `process_path`), `src-tauri/src/ipc.rs` (`build_spawn_env` injects `CLAUI_TAB_ID` / `CLAUI_NOTIFY_FILE`, `cleanup_tab_notify` command, hook merge in `open_project`), `src/notify/` (`notifyStore.ts`, `useNotifyByProject.ts`, `useWindowFocus.ts`, `useTabNotify.ts`), `src/tabs/WorkspaceTabBar.tsx`, `src/sessions/ListRow.tsx`, `src/projects/ProjectsSection.tsx`, `src/theme/themeStore.ts` (`--claui-notify-*` vars). Spec: `docs/superpowers/specs/2026-06-01-claude-notifications-design.md` (gitignored; local-only).

---

### 2026-06-02 — Notifications redesign: strip-channel model + system notifications

**Context.** The v1 notification UI (per-tab dots + urgent bottom strip, per-project aggregate dot) conflated two separate concerns: notification state and selected state both used the blue `--claui-accent` colour. Blue on an active tab meant "you are here"; blue on an inactive tab meant "done". With the dot model live and verified, the user requested a cleaner single-channel design that reserves colour for notification semantics and signals selected state through background highlight only — matching the VSCode/Linear convention.

**Decision.** Three coupled changes. (1) **Strip channel replaces dots.** A single indicator channel per surface: the left-edge strip on sidebar rows (`ListRow.css`), the bottom underline on workspace tabs (`WorkspaceTabBar.css`), and a small colour meta indicator beside the project name in the single-tab title-bar heading. The channel idles at a dim grey (`--claui-notify-rest`), then blue (`--claui-notify-done`, static) / orange (`--claui-notify-attention`, `claui-pulse-soft` 1.8 s) / red (`--claui-notify-error`, `claui-pulse-hard` 0.9 s) as kinds arrive; `prefers-reduced-motion` disables the pulse. (2) **Colour reserved for notification semantics only.** `--claui-accent` (`#0070f3`) is removed from all active/selected styling (tab underline, active tab glyph, sidebar active strip); active state moves to background highlight + brighter text/icon. Blue is now done-only. The `done` kind is intentionally assigned blue (informational), not green ("success" would be semantically wrong). Signal sources, in-app suppression, and per-project worst-kind aggregation are unchanged. (3) **System (OS) notifications added** using `tauri-plugin-notification` + `notification:default` capability. Gate: fires only when the claui window is NOT focused (coarser than in-app per-tab suppression). Kinds: `attention` and `error` only; `done` is always silent. Frequency: one notification per state-entry per project — cleared on view, re-fires on re-entry. A transition to a higher severity (attention → error) counts as a new state entry; lower-severity arrivals while a higher is active are ignored. Click deep-link: JS `onAction` handler → Rust `activate_pending` (`show()` + `set_focus()` the main window, emit `notify:activate {projectId, tabId}`); App switches project, `useNotifyActivateTab` selects the tab. The pending target is stashed via `stash_pending_activation` before the OS banner shows; the stash holds a single target (last-one-wins if multiple notifications fire before a click). If OS permission is denied, claui degrades to in-app-only.

**Consequences.** One visual language: colour = notification kind, background = selection. The blue/active collision is gone — blue seen anywhere in the chrome means "claude finished and is waiting". The `done` signal still fires on `idle_prompt` (~60 s after turn end), which is the intended semantics: it means "you actually stepped away", not "you clicked Stop". OS notifications let the user act on blocked or errored sessions without ever switching back to the claui window. Sound and preferences UI remain deferred (no settings infrastructure yet). The "last-one-wins" activation stash is an accepted trade-off for v1.

**References.** `src-tauri/src/notify.rs` (pure helpers unchanged; `stash_pending_activation` / `activate_pending` added), `src-tauri/src/ipc.rs` (new commands, `build_spawn_env` unchanged; `stash_pending_activation` command backed by `AppState.pending_activation` in `src-tauri/src/state.rs`), `src-tauri/src/lib.rs` (notification plugin registration), `src/notify/notifyStore.ts` (OS-notify gating + `decideOsNotify` / `clearOsNotified`), `src/ipc/commands.ts` (`stashPendingActivation` typed wrapper for the activation stash), `src/notify/useTabNotify.ts` (deep-link handler `useNotifyActivateTab`), `src/tabs/WorkspaceTabBar.tsx` + `.css` (underline channel, bg active), `src/sessions/ListRow.tsx` + `.css` (strip channel, bg active), `src/App.css` (`--claui-notify-rest` token, pulse keyframes). Spec: `docs/superpowers/specs/2026-06-02-notifications-redesign-design.md` (gitignored; local-only).

---

### 2026-06-02 — Enable the Tauri drag-drop handler for file drops

**Context.** Dropping a file onto the window made WKWebView navigate to it (`file://…`), replacing the app UI with no way back. claui called `.disable_drag_drop_handler()` in `lib.rs`, whose comment claimed disabling was REQUIRED for the title-bar `-webkit-app-region: drag` to move the window (Tauri's handler was said to intercept pointer events before the drag-region check). That handler is also the only source of a dropped file's absolute path, so the claim, if true, would force a temp-file workaround.

**Decision.** A spike re-enabled the handler and verified, on the current Tauri, that the window still drags from the title bar AND the file no longer hijacks the UI — the old conflict no longer exists. So the handler stays ENABLED. Dropping files emits `tauri://drag-drop` with absolute paths; the webview-side `useFileDrop` hook formats them (`formatDroppedPaths`: each path POSIX single-quote-escaped so spaces and shell metacharacters like `$(...)`/backticks are inert, space-joined, trailing space; paths containing control characters are rejected because a raw newline is a tty line submission no quoting can neutralize) and types them into the focused terminal's PTY via `pty_input`. The target PTY is tracked by a tiny module-level registry (`src/terminal/activePty.ts`, via the `useActivePty` hook) keyed on the window's ACTIVE terminal — active project × active tab — NOT on DOM focus, because the drag-drop event is window-global with no DOM target and a project switch never refocuses the new terminal. Insertion targets the visible active tab's terminal and works for both claude and shell tabs (it is just text). The drawer command terminal is not a drop target.

**Consequences.** Files dropped anywhere on disk insert their real path — no temp copies, no path loss. The navigation bug is fixed for free (the handler suppresses WKWebView's default). The obsolete `disable_drag_drop_handler` invariant in `lib.rs` is removed and replaced with the enabled-handler rationale. Trade-off accepted: routing by focus (not drop coordinates) means a drop lands in the terminal that "has the cursor"; if no terminal is focused the drop is a no-op. Image-from-clipboard paste (Cmd+V) remains the path for in-memory images.

**References.** `src-tauri/src/lib.rs` (handler enabled), `src/terminal/dropPaths.ts` + `.test.ts` (pure helper, TDD), `src/terminal/activePty.ts` (registry + `useActivePty`), `src/terminal/useFileDrop.ts`, `src/terminal/TerminalView.tsx` (surfaces its PTY id + calls `useActivePty`), `src/layout/TabPane.tsx` + `src/layout/ProjectArea.tsx` (thread `isActiveTerminal`), `src/App.tsx` (`useFileDrop()`). Spec: `docs/superpowers/specs/2026-06-02-tabs-and-dnd-design.md`; plan: `docs/superpowers/plans/2026-06-02-tabs-and-dnd.md` (both gitignored; local-only).

---

### 2026-06-04 — Sessions sidebar: last-activity from the last message, not mtime

**Context.** The sessions sidebar showed and sorted each session by `last_activity`, defined as the session file's mtime. But `claude --resume` and various housekeeping records (`permission-mode`, `pr-link`, `file-history-snapshot`, `system`, ...) rewrite the JSONL without any new conversation turn, bumping the mtime. Result: merely reopening (or even just touching) an old session moved it to the top of the list and updated its time, which the user reported as wrong. An empirical scan of real session files confirmed mtime runs minutes-to-an-hour ahead of the last actual message, and idle/resumed files end in a no-conversation record.

**Decision.** `SessionInfo.last_activity` is now the max `timestamp` across `user` / `assistant` records only — the last real conversation turn — falling back to the file's mtime only when a session has no turns yet. Crucially the max is taken over `user` / `assistant` records ONLY: `system` and `pr-link` records also carry timestamps and are written on resume, so "max over all timestamped records" would not fix the bug. `sessions.rs` gains a single-pass `scan_session` (replacing `extract_title`, which folds in) plus a hand-rolled `parse_iso_millis` / `days_from_civil` (claude's timestamps are a fixed `YYYY-MM-DDTHH:MM:SS[.fff]Z` UTC format, so no `chrono` dependency). The `(mtime_ns, size)` cache fingerprint is unchanged — a metadata-only write still invalidates the cache and triggers a re-scan, but the recomputed `last_activity` stays put because no turn was added.

**Consequences.** Reopening an old session no longer reorders the list or updates its time — order reflects conversation recency, which is stable across resumes. Trade-off: a session that is resumed and left idle keeps the timestamp of its last message even though its file was just touched (intended). A separate, pre-existing fix in the same area: the sidebar's highlighted ("active") session is now derived from the active tab's `sessionId` rather than the project's primary-only status payload, so switching tabs highlights the correct session.

**References.** `src-tauri/src/sessions.rs` (`scan_session`, `parse_iso_millis`, `days_from_civil`, `SessionInfo.last_activity` doc + tests), `src/layout/ProjectArea.tsx` (`activeSessionId` from the active tab). No AUDIT_RULES rule changed.

---

### 2026-06-04 — Statusline write cadence measured: idle is free; per-tab fan-out is cleared

**Context.** Before migrating the status pipeline from one-file-per-project to
one-file-per-tab (see the local spec `docs/superpowers/specs/2026-06-04-per-tab-status-design.md`),
the open question was whether fanning the status file out per tab would
reintroduce the 80–100 % idle CPU that originally forced the per-project
consolidation (`statusline.rs` watcher comment). The fear was N tabs × frequent
statusline rewrites.

**Decision.** Measure first. A background probe md5-polled
`$TMPDIR/claui/status-*.json` at 5 Hz for ~8 minutes against the real running app
with **4 projects open**. Result: the statusline is **event-driven, not
timer-driven** — over ~7 minutes of idle, the idle projects' files were rewritten
**zero** times and `claui`-process CPU sat at ~0; the only file that changed
belonged to an actively-working claude (~0.1 writes/s, peak 2-in-2s); launch is a
one-time 2–3-writes-per-project burst. So the per-tab multiplier at idle is
N × 0 = 0, and steady-state cost tracks the number of *simultaneously active*
claudes (≈1), not the number of open tabs. The old 80–100 % CPU was purely the
full-dir-scan amplification bug defeating `React.memo`, never the write cost.
Conclusion: **per-tab status is cleared on performance grounds**; the real risk is
implementation correctness, not physical load.

**Consequences.** The per-tab migration may proceed. The load-bearing safeguards
are therefore correctness invariants, not throttling: (1) referential stability in
the nested `Map<projectId, Map<tabId, StatusPayload>>` so one tab's update never
re-renders an unrelated project; (2) a reducer change-guard so a tab's
`sessionId` only mutates state when it actually changes; (3) only the active tab's
payload feeds the `StatusBar`; (4) keep per-path emits (no full-dir scan) and the
existing field-by-field JS dedupe. An optional wrapper-side skip-on-equal is a
minor extra (the JS dedupe already keys on parsed fields, which are stable at
idle). The regression acceptance check (2 projects × 2 idle tabs must not raise
CPU vs today) stays as the guard; the hybrid scope remains the documented fallback
if it ever fails. This entry exists so the perf question is not reopened from
first principles — it was measured, not argued.

**References.** Spec `docs/superpowers/specs/2026-06-04-per-tab-status-design.md`
(gitignored; local-only), "Measured baseline (2026-06-04)" section.
`src-tauri/src/statusline.rs` (the per-project pipeline measured), `src/status/useStatusByProject.ts`
(the JS dedupe relied upon). No code changed by this entry.

---

### 2026-06-04 — Per-tab status pipeline (per-project → per-tab)

**Context.** The status pipeline (phase 3b, 2026-05-26) was primary-only: a single `status-<projectId>.json` file written exclusively by the project's primary claude, gated on `CLAUI_PRIMARY=1`. This meant every non-primary tab had no status payload, so the bottom StatusBar always showed the primary's model/context/cost numbers even when the user was looking at a different tab. Fresh non-primary tabs had no `sessionId` in the tabs reducer until the primary emitted one (it never would for a different session), creating a latent hazard where two tabs could try to resume the same session via the sessions sidebar. The 2026-06-04 cadence-measurement entry (see below) confirmed that statusline writes are event-driven, not timer-driven, so fanning to N tab files incurs N × 0 idle cost — the per-tab multiplier is safe.

**Decision.** Migrated to one file per claude tab, mirroring the notify pipeline. Each claude tab receives its own `CLAUI_STATUS_FILE=/tmp/claui/status-<tabId>.json`; `CLAUI_PRIMARY` is removed entirely. The wrapper script writes a `{"projectId":…,"payload":<claude's verbatim JSON>}` envelope gated only on `CLAUI_STATUS_FILE` + non-empty input. `StatusUpdate` gains `tab_id` (`{ project_id, tab_id, status }`). `process_path` in `statusline.rs` uses `filename_to_tab_id` (replacing `filename_to_project_id`) and emits one `status:update` per tab file. The webview aggregates via a pure `aggregateStatus` into `Map<projectId, Map<tabId, StatusPayload>>`; `ProjectArea` selects the active tab's payload (`statusByTab.get(activeUid)`) for the StatusBar. `tabs/tabsReducer.ts` gains `updateTabSessionId` (replacing `updatePrimarySessionId`) with a change-guard so routine statusline ticks that don't change the session id return the same state reference. `cleanup_project_status` is replaced by `cleanup_tab_status(tab_id)` (validated via `is_safe_tab_id`), called on tab close; startup purge of stale files mirrors notify. The tab "primary" flag survives as the pinned/unclosable first tab in `tabsReducer` — it has no status-pipeline role.

**Consequences.** The four load-bearing perf invariants (cleared by the 2026-06-04 cadence measurement): (1) referential stability in the nested map — only the touched project's inner map gets a new reference, sibling projects keep identity; (2) the `updateTabSessionId` change-guard returns `state` unchanged when the session id hasn't changed, preventing per-tick re-renders; (3) only the active tab's payload feeds the StatusBar — the full map is never iterated at render time; (4) per-path emits (no full-dir scan) + field-by-field JS dedupe in `aggregateStatus`. Per-tab cleanup on tab close + startup purge matches the notify pipeline exactly. The StatusBar and the sessions sidebar's "open" badge now reflect the active tab, so switching tabs shows the correct model/context/cost and highlights the correct session row. The `CLAUI_PRIMARY` env variable is gone; nothing outside claui's own code referenced it.

**Note (2026-06-04 followup).** Statusline fields split into two categories: per-session fields (model, context %, cost) sourced from the active tab's payload, and account-global fields (5h/7d rate limits) sourced from the freshest payload window-wide via `useGlobalRateLimits` / `nextRateLimits`. The split is necessary because a fresh or idle tab reports null limits, and without the global overlay, switching to such a tab would blank the (globally-true) limit values in the StatusBar. The overlay is applied in `ProjectArea` before the payload reaches `ProjectChrome` → `StatusBar`.

**References.** Spec `docs/superpowers/specs/2026-06-04-per-tab-status-design.md` (gitignored; local-only). 2026-06-04 cadence-measurement entry above. `src-tauri/src/statusline.rs` (`tab_status_file_path`, `filename_to_tab_id`, `parse_envelope`, `StatusUpdate.tab_id`), `src-tauri/src/ipc.rs` (`build_spawn_env`, `cleanup_tab_status`), `src/status/useStatusByProject.ts` (`aggregateStatus`, `StatusByProject`), `src/tabs/tabsReducer.ts` (`updateTabSessionId`), `src/status/rateLimits.ts` (`nextRateLimits`), `src/status/useGlobalRateLimits.ts`.

---

## Template (do not delete)

### YYYY-MM-DD — Short title

**Context.** What problem prompted this decision. One paragraph.

**Decision.** What was decided. One paragraph.

**Consequences.** What this enables, what it forecloses, what becomes harder. One paragraph.

**References.** Links to AUDIT_RULES.md rules affected, PRs, commits.
