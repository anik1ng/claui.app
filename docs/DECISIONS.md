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

## Template (do not delete)

### YYYY-MM-DD — Short title

**Context.** What problem prompted this decision. One paragraph.

**Decision.** What was decided. One paragraph.

**Consequences.** What this enables, what it forecloses, what becomes harder. One paragraph.

**References.** Links to AUDIT_RULES.md rules affected, PRs, commits.
