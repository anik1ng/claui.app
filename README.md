# claui

A native macOS shell for [Claude Code](https://www.anthropic.com/claude-code).

claui hosts the real installed `claude` CLI inside a native macOS app and wraps
it in workspace tabs, multiple projects, a live status bar, and native
shortcuts. It never calls the Anthropic API and never sees your credentials —
you log into `claude` itself.

Website: **[claui.app](https://claui.app)**

## Download

Latest macOS build (universal — Apple Silicon + Intel):
**[claui-universal.dmg](https://github.com/anik1ng/claui.app/releases/latest/download/claui-universal.dmg)**

## First launch

claui is currently unsigned, so on first launch macOS will say it’s “from an
unidentified developer.” To open it:

1. Open **Finder → Applications**.
2. Right-click **claui.app** → **Open**.
3. Click **Open** in the dialog.

Only needed once. Updates apply quietly afterwards via the built-in updater.

## What it does

- **Workspace tabs** — Claude and shell sessions in one window (`⌘T`, `⌘⇧T`, `⌘1–9`).
- **Multiple projects** — every repo open side by side (`⌘⇧N`, `⌘⌥1–9`), restored on launch.
- **Live status bar** — model, context, cost, and 5-hour / 7-day limits from Claude Code’s own status line.
- **Native menus & shortcuts** — a real macOS menu bar, sessions sidebar, and auto-updates.

## This repository

This repo hosts the **website** ([claui.app](https://claui.app)) and the
**release artifacts** (Releases). The application source lives in a private
repository while claui is in early alpha.

## License

MIT.
