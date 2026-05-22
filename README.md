# claui

A desktop GUI shell for Claude Code — it hosts the real `claude` CLI inside a
fast terminal and wraps it in a native shell, in the spirit of Caudex and cmux.

claui does not call the Anthropic API and never handles your credentials: you log
into `claude` itself, exactly as you would in any terminal.

## Status

**v1 — the terminal core:** a window running `claude` in a chosen project folder,
a slide-out command terminal (toggle with `` Ctrl+` ``), theming from your
Ghostty config, and a first-run project picker. Split panes, project tabs, and a
dashboard sidebar are planned.

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
