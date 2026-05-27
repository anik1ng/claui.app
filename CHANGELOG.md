# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-05-27

Initial release. claui is a Tauri 2 desktop GUI shell for Claude Code — it
hosts the real installed `claude` CLI inside an `xterm.js` terminal and wraps
it in a native macOS shell. It does not call the Anthropic API and never
handles your credentials: you log into `claude` itself.

### Added

- **Project terminal.** A `claude` session in a chosen project folder, running
  in `xterm.js`. VT parsing and rendering live in the webview; only raw PTY
  bytes cross the IPC boundary.
- **Multi-project tabs.** Hold several projects open in the same window.
  `⌘⇧N` to add a project, `⌘⇧W` to close, `⌘⌥1..9` to switch. Open projects
  and the active one persist to `window.json` and restore on next launch.
- **Workspace tabs inside each project.** `⌘T` opens a new claude session,
  `⌘⇧T` opens a shell, `⌘1..9` switches, `⌘W` closes. The first claude tab
  of each project is pinned and can't be closed.
- **Native macOS menu.** File submenu owns the project and tab accelerators;
  the rest follows platform conventions.
- **Status bar.** Live model name, context usage, cost, and 5-hour / 7-day
  rate-limit usage, read from `claude`'s own statusLine wrapper output. No
  API calls.
- **Sessions sidebar.** Right-hand list of the active project's claude
  sessions, newest first. Click to resume via `claude --resume`. Rows whose
  session is held by an open tab carry a `↗` badge. Toggle with `Ctrl+B`.
- **Slide-out command terminal.** Shell drawer at the bottom of each project
  area. Toggle with `` Ctrl+` ``.
- **Custom title bar.** The native macOS title bar is replaced by a 32 px
  strip carrying the project name, the workspace tab switcher, and a
  hover-revealed toolbar for new claude / new shell.
- **Dark-first theme.** Pure black surfaces, warm-accent chrome, Geist Sans
  for UI and Monaspace Neon for the terminal.
- **Application icon.** claui tilde mark on a continuous-corner squircle in
  the macOS Sequoia visual language.

### Project meta

- MIT license.
- Author / repository / homepage filled in across `package.json` and
  `Cargo.toml`.
- Audit rules (`docs/AUDIT_RULES.md`) and decision log (`docs/DECISIONS.md`)
  document the technical invariants. The pre-commit hook
  (`.githooks/pre-commit`) enforces them; activate it per clone with
  `git config core.hooksPath .githooks`.

[Unreleased]: https://github.com/anik1ng/claui/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/anik1ng/claui/releases/tag/v0.1.0
