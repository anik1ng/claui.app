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

## Template (do not delete)

### YYYY-MM-DD — Short title

**Context.** What problem prompted this decision. One paragraph.

**Decision.** What was decided. One paragraph.

**Consequences.** What this enables, what it forecloses, what becomes harder. One paragraph.

**References.** Links to AUDIT_RULES.md rules affected, PRs, commits.
