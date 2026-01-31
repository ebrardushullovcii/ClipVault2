# ClipVault Progress Tracker

> Dynamic status updates for ongoing development
> Update this file frequently as work progresses

## Current Status Overview

**Last Updated**: 2026-01-31
**Status**: ✅ COMPLETE - Full Application Working
**Architecture**: Independent Backend (C++) + Electron UI (React/TypeScript)
**Packaging**: Single EXE with auto-starting backend

## Complete Feature Set ✅

### Phase 1: Core Recording Engine ✅

**Backend (C++ with OBS Studio)**

- [x] Monitor capture using DXGI (anti-cheat safe)
- [x] System audio capture (WASAPI output)
- [x] Microphone capture (WASAPI input)
- [x] NVENC hardware encoding (GTX 600+)
- [x] x264 CPU fallback encoding
- [x] Two separate audio tracks (desktop + mic)
- [x] 120-second replay buffer in memory
- [x] F9 global hotkey (low-level keyboard hook)
- [x] System tray with custom PNG icon (64x64-2.png)
- [x] JSON configuration (config/settings.json)
- [x] File logging with rotation
- [x] Single instance protection (Windows mutex)

**Performance**

- [x] Hardware encoding minimizes CPU usage
- [x] 1080p60 default (configurable)
- [x] ~1-2GB RAM usage for 2-minute buffer
- [x] No FPS drops during gameplay

### Phase 2: Electron UI ✅

**Clip Library Browser**

