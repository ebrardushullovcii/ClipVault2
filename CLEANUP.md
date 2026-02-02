# ClipVault Cleanup - Files to Remove

This document lists files and folders created during agent testing/development that are no longer needed. These are safe to delete and will reduce repo clutter.

**Total potential savings: ~3.6GB**

---

## Quick Cleanup Commands

```bash
# Run from project root

# 1. BIGGEST ITEMS - Old build outputs (~3.6GB)
rm -rf dist/                    # 3.1GB - old Electron build output
rm -rf temp_obs/                # 459MB - temporary OBS files

# 2. Test files from thumbnail addon experiments (~100KB)
rm -rf test-*.cjs test-*.js test-*.mjs test_crash.cjs test-video.mp4

# 3. Abandoned native addon and related files (~5MB)
rm -rf ui/native/ ui/win-capture/ win-capture/
rm -rf ui/src/main/thumbnail-extractor.cjs ui/src/main/thumbnail-worker.ts

# 4. Unused React hooks (dead code)
rm -rf ui/src/renderer/hooks/useIntersectionObserver.ts
rm -rf ui/src/renderer/hooks/useVirtualization.ts

# 5. Debug/temp files
rm -rf add_logging.patch nul ui/nul
rm -rf crash_debug.log debug_startup.log tmp_copy.sh
rm -rf THUMBNAIL_INVESTIGATION.md

# 6. NVENC test files
rm -rf test_nvenc.bat test_nvenc.ps1
```

---

## Detailed Breakdown

### 1. OLD BUILD OUTPUT - dist/ (3.1GB) ⚠️ BIGGEST

**Why delete**: This is an OLD Electron build output folder. The current build goes to `ui/release/`. This folder contains stale binaries from a previous build configuration (note: `clipvault.exe` lowercase vs current `ClipVault.exe`).

| Path    | Size      | Status                 |
| ------- | --------- | ---------------------- |
| `dist/` | **3.1GB** | Stale - safe to delete |

Already in `.gitignore` but exists locally.

---

### 2. TEMP OBS FOLDER - temp_obs/ (459MB) ⚠️ LARGE

**Why delete**: Temporary OBS files extracted during development/testing. Not needed for the application.

| Path        | Size      | Contents                              |
| ----------- | --------- | ------------------------------------- |
| `temp_obs/` | **459MB** | Extracted OBS binaries and data files |

Already in `.gitignore` but exists locally.

---

### 3. Thumbnail Addon Test Files (Root Directory)

**Why delete**: These were created by agents trying to debug a Windows native addon for thumbnail extraction. The addon was abandoned due to Electron ABI compatibility issues. FFmpeg is now used instead.

| File                        | Size  | Purpose                            |
| --------------------------- | ----- | ---------------------------------- |
| `test-addon.cjs`            | 1.5KB | Testing native addon loading       |
| `test-addon.js`             | 1.5KB | Testing native addon loading       |
| `test-addon.mjs`            | 1.5KB | Testing native addon (ESM)         |
| `test-addon-call.cjs`       | 1.3KB | Testing addon function calls       |
| `test-addon-full.cjs`       | 0.8KB | Full addon integration test        |
| `test-addon-load.cjs`       | 1.2KB | Testing addon loading mechanics    |
| `test-addon-video.cjs`      | 2.3KB | Testing video thumbnail extraction |
| `test-backslash.cjs`        | 0.8KB | Testing Windows path handling      |
| `test-different-videos.cjs` | 2.5KB | Testing various video formats      |
| `test-from-packaged.cjs`    | 2.1KB | Testing from packaged Electron     |
| `test-locations.cjs`        | 2.6KB | Testing file path locations        |
| `test-runner.cjs`           | 2.6KB | Test runner script                 |
| `test-standard-files.cjs`   | 3.5KB | Testing with standard files        |
| `test_crash.cjs`            | 1.4KB | Crash debugging test               |
| `test-video.mp4`            | 74KB  | Sample video for testing           |

---

### 4. Abandoned Native Addon (ui/native/)

**Why delete**: This Windows Thumbnail Cache native addon (using IShellItemImageFactory API) crashes when called from Electron 27 due to Node.js ABI mismatch. After extensive debugging, it was abandoned in favor of FFmpeg-based thumbnail generation which works reliably.

| Path                         | Size | Contents                                  |
| ---------------------------- | ---- | ----------------------------------------- |
| `ui/native/thumbnail-addon/` | ~5MB | C++ source, build artifacts, node_modules |

**What's inside**:

- `src/addon.cpp` - N-API wrapper code
- `src/thumbnail.cpp` - Windows COM/GDI+ thumbnail extraction
- `build/` - Visual Studio build artifacts (.obj, .pdb, .lib files)
- `node_modules/` - node-addon-api dependency

---

### 5. Unused Worker Files (ui/src/main/)

**Why delete**: These were created to isolate the native addon in a subprocess to avoid Electron crashes. Since the native addon was abandoned, these are unused.

