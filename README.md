# claui

An open-source Tauri 2 desktop GUI shell for Claude Code.

Built with Tauri 2, React, TypeScript, and the Ghostty VT engine (`libghostty-vt`).

## Build requirements

| Tool | Version |
|------|---------|
| Rust (stable) | 1.80+ |
| Node.js | 20+ |
| Zig | **0.15.x** |

Zig is required by `libghostty-vt`'s build script, which compiles the Ghostty terminal emulation engine from source. Install via Homebrew:

```
brew install zig
```

## Development

```
npm install
npm run tauri dev
```

## Build

```
npm run tauri build
```