- [x] Grid/list view of all clips
- [x] Thumbnail generation via FFmpeg
- [x] Search and filter (favorites, recent)
- [x] Sort by date, size, name, favorite
- [x] Metadata display (duration, resolution, fps)
- [x] Custom protocol handler (clipvault://)

**Video Editor**

- [x] HTML5 video player with timeline
- [x] Trim markers (start/end)
- [x] Audio track controls (desktop + mic volumes)
- [x] Mute/unmute per track
- [x] Tags management (add/remove)
- [x] Favorite toggle
- [x] Non-destructive editing (JSON metadata)

**Export System**

- [x] Export with FFmpeg
- [x] Apply trim points
- [x] Audio track selection
- [x] Volume adjustments
- [x] Export progress bar
- [x] Drag-and-drop to external apps (Discord, etc.)
- [x] Export preview window

**UI Features**

- [x] Dark theme with custom accent color
- [x] Minimize to system tray
- [x] F12 developer tools
- [x] Single instance lock
- [x] Auto-restart backend on second launch
- [x] Protocol handler for clipvault:// URLs

### Phase 3: Packaging ✅

**Single EXE Distribution**

- [x] Electron UI packaged as single executable
- [x] C++ backend bundled in resources/bin/
- [x] OBS DLLs bundled (obs.dll, Qt6, etc.)
- [x] FFmpeg bundled for thumbnails/export
- [x] Custom icons bundled (64x64.png for drag, 64x64-2.png for tray)
- [x] Auto-starts backend when UI launches
- [x] Single instance for both UI and backend

## Architecture

```
User runs: ui\release\win-unpacked\ClipVault.exe
    ↓
[Electron UI] starts
    ↓
Spawns [C++ Backend] from resources\bin\ClipVault.exe
    ↓
Backend shows tray icon with custom PNG
    ↓
Both run independently - F9 works even if UI closed
    ↓
Clips saved to D:\Clips\ClipVault

Files:
- ui\release\win-unpacked\ClipVault.exe (172 MB Electron app)
- resources\bin\ClipVault.exe (3.2 MB backend)
- resources\bin\64x64-2.png (tray icon)
- resources\64x64.png (drag icon)
```

## How to Use

1. **Run the packaged app:**

   ```powershell
   cd D:\Projects-Personal\ClipVault2\ui\release\win-unpacked
   .\ClipVault.exe
   ```

2. **What happens:**
   - UI window opens showing clip library
   - Backend starts automatically (shows in system tray)
   - F9 hotkey is active for saving clips

3. **Workflow:**
   - Play games normally - backend always recording last 2 minutes
   - Press **F9** anytime to save a clip
   - Clips appear in the UI library automatically
   - Click a clip to edit/trim
   - Export and drag to Discord
   - Click **X** to minimize UI to tray (backend keeps running)
   - Right-click tray icon → **Exit** to stop everything

4. **Second launch:**
   - If UI already running: focuses the existing window
   - If backend stopped: restarts it automatically

## Build Instructions

### Full Build (Both Backend + UI)

```powershell
# 1. Build C++ Backend
cd D:\Projects-Personal\ClipVault2
.\build.ps1

# 2. Build React Frontend
cd ui
npm run build:react

# 3. Build Electron Package
npx electron-builder --win --dir

# Final app location:
# ui\release\win-unpacked\ClipVault.exe
```

### Development Build

```powershell
# Backend only (tray icon)
cd D:\Projects-Personal\ClipVault2
.\build.ps1
.\bin\ClipVault.exe

# UI only (in dev mode)
cd ui
npm run dev
```

## Testing Checklist

- [x] Backend starts with tray icon
- [x] Custom 64x64-2.png icon displays in tray
- [x] F9 hotkey saves clip
- [x] Two audio tracks in saved clips
- [x] UI shows clip library
- [x] Thumbnails load on first open
- [x] Audio works in editor on first open
- [x] Export with trim points
- [x] Drag export to Discord/files
- [x] Minimize to tray (X button)
- [x] Backend continues when UI minimized
- [x] Single instance (can't open multiple)
- [x] Second launch restarts backend if stopped
- [x] Protocol handler for thumbnails
- [x] Settings UI with automatic backend restart
- [x] Monitor selector with multi-monitor support
- [x] File size estimator in settings
- [x] Resolution presets filtered by monitor capabilities

## Recent Changes

### 2026-01-31 - File Size Target Export Fix

- **Fixed FFmpeg Command**: Removed `-crf 23` parameter when using target bitrate encoding
  - CRF (Constant Rate Factor) overrides bitrate settings in libx264, causing target file sizes to not be respected
  - Now uses only `-b:v`, `-maxrate`, `-bufsize` for proper bitrate control
  - Results in more accurate file size targeting during export

### 2026-01-31 - File Size Target Export Feature

- **File Size Target Export**: Added dropdown next to export button with size options: Original, 10MB, 50MB, 100MB
- **Smart Bitrate Calculation**: Automatically calculates video bitrate based on target size and clip duration
- **H.264 Re-encoding**: When size target is selected, uses libx264 with calculated bitrate instead of copying video stream
- **UI Enhancement**: Export button shows selected size target (e.g., "Export (50MB)"), dropdown shows checkmark for selected option

### 2026-01-31 - Major Settings Update

- **Settings Screen**: Full settings GUI with quality presets, resolution/FPS selection, encoder choice, buffer duration, hotkey config
- **Monitor Selector**: Detects all connected monitors, allows choosing which to capture, filters resolution options based on monitor capabilities
- **File Size Estimator**: Real-time calculation showing expected clip size based on duration, resolution, FPS, and quality preset
- **Buffer Duration Input**: Changed from slider to number input for precise control (30-300 seconds)
- **Backend Auto-Restart**: Settings changes automatically restart backend to apply new configuration
- **Config Location**: Moved to standard Windows location `%APPDATA%\ClipVault\settings.json` for consistency
- **Bug Fix**: Fixed x264 encoder to use correct `crf` parameter instead of `cqp` - quality presets now actually work!
- **AGENTS.md Update**: Added critical documentation requiring ALL testing be done with packaged version

### 2026-01-31 - Settings UI & Backend Restart (Initial)

- **Settings Screen**: Added full Settings UI with quality presets, resolution/FPS selection, encoder choice, buffer duration, hotkey config
- **Backend Auto-Restart**: When settings are saved, backend automatically restarts to pick up new configuration
- **Config Path Fix**: Fixed backend to look for config in both dev location (`bin\config\`) and packaged location (`config\` at app root)
- **Updated AGENTS.md**: Added clear documentation about ALWAYS testing with packaged version

## Known Issues

None - all features working as expected.

## Next Steps (Enhancements)

## Phase 4: Polish & Optimization (IN PROGRESS)

### Performance & Quality

- [x] **1. Quality Presets** - Test and optimize preset profiles (Low/Medium/High/Ultra)
- [x] **2. Resolution/FPS Testing** - Validate 720p30, 1080p60, 1440p60, 4K30 modes

### Storage & Cleanup

- [ ] **3. Optimize Temp Deletion** - Bypass recycle bin for temp files, permanent deletion

### UI/UX Improvements

- [x] **4. Simplify UI** - Reduce clutter, streamline workflows
- [x] **5. Export Quality Presets** - Add quality selector to export screen (Quick/High/Max)
- [x] **6. Settings Screen** - GUI for changing buffer duration, quality, hotkey, paths
- [x] **7. Polish Sharing Popup** - Add share buttons (Discord, Twitter, etc.) with proper timeout
- [ ] **8. File Size Target** - Export by target MB instead of quality CRF
- [x] **9. Timeline Improvements** - Better drag handles, audio waveforms, trim precision

### Game Integration

- [ ] **10. Game Detection & Tagging** - Auto-detect game, tag clips, filter by game in UI
- [ ] **11. Game-Only Capture Mode** - Option to only record when game is running (not desktop)
- [ ] **12. Game Capture Mode** - Add dedicated game capture (not just monitor) with game detection

### Advanced Features

- [ ] **13. GPU Decoding** - Enable hardware-accelerated video decoding for smoother playback

### Distribution & Installation

- [ ] **14. Easy Installation** - Create NSIS installer for easy distribution
  - Use `electron-builder --win` (not `--win --dir`) to generate .exe installer
  - Features: start menu shortcuts, desktop icon option, add to PATH, proper Windows Add/Remove Programs registration
  - Test installer on clean Windows VM
  - Scan with antivirus for false positives
  - Test uninstall cleanly removes all files
  - See `docs/PACKAGING.md` for implementation details

## Documentation

- **README.md** - Overview and quick start
- **AGENTS.md** - Agent guidelines and build commands
- **PROGRESS.md** - This file, tracks completed work
- **TESTING.md** - Manual testing procedures
- **docs/** - Detailed technical documentation

## License

MIT License - Open source game clipping tool