| File                      | Size  | Purpose                            |
| ------------------------- | ----- | ---------------------------------- |
| `thumbnail-extractor.cjs` | 2.2KB | Subprocess worker for native addon |
| `thumbnail-worker.ts`     | 3.4KB | Worker thread implementation       |

---

### 6. Unused React Hooks (ui/src/renderer/hooks/)

**Why delete**: These hooks were created but never integrated into components. They are dead code - not imported anywhere in the codebase.

| File                         | Size  | Status                |
| ---------------------------- | ----- | --------------------- |
| `useIntersectionObserver.ts` | 3.6KB | Not imported anywhere |
| `useVirtualization.ts`       | 3.3KB | Not imported anywhere |

---

### 7. OBS win-capture Folders

**Why delete**: OBS game capture compatibility metadata that was auto-downloaded. Not used by ClipVault. Exists in TWO locations.

| Path              | Size  | Contents                        |
| ----------------- | ----- | ------------------------------- |
| `win-capture/`    | ~18KB | OBS update metadata (root)      |
| `ui/win-capture/` | ~15KB | OBS update metadata (duplicate) |

---

### 8. Debug and Temp Files

**Why delete**: Temporary files created during debugging sessions by agents.

| File                         | Size  | Purpose                                            |
| ---------------------------- | ----- | -------------------------------------------------- |
| `add_logging.patch`          | 1KB   | Debug logging patch file                           |
| `nul`                        | 0B    | Windows NUL device artifact (accidental)           |
| `ui/nul`                     | 0B    | Windows NUL device artifact (accidental)           |
| `crash_debug.log`            | ~2KB  | Debug log from addon crash testing                 |
| `debug_startup.log`          | ~1KB  | Startup debugging log                              |
| `tmp_copy.sh`                | 0.5KB | Temporary build utility script                     |
| `THUMBNAIL_INVESTIGATION.md` | 4KB   | Agent handover doc (info preserved in PROGRESS.md) |

---

### 9. NVENC Test Files

**Why delete**: Test scripts for NVENC hardware encoding debugging. Already in .gitignore but may exist locally.

| File             | Size  | Purpose                      |
| ---------------- | ----- | ---------------------------- |
| `test_nvenc.bat` | 3.3KB | NVENC test batch script      |
| `test_nvenc.ps1` | 3.9KB | NVENC test PowerShell script |

---

## Summary

| Category                   | Items         | Size       | Priority  |
| -------------------------- | ------------- | ---------- | --------- |
| `dist/` folder (old build) | 1 folder      | **3.1GB**  | 🔴 HIGH   |
| `temp_obs/` folder         | 1 folder      | **459MB**  | 🔴 HIGH   |
| Native addon `ui/native/`  | 1 folder      | ~5MB       | 🟡 MEDIUM |
| Test scripts               | 15 files      | ~100KB     | 🟡 MEDIUM |
| win-capture folders        | 2 folders     | ~33KB      | 🟢 LOW    |
| Unused hooks               | 2 files       | ~7KB       | 🟢 LOW    |
| Debug/temp files           | 7 files       | ~10KB      | 🟢 LOW    |
| NVENC test files           | 2 files       | ~7KB       | 🟢 LOW    |
| Worker files               | 2 files       | ~6KB       | 🟢 LOW    |
| **Total**                  | **~33 items** | **~3.6GB** |           |

---

## Folder Size Reference

Current state of top-level folders:

| Folder          | Size  | Status                                      |
| --------------- | ----- | ------------------------------------------- |
| `dist/`         | 3.1GB | DELETE - old build output                   |
| `ui/`           | 1.9GB | KEEP - includes current `release/` (766MB)  |
| `third_party/`  | 687MB | KEEP - OBS dependencies (in .gitignore)     |
| `bin/`          | 501MB | KEEP - backend build output (in .gitignore) |
| `temp_obs/`     | 459MB | DELETE - temporary files                    |
| `node_modules/` | 451MB | KEEP - npm dependencies (in .gitignore)     |

---

## Files to KEEP

These might look like cleanup candidates but are legitimate:

| File/Folder        | Why Keep                                 |
| ------------------ | ---------------------------------------- |
| `eslint.config.js` | ESLint configuration for the project     |
| `scripts/*.ps1`    | Legitimate test/utility scripts          |
| `build.ps1`        | Main build script                        |
| `setup-obs.ps1`    | OBS setup script                         |
| `docs/*.md`        | Project documentation                    |
| `bin/`             | Backend build output (needed to run app) |
| `ui/release/`      | Current packaged Electron app            |

---

## Recommended .gitignore Additions

After cleanup, add these patterns to prevent future accumulation:

```gitignore
# Test files
test-*.cjs
test-*.js
test-*.mjs
test_*.cjs
test-*.mp4

# Native addon (abandoned)
ui/native/

# OBS win-capture metadata
win-capture/
ui/win-capture/

# Debug logs
crash_debug.log
debug_startup.log

# Patch files
*.patch

# Windows NUL artifacts
nul
```
