# Contributing to ClipVault

Thanks for your interest in ClipVault! This is currently a small personal side project that I work on in my free time.

## Current Status

This project is primarily a personal tool that I'm sharing. While contributions are welcome, please understand that:
- I maintain this in my spare time
- Response times may vary
- Major architectural changes need discussion first

## How to Contribute

1. **Check existing issues** - Look for open issues or create one to discuss changes
2. **Fork and branch** - Create a feature branch from the default branch (`master`/`main`)
3. **Follow the style** - Match existing code style (see AGENTS.md)
4. **Test your changes** - Always test the packaged version, not just dev mode
5. **Submit a PR** - Include a clear description of what changed and why

## Development Setup

See [docs/BUILD.md](docs/BUILD.md) for detailed build instructions.

Quick start:

```powershell
npm install

# Build backend
npm run backend:build

# Build UI
npm run build:react

# Build packaged app (backend + UI)
npm run package:portable
```

Platform notes:

Backend build and packaging scripts require Windows PowerShell. On macOS/Linux, you can work on the UI with:

```bash
npm --prefix ui install
npm --prefix ui run dev
npm --prefix ui run build:react
npm --prefix ui run lint
npm --prefix ui run test:ui
```

Use a Windows runner for backend builds and packaging.

## Questions?

Open an issue for questions or discussions. I'm happy to help when I can!
