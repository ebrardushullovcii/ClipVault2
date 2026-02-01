# ClipVault Progress Tracker

> Dynamic status updates for ongoing development
> Update this file frequently as work progresses

## Current Status Overview

**Last Updated**: 2026-02-01
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

### 2026-02-01 - Start with Windows & Tray Behavior

- **Start with Windows Toggle**: New option in Settings > Startup & Behavior
  - Adds/removes ClipVault from Windows registry Run key: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\ClipVault`
  - Immediate effect when toggled (no restart needed)
  - Uses `reg add` / `reg delete` commands via child_process

- **Minimize to Tray Toggle**: Moved to Startup & Behavior section
  - Keep the app running in background when closing window
  - Tray icon remains visible for quick access
  - Exit via tray menu "Exit" option

- **Settings UI Updates**:
  - New combined "Startup & Behavior" section in Settings
  - Clean toggle switches with animations
  - Separate Startup and Minimize to Tray options

- **Technical Implementation**:
  - `settings:setStartup` IPC handler manages Windows registry
  - `window.electronAPI.setStartup(enabled)` exposed to renderer
  - Settings saved to `ui.start_with_windows` and `ui.minimize_to_tray`

### 2026-02-01 - Editor State Persistence

- **Editor State Auto-Save**: Automatically saves editor state when editing clips
  - Saves trim marker positions (start/end)
  - Saves playhead position
  - Saves audio track settings (enabled, muted, volume for both tracks)
  - Debounced saves (500ms delay) to avoid excessive disk writes
  - Saves to `{clipsPath}/clips-metadata/{clipId}.editor.json`

- **Editor State Auto-Load**: Restores editor state when reopening a clip
  - Loads saved trim positions and restores them in the UI
  - Restores playhead to last position
  - Applies audio settings (track enablement, mute status, volume levels)
  - Only applies if editor state file exists for the clip

- **Storage Format**: JSON with EditorState interface
  - `trim: { start, end }` - Trim marker positions
  - `playheadPosition` - Last playhead position
  - `audio.track1/track2: { enabled, muted, volume }` - Audio settings
  - `lastModified` - ISO timestamp for tracking

- **API Additions**:
  - `editor:saveState` IPC handler - saves state to disk
  - `editor:loadState` IPC handler - loads state from disk
  - `window.electronAPI.editor.saveState/loadState` - Renderer API

### 2026-01-31 - Auto-Refresh Library & Manual Refresh Button

- **File Watching**: Automatically detects new clips without manual refresh
  - Uses `chokidar` to watch the clips folder for changes
  - Watches for `.mp4` file additions and removals
  - Waits 500ms after file write completes before triggering (prevents partial file issues)
  - Sends `clips:new` and `clips:removed` IPC events to UI

- **Library Auto-Update**: Library component listens for clip changes
  - Automatically refreshes clips list when new clip is saved
  - Automatically removes clips from UI when deleted
  - Uses `window.electronAPI.on()` to listen for events

- **Manual Refresh Button**: Added to Library toolbar
  - Located next to view toggle (grid/list)
  - Shows spinning animation while loading
  - Accessible when auto-refresh doesn't work

### 2026-01-31 - Configurable Clips Path

- **Removed Hardcoded Path**: Clips path now comes from `settings.json` instead of being hardcoded to `D:\Clips\ClipVault`
  - Added `getClipsPath()` function in `ui/src/main/main.ts` that reads from settings
  - Falls back to `D:\Clips\ClipVault` if settings file doesn't exist or path not set
  - All IPC handlers now use `getClipsPath()` dynamically
  - Settings UI already had output_path field - now it's actually used!
  - Backend was already reading from config, no changes needed there

### 2026-01-31 - Temp File Cleanup & Log Rotation

- **File Cleanup Utility** (`ui/src/main/cleanup.ts`): New module for permanent deletion (bypasses recycle bin)
  - `permanentDelete()`: Permanently deletes files using Node.js `fs.unlink()`
  - `deleteClipCache()`: Deletes thumbnails and audio cache for a specific clip
  - `cleanupOrphanedCache()`: Automatically cleans up thumbnails/audio cache for clips that no longer exist
  - `getCacheStats()`: Reports storage usage of thumbnail/audio cache

- **Automatic Cleanup**:
  - Runs orphaned cache cleanup 5 seconds after app startup
  - Only deletes cache files (thumbnails, audio) - never touches main clips or exports
  - Deletes thumbnails from `%APPDATA%\ClipVault\thumbnails\`
  - Deletes audio cache from `%APPDATA%\ClipVault\thumbnails\audio\`

- **Backend Log Rotation**:
  - Max log size: 10 MB per file
  - Keeps 3 backup files: `clipvault.log.1`, `clipvault.log.2`, `clipvault.log.3`
  - Automatically rotates when file exceeds 10 MB (checked every 100 writes)
  - Uses C++17 `<filesystem>` for file operations

- **IPC API Additions**:
  - `cleanup:orphans` - Trigger orphaned cache cleanup manually
  - `cleanup:stats` - Get cache storage statistics with formatted sizes

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

- [x] **3. Optimize Temp Deletion** - Bypass recycle bin for temp files, permanent deletion
  - Created comprehensive file path map: `docs/FILE_PATHS.md`
  - Documents all paths: clips, exports, thumbnails, audio cache, config, logs
  - Cleanup only affects thumbnails/audio cache - never main clips or exports

### UI/UX Improvements

- [x] **4. Simplify UI** - Reduce clutter, streamline workflows
- [x] **5. Export Quality Presets** - Add quality selector to export screen (Quick/High/Max)
- [x] **6. Settings Screen** - GUI for changing buffer duration, quality, hotkey, paths
- [x] **7. Polish Sharing Popup** - Add share buttons (Discord, Twitter, etc.) with proper timeout
- [x] **8. File Size Target** - Export by target MB instead of quality CRF
- [x] **9. Timeline Improvements** - Better drag handles, audio waveforms, trim precision
- [x] **10. Open Backend on start up option** - Option to have the backend run and the tray icon always be open on startup.

### Audio & Notifications

- [ ] **11. Audio Source Selection** - Allow user to select which microphone and system audio device to capture
  - Add device selector dropdowns in Settings > Audio
  - Use Windows WASAPI to enumerate available audio input/output devices
  - Allow separate selection for desktop audio and microphone
  - Store device IDs in config for persistence

- [ ] **12. Clip Notification & Sound** - Visual and audio feedback when clip is saved
  - Slide-in notification panel in top-right corner (non-intrusive)
  - Configurable notification duration (3-10 seconds)
  - Optional "clip saved" sound effect
  - Separate toggles in Settings > Notifications for:
    - Show notification on clip save
    - Play sound on clip save
    - Notification sound type (subtle/chime/click)

### Onboarding & Setup

- [ ] **13. First Run Setup Wizard** - Guide users through initial configuration
  - Step 1: Select clips save folder (create if doesn't exist)
  - Step 2: Configure audio sources (optional, defaults work)
  - Step 3: Quality/buffer settings (sensible defaults with customization)
  - Step 4: Start with Windows option
  - Skip option for users who prefer manual configuration
  - Settings saved to standard location, backend auto-restarted

### Library Management

- [ ] **14. Bulk Clip Operations** - Select and act on multiple clips at once
  - Multi-select via Ctrl+click or Shift+click
  - Checkbox mode for touch/tablet users
  - Bulk actions:
    - Delete selected clips (with confirmation)
    - Add/remove tags from selected clips
    - Export selected clips (queued, not parallel)
    - Favorite/Unfavorite selected clips
  - Select all / Deselect all buttons
  - Selection count indicator
  - Context menu for right-click actions

### Game Integration

- [ ] **15. Game Detection & Tagging** - Auto-detect running game using process enumeration
  - Identify game executable names and window titles
  - Auto-tag clips with detected game name
  - Filter clips by game in Library sidebar
  - Display game icons alongside clip metadata

- [ ] **16. Game Capture Mode** - Add dedicated game capture source with anti-cheat compatibility
  - Use Windows Graphics Capture API (Windows 10 1803+) instead of legacy game capture
  - Allow selecting specific game windows or full-screen capture
  - Bypass anti-cheat restrictions that block global hooks
  - Fallback to monitor capture if game capture unavailable

### Advanced Features

- [ ] **17. GPU Decoding** - Enable hardware-accelerated video decoding for smoother playback
  - Use D3D11 Video Decoder for GPU-accelerated video decoding
  - Reduce CPU usage during playback in editor
  - Support hardware decode for H.264, HEVC formats
  - Automatic fallback to software decoding if GPU unavailable

### Distribution & Installation

- [x] **18. Easy Installation** - Create NSIS installer for easy distribution
  - Use `electron-builder --win` (not `--win --dir`) to generate .exe installer
  - Features: start menu shortcuts, desktop icon option, proper Windows Add/Remove Programs registration
  - Installer location: `ui\release\ClipVault-Setup-1.0.0.exe`
  - Custom NSIS script adds App Paths registration for Windows search
  - See `docs/PACKAGING.md` for implementation details

### UI Polish

- [ ] **19. Custom Application Icon** - Replace Electron default icon with professional branded icon
  - Design or source a professional 256x256 PNG icon (and variations: 16, 32, 48, 64, 128, 256)
  - Convert to ICO format with multiple sizes for Windows
  - Update electron-builder config to use custom icon for:
    - EXE file icon
    - Taskbar icon
    - Start menu shortcut
    - Desktop shortcut (if created)
    - Add/Remove Programs entry
  - Ensure icon follows Windows icon guidelines (multiple resolutions for scaling)

  ### Performance Optimization

- [ ] **20. Windows Thumbnail Cache Integration** - Use native Windows thumbnail extraction
  - Investigate Windows Shell thumbnail extraction APIs (IExtractImage, IThumbnailProvider)
  - Potential 50-80% faster thumbnail generation on first load
  - Cache in standard Windows thumbnail cache location
  - Fallback to FFmpeg for formats Windows doesn't support
  - Consider performance impact vs implementation complexity
  - May reduce initial library load time significantly

## Documentation

- **README.md** - Overview and quick start
- **AGENTS.md** - Agent guidelines and build commands
- **PROGRESS.md** - This file, tracks completed work
- **TESTING.md** - Manual testing procedures
- **docs/** - Detailed technical documentation

## License

MIT License - Open source game clipping tool
