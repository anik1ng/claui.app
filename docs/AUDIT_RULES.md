# claui — Audit Rules

These rules govern AI-assisted edits to the claui codebase. They describe the **target state**, not the current state — an existing file that violates a rule remains valid until it is refactored or recorded in the Section 9 exceptions list. Limits are tighter than typical human-codebase norms because the primary editor of this code is Claude Code, which loads files fully into context on each edit: every edit is a first read of the file, and smaller files give every change more reasoning budget and fewer drift opportunities.

Every rule below carries an enforcement tag:

- **[lint]** — automated check (ESLint or Clippy). Wired up in `eslint.config.js` and `src-tauri/Cargo.toml`'s `[lints.*]` sections.
- **[review]** — caught by an audit prompt during periodic review.
- **[manual]** — requires developer judgment; tracked as a checklist item.

---

## 1. Hard limits

**R1.1** TypeScript and TSX files must not exceed 200 lines. Files between 201 and 250 lines must carry an inline justification comment at the top of the file explaining why a split is harmful. Files over 250 lines are forbidden outside the Exceptions list. **When a file approaches the soft limit, the canonical response is to convert it into a directory module organised by domain or responsibility:** `Foo.tsx` becomes `Foo/index.tsx` (the public import path stays `./Foo`) plus sibling files for the domain subunits. Splits "by line bucket" (e.g. `Foo-part-2.tsx` or `Foo-helpers.tsx` holding whatever didn't fit) are forbidden — splits must group by cohesion. If no cohesive split is possible, the file goes into the Exceptions list with a per-file justification. [lint]
Why: line count is a signal that the file is doing too much, not a target to dodge — every edit is a first read, and the cost of a botched edit grows superlinearly with the lines the model holds in working context. Pairing the limit with a canonical "split by domain into a directory" response means the rule guides restructuring instead of just blocking it.

**R1.2** Rust production code per file must not exceed 300 lines, measured excluding the inline `#[cfg(test)] mod tests { ... }` block. Files between 301 and 400 lines of production code must carry an inline justification comment. Files over 400 lines of production code are forbidden outside the Exceptions list. **When a file approaches the soft limit, the canonical response is to convert it into a directory module organised by domain or responsibility:** `foo.rs` becomes `foo/mod.rs` (the public module path stays `foo::`) plus sibling files; `mod.rs` declares the submodules and re-exports the public surface so callers don't change. Splits "by line bucket" (e.g. `foo_part_2.rs` or `foo_helpers.rs` holding whatever didn't fit) are forbidden — splits must group by cohesion. If no cohesive split is possible, the file goes into the Exceptions list with a per-file justification. [review]
Why: line count is a signal that the file is doing too much, not a target to dodge — multi-hundred-line modules exceed comfortable single-module size for a first-read editor, and asymmetric logic is where AI refactors lose invariants silently because no single edit holds the whole call graph in context. Pairing the limit with a canonical "split by domain into a directory" response means the rule guides restructuring instead of just blocking it.

**R1.3** Rust unit tests must live inside a single `#[cfg(test)] mod tests { ... }` block at the bottom of the file. Freestanding `#[test]` functions interleaved with production code are forbidden. [lint]
Why: every Rust module in the codebase follows this convention; interleaved tests would break the production-line measurement R1.2 depends on and would break the production/test cognitive boundary.

**R1.4** Rust test helper modules (for example `tests/common/mod.rs`) count as production code and obey R1.2's 300/400 limit. [review]
Why: test helpers form a dependency graph used by many tests, so they share the same "every edit is a first read" cost as production modules.

**R1.5** Function bodies must not exceed 50 lines of code, excluding the signature, doc comments, and the closing brace. **For React function components in `.tsx` files the limit is raised to 150 lines** — JSX rendering inflates line count without indicating logic complexity, so 50 misaligned with how React components are written. Cohesion at the React-component scale is governed by R1.1's file-level limit instead. [lint]
Why: smaller bodies surface the contract; load-bearing single-algorithm functions that cannot be split without losing clarity are listed in Section 9 as function-level exceptions. The .tsx override exists because raw 50-line application to JSX-heavy bodies produced warnings on the majority of UI components in the codebase — a signal that the rule was misaligned with React's idiom, not that the components were defective.

