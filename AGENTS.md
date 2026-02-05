# ClipVault - Agent Reference

> **Read this first.** This file tells you what to read and how to work on this codebase.

## What is ClipVault?

A Windows game clipping tool. Press F9 to save the last 2 minutes of gameplay as MP4 with separate game audio and microphone tracks.

**Two components:**
- **C++ Backend** (`src/`) - OBS-based recording, runs in system tray
- **Electron UI** (`ui/`) - React clip browser and editor

## Files to Read for Context

| File | What You'll Learn |
|------|-------------------|
| `COMMANDS.md` | How to build, run, and test |
| `docs/ARCHITECTURE.md` | System design, component responsibilities |
| `docs/FILE_PATHS.md` | Where all files are stored (clips, config, cache) |
| `docs/LIBOBS.md` | OBS API patterns (critical for backend work) |
| `docs/BUILD.md` | Detailed build instructions |
| `docs/TROUBLESHOOTING.md` | Common issues and fixes |

## Quick Orientation

```text
src/                 # C++ backend (recording engine)
├── main.cpp        # Entry point
├── capture.cpp     # Video/audio capture
├── encoder.cpp     # NVENC/x264 encoding
├── replay.cpp      # Replay buffer + save
└── config.cpp      # Settings

ui/src/              # Electron + React UI
├── main/           # Electron main process
├── renderer/       # React components
└── preload/        # IPC bridge

bin/                 # Backend build output
ui/release/          # Packaged app output
```

## Current State

The app is **feature-complete**. Main functionality works:
- Recording with NVENC/x264
- F9 hotkey saves clips
- UI for browsing, editing, exporting clips
- Settings UI for all configuration

## Git Workflow

All work on branches, merged via PR:

```bash
git checkout -b feature/your-feature
# Make changes
git add <files>
git commit -m "feat: description"
git push -u origin feature/your-feature
# Create PR on GitHub
```

**Branch naming:** `feature/*`, `fix/*`, `refactor/*`, `docs/*`

**Never:** Commit directly to master, push to master, commit/push without permission

**Default scope:** If the user says "commit and PR", include all current changes unless they explicitly ask to exclude something

## Code Style

### C++ (Backend)

- **Files:** `snake_case.cpp`, `snake_case.h`
- **Classes:** `PascalCase`
- **Functions/variables:** `snake_case`
- **Constants:** `SCREAMING_SNAKE_CASE`
- **Private members:** `snake_case_` (trailing underscore)
- **Indentation:** 4 spaces

```cpp
void my_function()
{
    if (condition) {
        do_something();
    }
}
```

### TypeScript/React (UI)

- **Files:** `camelCase.ts`, `PascalCase.tsx`
- **Components:** `PascalCase`
- **Hooks:** `useCamelCase`
- Run `npm run format` before committing

## OBS Patterns (Critical for Backend)

**Always release OBS objects:**

```cpp
obs_data_t* settings = obs_data_create();
// ... use settings ...
obs_data_release(settings);  // REQUIRED
```

**Initialization order:**

```cpp
obs_startup("en-US", config_path, nullptr);
obs_add_data_path("./data/libobs/");  // Trailing slash!
obs_add_module_path(plugin_bin, plugin_data);
obs_load_all_modules();     // BEFORE video/audio reset
obs_post_load_modules();
obs_reset_video(&ovi);      // AFTER modules
obs_reset_audio(&oai);
```

## Testing Changes

1. Build: `npm run backend:build`
2. Package: `npm run package:portable`
3. Run: `.\ui\release\win-unpacked\ClipVault.exe`
4. Check log: `type bin\clipvault.log`

**Always test the packaged version**, not just dev mode.

## Don't Do

- ❌ Commit/push without permission
- ❌ Commit directly to master
- ❌ Skip testing packaged version
- ❌ Ignore OBS function return values
- ❌ Forget to release OBS objects
- ❌ Create releases without user permission

## Creating Releases

When explicitly asked to create a release:

1. Update version in `ui/package.json` and root `package.json`
2. Update `CHANGELOG.md` with changes
3. Build: `npm run package:win`
4. Create release with gh CLI:
   ```powershell
   gh release create vX.Y.Z --title "ClipVault X.Y.Z" --notes-file CHANGELOG.md ./ui/release/*.exe
   ```

See `docs/RELEASES.md` for full details.
