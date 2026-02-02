# ClipVault - Context for Claude

> **For Claude AI**: This file provides essential context about the ClipVault project. Read this first when starting work.

## Branch & PR Workflow (CRITICAL)

**ALL work must be done on branches. ALL changes must go through pull requests.**

```
1. Create branch from master: git checkout -b feature/your-feature
2. Make changes on branch
3. Commit changes (use conventional commits)
4. Push branch: git push -u origin feature/your-feature
5. Create PR on GitHub
6. CodeRabbit reviews PR automatically
7. Address CodeRabbit feedback
8. Get human review + approval
9. Merge to master
10. Delete branch
```

### Branch Naming

- `feature/*` - New features
- `fix/*` - Bug fixes
- `refactor/*` - Code refactoring
- `docs/*` - Documentation only
- `test/*` - Adding/fixing tests

### Never

- ❌ Never commit directly to master
- ❌ Never push to master
- ❌ Never work without a branch

## CodeRabbit Integration

CodeRabbit automatically reviews every PR on GitHub. Before writing code:

1. **Check CodeRabbit comments on GitHub** - Read all feedback
2. **Use @coderabbitai commands** in PR comments:
   - `@coderabbitai summarize` - Get PR summary
   - `@coderabbitai explain` - Explain specific code sections
   - `@coderabbitai walkthrough` - Step-by-step walkthrough

### Fetching CodeRabbit PR Comments

When working on a PR, fetch review comments:

```powershell
gh pr view --json number,title,body,reviews
gh pr review-diff  # See all comments
```

Add relevant CodeRabbit suggestions to your implementation context.

## Essential Files to Read

### Start Here
1. **[PROGRESS.md](PROGRESS.md)** - Current status, recent changes, and active tasks
2. **[AGENTS.md](AGENTS.md)** - Build commands, code conventions, and development rules
3. **[PLAN.md](PLAN.md)** - Development roadmap and architecture

### Technical Reference
4. **[docs/LIBOBS.md](docs/LIBOBS.md)** - libobs API patterns (critical for backend work)
5. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design and data flow
6. **[docs/FILE_PATHS.md](docs/FILE_PATHS.md)** - All file paths used by the app

### Build & Development
7. **[docs/BUILD.md](docs/BUILD.md)** - Building from source
8. **[docs/PACKAGING.md](docs/PACKAGING.md)** - Creating the packaged app
9. **[AGENT_WORKFLOW.md](AGENT_WORKFLOW.md)** - Step-by-step development process

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | C++17 with libobs (OBS Studio) |
| UI | Electron 27 + React + TypeScript |
| Video | NVENC hardware / x264 CPU fallback |
| Audio | AAC (2 separate tracks) |
| Build | CMake + MinGW |
| Packaging | Electron Builder |

## Project Structure

```
ClipVault2/
├── src/                    # C++ backend
│   ├── main.cpp           # Entry point
│   ├── obs_core.cpp       # OBS initialization
│   ├── capture.cpp        # Video/audio sources
│   ├── encoder.cpp        # NVENC/x264 encoding
│   ├── replay.cpp         # Replay buffer
│   ├── hotkey.cpp         # F9 global hotkey
│   ├── config.cpp         # Settings management
│   ├── logger.cpp         # File logging
│   └── tray.cpp           # System tray icon
│
├── ui/                     # Electron UI
│   ├── src/
│   │   ├── main/          # Main process (Node.js)
│   │   ├── renderer/      # React components
│   │   └── preload/       # IPC bridge
│   └── package.json
│
├── scripts/                # PowerShell scripts
├── docs/                   # Technical documentation
├── config/                 # Default settings
└── bin/                    # Build output (gitignored)
```

## Critical Patterns

### OBS Initialization Order (MUST follow)
```cpp
obs_startup("en-US", config_path, nullptr);
obs_add_data_path("./data/libobs/");  // Trailing slash!
obs_add_module_path(plugin_bin, plugin_data);
obs_load_all_modules();               // BEFORE video/audio
obs_reset_video(&ovi);                // Requires graphics_module
obs_reset_audio(&oai);
```

### Always Release OBS Objects
```cpp
obs_data_t* settings = obs_data_create();
// ... use settings ...
obs_data_release(settings);  // ALWAYS

obs_source_t* source = obs_source_create(...);
// ... use source ...
obs_source_release(source);  // ALWAYS
```

## Build Commands

```powershell
# Build C++ backend
.\build.ps1

# Build and run UI dev mode
cd ui && npm run dev

# Build packaged app
cd ui && npm run build:react && npx electron-builder --win --dir

# Run packaged app
.\ui\release\win-unpacked\ClipVault.exe
```

## Testing Requirements

**ALWAYS test with the packaged version**, not just the dev build:
1. Build: `cd ui && npm run build:react && npx electron-builder --win --dir`
2. Run: `.\ui\release\win-unpacked\ClipVault.exe`
3. Press F9 to save a clip
4. Verify clip has 2 audio tracks

## Current Implementation Status

- ✅ Core recording engine (C++ backend)
- ✅ NVENC hardware encoding
- ✅ Two audio tracks (desktop + mic)
- ✅ System tray with custom icon
- ✅ F9 global hotkey
- ✅ Clip library browser (Electron UI)
- ✅ Video editor (trim, audio controls)
- ✅ Export system (FFmpeg-based)
- ✅ Settings UI with auto-restart
- ✅ Single EXE packaging
- ✅ NSIS installer

## Known Limitations

- **Thumbnail generation**: Uses FFmpeg (slower but reliable). Native Windows thumbnail cache addon was attempted but abandoned due to Electron ABI compatibility issues.
- **Capture mode**: Monitor capture only (anti-cheat safe, but shows Windows yellow border). Game capture mode not implemented.

## Common Issues

1. **Build fails**: Run `.\build.ps1 -Clean` then rebuild
2. **Missing DLLs**: Run `.\build.ps1 -Setup`
3. **Black video**: Check modules loaded before `obs_reset_video`
4. **No audio**: Check audio sources activated with `obs_source_activate`

## Key Files for Different Tasks

### Backend Development
- `src/replay.cpp` - Replay buffer logic
- `src/capture.cpp` - Video/audio sources
- `src/encoder.cpp` - Encoding setup
- `docs/LIBOBS.md` - API reference

### UI Development
- `ui/src/renderer/components/` - React components
- `ui/src/main/main.ts` - Electron main process
- `ui/src/renderer/stores/` - Zustand state stores
- `docs/UI.md` - UI architecture

### Build/Package Issues
- `build.ps1` - Build script
- `ui/package.json` - Electron config
- `docs/PACKAGING.md` - Packaging guide
- `docs/BUILD.md` - Build instructions

## Version Info

- **App Version**: 1.0.1
- **OBS Version**: 31.0.2
- **Electron**: 27.1.3
- **Node**: 20.x

---

**Always check PROGRESS.md for the most current status before starting work.**