**R1.6** Cyclomatic complexity per function must not exceed 20. [lint]
Why: high-complexity functions are the spots where the next refactor is most likely to silently regress; threshold 20 catches genuinely pathological branching while accepting the documented load-bearing algorithms.

## 2. Architecture invariants

**R2.1** `xterm.js`, running in the webview, owns all terminal emulation — VT parsing, rendering, input encoding, selection, and scrollback. The Rust core must not parse VT sequences, maintain a screen or grid model, or carry a renderer. Only raw bytes cross the IPC boundary: child output travels as a `Channel<Vec<u8>>` to `term.write()`, and keyboard input travels as the string payload of the `pty_input` command to `PtySession::write`. [review]
Why: one VT implementation is the load-bearing decision of the whole project. The predecessor built a from-scratch VT engine plus a hand-written renderer and was abandoned for exactly this reason. Any VT logic on the Rust side creates a second, divergent emulator; the failure is silent — subtly wrong rendering — and expensive to trace.

**R2.2** Every PTY and its child process is owned by exactly one `PtySession`, constructed only through `PtySession::spawn`. A live session is reachable only through `AppState`'s `Mutex`-guarded registry, keyed by id. `PtySession` kills its child on `Drop`; removing a session from the registry, or dropping `AppState`, must remain sufficient to terminate the process. [review]
Why: the `Drop`-kills-child contract is the only thing preventing orphaned `claude` / shell processes. A path that spawns a PTY outside `PtySession`, or holds a `PtySession` outside the registry, escapes that guarantee and leaks processes the user cannot see or stop.

**R2.3** The `libghostty-vt` VT engine and the hand-written canvas renderer it fed must not be reintroduced. Terminal emulation is `xterm.js`'s responsibility (R2.1). [review]
Why: that stack was built, abandoned, and removed — the repository was re-initialized to drop it. Reintroducing it relitigates a settled decision and reopens the dual-emulator failure mode R2.1 exists to prevent.

## 3. Frontend conventions

**R3.1** Frontend code talks to the Rust backend only through `src/ipc/commands.ts`. Direct `invoke()` calls and imports from `@tauri-apps/api/core` anywhere else are forbidden; `commands.ts` re-exports the `Channel` type so components never need that import either. [lint]
Why: `commands.ts` is the one place each command's argument and return types are declared. Bypassing it scatters untyped `invoke()` calls — and the `any`-typed IPC boundary — across the UI. Enforced by `no-restricted-imports` in `eslint.config.js`, with `commands.ts` itself exempted.

**R3.2** `src/main.tsx` must not wrap the application in `React.StrictMode`. [review]
Why: claui's effects spawn real OS processes — PTYs running `claude` or a shell. StrictMode deliberately double-invokes effects in development, which would spawn a duplicate child process for every terminal. The omission is load-bearing and is documented by a comment in `main.tsx`.

**R3.3** `xtermTheme.ts` must always append a `Menlo, monospace` fallback to the configured terminal `font-family`. Returning the bare configured family is forbidden. [review]
Why: the webview resolves fonts differently from a native terminal, and the configured family may not exist there. Without a monospace fallback the terminal would render in a proportional font, breaking column alignment. Guarded by `xtermTheme.test.ts`.

**R3.4** The `open` callback passed to `<TerminalView>` must be a stable reference — wrapped in `useCallback` with an honest dependency list. Constructing a fresh function on every render is forbidden. [review]
Why: `TerminalView`'s terminal-setup effect depends on `open`; a new identity tears down and recreates the `xterm.js` terminal, which respawns the backend PTY. The failure is silent — a flickering terminal, a lost shell session. `Layout.tsx`'s `openClaude` / `openShell` already follow this.

## 4. Backend conventions

_Reserved._

