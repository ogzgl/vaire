<p align="center">
  <img src="docs-icon.png" width="128" height="128" alt="Vaire" />
</p>

<h1 align="center">Vaire</h1>

<p align="center">
  A fast, opinionated code editor for people who actually write code.
</p>

<p align="center">
  <a href="https://github.com/ogzgl/vaire/releases">Download</a> &middot;
  <a href="#why">Why</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#build">Build</a> &middot;
  <a href="LICENSE">MIT License</a>
</p>

---

## The honest disclaimer

This editor is **extremely opinionated**. It's built around the way I work — multi-repo workspaces, keyboard-driven git workflows, split panes, and zero tolerance for bloat. If you're looking for a polished, general-purpose editor with 50,000 extensions, this ain't it.

Some things are broken. Some things are half-baked. I know. I use this daily and I fix things as I hit them.

## Why

I hate VS Code. I hate Cursor. I hate every Electron-based editor that takes 2GB of RAM to show me a file tree.

I love JetBrains products — IntelliJ, WebStorm, the whole family. They're incredible. But sometimes I just want something lighter. Something that opens instantly, handles 14 repos at once without choking, and doesn't try to be an operating system.

So I built Vaire. It's heavily inspired by JetBrains — the commit dialog, the push dialog, the git panel, the keyboard shortcuts, the overall UX philosophy. But it's a native app built with Tauri + Svelte, not a JVM. It starts in under a second.

**This is not a JetBrains replacement.** When I need a real debugger or deep refactoring tools, I open IntelliJ. Vaire is for everything else.

## Features

- **Multi-repo workspaces** — Open a folder with 14 repos, see them all in one tree, commit across all of them at once
- **JetBrains-style commit dialog** — Changes vs Unversioned Files, per-file checkboxes, right-click to rollback or add to VCS
- **Push dialog** — See exactly what you're pushing, grouped by repo, with commit details
- **Split editor** — Up to 4 panes, drag tabs between them
- **Multi-instance run** — Run your frontend and backend simultaneously, each with its own output tab
- **Session persistence** — Close the app, reopen it, your tabs and windows are exactly where you left them
- **7 themes** — Darcula, One Dark, GitHub Dark, Nord, Warp, Monokai, Black
- **Batch git operations** — Fetch all, pull all, branch switching across repos
- **Built-in terminal** — PTY-based, with proper process management
- **Monaco editor** — Same engine as VS Code, because the editor component is actually good
- **Keyboard-first** — `Cmd+K` commit, `Cmd+Shift+K` push, `Cmd+P` quick open, double-shift search everywhere
- **Auto-save always** — No save dots, no "do you want to save?", ever
- **Fast** — Native app, sub-second startup, minimal memory footprint

## What's not working (yet)

- Debugging is just a runner with placeholder UI — no breakpoints, no step-through
- No language server / intellisense (Monaco provides basic syntax highlighting)
- No plugin system
- Search and replace across files is basic
- No integrated merge conflict resolver
- Probably other things I haven't noticed yet

## Download

Grab the latest release from [GitHub Releases](https://github.com/ogzgl/vaire/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Vaire_x.x.x_aarch64.dmg` |
| macOS (Intel) | `Vaire_x.x.x_x64.dmg` |
| Windows | `Vaire_x.x.x_x64-setup.exe` |
| Linux (Debian/Ubuntu) | `vaire_x.x.x_amd64.deb` |
| Linux (AppImage) | `Vaire_x.x.x_amd64.AppImage` |

## Build

Requires: Node.js 18+, Rust 1.70+, and [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
# Install dependencies
npm install

# Run in dev mode
npm run tauri dev

# Build for production
npm run tauri build
```

## License

MIT — do whatever you want with it. See [LICENSE](LICENSE).

---

*Built by [Oguz Gul](https://github.com/ogzgl) because existing editors made him mad.*

*100% vibe coded with [Claude Code](https://claude.ai/claude-code). Every line of Rust, Svelte, and TypeScript in this repo was generated through conversation. No hand-typing was harmed in the making of this editor.*
