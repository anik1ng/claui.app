# Changelog

## [0.3.0] — 2026-06-01

### Added
- "+ New" in the sessions list starts a fresh session in the current tab;
  ⌘-click opens it in a new tab instead.
- The title bar shows the active project's name (or "claui" when no project
  is open) in place of the previously empty strip.

### Changed
- The application menu lists "About claui" before "Check for Updates…",
  matching the macOS convention.

### Fixed
- The About panel no longer shows the version twice; it now reads
  "Version 0.3.0 (commit)" with a copyright line.
- The sessions list scrollbar is a thin bar revealed on hover, instead of a
  wide, always-visible one.
- Right-clicking no longer offers "Reload", which would have discarded every
  open terminal.
- Section headers, the +Add / +New buttons, and the status-bar metrics are no
  longer accidentally text-selectable.

## [0.2.0] — 2026-06-01

### Added
- Hold ⌘ or ⌃ to reveal keyboard-shortcut hints next to tabs and projects.
- Configurable terminal line height and letter spacing for more comfortable text.

### Changed
- Switch workspace tabs with ⌘1–9; switch projects with ⌃1–9
  (previously ⌘1–9 and ⌘⌥1–9).
- New Terminal Tab is now ⌘T and New Claude Tab is ⌘⇧T (swapped).

### Fixed
- Workspace tab labels are vertically centred; tab and hint spacing tightened.

## [0.1.0] — 2026-05-29

First public release. A native macOS app that runs Claude Code in a real terminal.

### Added
- Terminal running the `claude` CLI, with tabs for Claude and shell sessions.
- Multiple projects open at once, with quick switching.
- Status bar showing model, context, cost, and usage limits.
- Sessions sidebar to browse and resume past conversations.
- Native macOS menu and keyboard shortcuts.
- Automatic updates.