## 5. Cross-boundary contracts

_Reserved._

## 6. Performance budgets

_Reserved._

## 7. Security boundaries

_Reserved._

## 8. Documentation discipline

Documentation is a load-bearing part of this codebase. Because the primary editor is Claude Code, every edit is a "first read" of the file being changed — comments and docstrings are the only mechanism that carries why a piece of code is the way it is across that read boundary. Stale documentation actively misleads AI edits, so the bar is correctness over completeness.

**R8.1** Non-trivial public functions, types, and modules in Rust must carry a `///` docstring explaining purpose and any invariants the function relies on or maintains. "Non-trivial" means: the function has preconditions not expressed in its types, OR it participates in an invariant documented elsewhere, OR its name does not fully convey what it does. Trivial getters, `From` impls, and obvious helpers are exempt. [review]

**R8.2** Non-trivial exported functions and components in TypeScript must carry a JSDoc or block comment explaining purpose and any invariants. Same "non-trivial" bar as R8.1. React components are non-trivial by default unless they're pure presentational wrappers with no side effects. [review]

**R8.3** Documentation must be updated in the same commit that changes the code it describes. Stale comments are a worse defect than missing comments — they mislead future edits, including AI edits that follow the comment as authoritative intent. If an edit makes a docstring or comment inaccurate, fix the documentation before committing. [review]

**R8.4** Comments must explain WHY, not WHAT. The code itself shows what it does; comments earn their place by explaining the non-obvious reasoning behind a choice, the invariant being preserved, or the alternative that was rejected. Pure restatement of code in prose is forbidden — it inflates context cost for every Claude Code edit and degrades signal-to-noise. Verbose WHY comments are encouraged when the reasoning is non-obvious — length is not the defect, restatement of code is. [review]

**R8.5** Inline markers for load-bearing constraints must be explicit and greppable. Use `INVARIANT:`, `SAFETY:`, or `NOTE:` at the comment opening to flag a constraint that must not be removed by refactoring. These markers are signals to AI editors that the next line is structurally load-bearing. [review]

## 9. Exceptions

The following files explicitly violate a hard limit and are permitted to.

_None yet._

### Function-level exceptions

The following functions exceed R1.5's 50-line body limit and are permitted to.

- `src-tauri/src/menu.rs::init` (64 lines) — linear macOS menu construction: five `MenuItemBuilder` declarations, four `SubmenuBuilder` assemblies, the `MenuBuilder` itself, and the `on_menu_event` dispatch. Splitting fragments a single declarative menu definition with no cohesive domain seams to cut on. Re-evaluate when the menu grows beyond 80 lines.

## 10. How this file is maintained

**When to update.** AUDIT_RULES.md must be updated alongside any accepted architectural change in the same PR. A rule that no longer reflects the codebase is worse than no rule — it teaches AI edits to chase a stale target.

Documentation changes (R8.1-R8.5) are part of the same commit as the code change they describe — never a follow-up.

**How to update.** AUDIT_RULES.md edits that **begin or end prohibiting a concrete practice in code** — relaxing a security boundary, adding or removing a `[lint]` rule, changing a numeric limit that affects what compiles, introducing a new invariant — must add an entry to DECISIONS.md recording the change, its motivation, and the incident or backlog item that surfaced the need.

AUDIT_RULES.md edits that are **internal housekeeping** — rewording for clarity, folding two rules into one, splitting a rule for readability, refining a "Why" without changing what is allowed — do not require a DECISIONS.md entry. The commit message describes the change.

**Audit feedback loop.** When a periodic audit (manual review, `/review`, or `/ultrareview`) surfaces a code site that violates an R-rule but isn't listed as a Section 9 exception, the finding must close one way or the other before the audit is considered complete: either codify the case as a new Section 9 exception (if the violation is justified by structure or a load-bearing constraint), OR strengthen the rule and fix the code (if the violation is unintentional drift). Silently ignoring the finding is forbidden — it teaches future AI editors that the rule is decorative, which is worse than not having the rule at all.
