# claui

A desktop GUI shell for Claude Code — it hosts the real `claude` CLI inside a
fast terminal and wraps it in a native shell, in the spirit of Caudex and cmux.

claui does not call the Anthropic API and never handles your credentials: you log
into `claude` itself, exactly as you would in any terminal.

## Status

claui is functional. What it does today:

- A `claude` terminal in a chosen project folder (xterm.js).
- **Multiple projects** open at once. **Add Project** (`Cmd+Shift+N`),
  **Close Project** (`Cmd+Shift+W`), switch with `Ctrl+1..9`. Open projects and
  the active one are restored on the next launch.
- A **status bar** at the bottom with the live model, context usage, cost, and 5-hour /
  7-day rate-limit usage — read from `claude`'s own statusline command output,
  no API calls.
- A **sessions sidebar** on the right (`Ctrl+B` to toggle) listing the current
  project's `claude` sessions, newest first. Click a row to switch via
  `claude --resume`; `+ New` starts a fresh session.
- A slide-out command terminal at the bottom (`` Ctrl+` `` to toggle).
- **Workspace tabs.** Multiple `claude` and shell sessions in one window.
  `Cmd+T` opens a new terminal, `Cmd+Shift+T` opens a new claude, `Cmd+1..9`
  switches, `Cmd+W` closes. The first claude tab of each project is pinned
  and can't be closed.
- **Notifications.** When a `claude` session finishes, needs your input, or
  errors, its tab and project show a coloured indicator; if the window isn't
  focused, attention/error events also raise a system notification you can
  click to jump straight to that session.
- **Drag-and-drop.** Drop a file or image onto the window to insert its path
  into the active terminal.

Planned: split panes, a dashboard sidebar (skills / MCP / agents / hooks /
permissions), and a git panel.

## Requirements

- Rust (stable)
- Node.js 20+

## Develop

```sh
npm install
npm run tauri dev
```

## Build

```sh
npm run tauri build
```

## Stack

Tauri 2 · React + TypeScript · [xterm.js](https://xtermjs.org) · Rust (`portable-pty`).
The terminal lives entirely in the webview (xterm.js); the Rust core only spawns
and owns the PTYs.
