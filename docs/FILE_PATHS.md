# ClipVault File Path Map

Complete reference of all file paths used by ClipVault (Backend + UI).

## Summary Table

| Category | Path | Purpose | Created By |
|----------|------|---------|------------|
| **Clips (Main)** | `{settings.output_path}\*.mp4` | Main recorded clips | Backend (C++) |
| **Metadata** | `{settings.output_path}\*.clipvault.json` | Clip metadata (tags, trim, etc.) | UI |
| **Exports** | `{settings.output_path}\exported-clips\*.mp4` | User exported clips | UI |
| **Thumbnails** | `%APPDATA%\ClipVault\thumbnails\*.jpg` | Clip thumbnails | UI |
| **Audio Cache** | `%APPDATA%\ClipVault\thumbnails\audio\*.m4a` | Extracted audio tracks | UI |
| **Config** | `%APPDATA%\ClipVault\settings.json` | App settings | Backend & UI |
| **Backend Log** | `{backend_exe_dir}\clipvault.log` | Backend logs | Backend (C++) |
| **Backend Log Backups** | `{backend_exe_dir}\clipvault.log.1-3` | Rotated log files | Backend (C++) |

---

## Detailed Path Breakdown

### 1. CLIPS DIRECTORY (Main Storage)

**Base Path:** Configurable via `settings.json` → `output_path` (default: `D:\Clips\ClipVault`)

**Files:**
- `*.mp4` - Main clip files (e.g., `2026-01-31_18-58-22.mp4`)
  - **Created by:** Backend C++ (`src/replay.cpp`) via OBS replay buffer
  - **Naming format:** `%CCYY-%MM-%DD_%hh-%mm-%ss.mp4`
  - **Accessed by:** UI for library display, editing, export

- `*.clipvault.json` - Per-clip metadata files
  - **Created by:** UI (`ui/src/main/main.ts`)
  - **Format:** `{clipId}.clipvault.json`
  - **Contains:** Tags, trim points, favorite status, audio track settings

- `exported-clips\*.mp4` - Exported clips with edits
  - **Created by:** UI export feature
  - **Naming format:** `{originalName}_export_{timestamp}.mp4`
  - **Purpose:** User exports with applied trim, audio mixing, etc.

**Configuration:**
- Both backend and UI read from `%APPDATA%\ClipVault\settings.json`
- Key: `output_path` (string)
- Default: `D:\Clips\ClipVault`
- Backend auto-restarts when settings change to apply new path

**Code Locations:**
```typescript
// UI: ui/src/main/main.ts - Dynamic function
function getClipsPath(): string {
  const settingsPath = getSettingsPath()
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    return settings.output_path || 'D:\\Clips\\ClipVault'
  }
  return 'D:\\Clips\\ClipVault'
}

// Backend: src/config.cpp (default value, overridden by settings)
config_.output_path = "D:\\Clips\\ClipVault"; // Default only
```

---

### 2. APPDATA / USERDATA (Cache & Config)

**Base Path:** `%APPDATA%\ClipVault` (Windows: `C:\Users\{user}\AppData\Roaming\ClipVault`)

**Files:**

#### Settings/Config
- `settings.json` - Main configuration file
  - **Created by:** Backend C++ (`src/main.cpp:210`) or UI
  - **Format:** JSON with video, audio, hotkey, UI settings
  - **Example:**
    ```json
    {
      "output_path": "D:\\Clips\\ClipVault",
      "buffer_seconds": 120,
      "video": { "width": 1920, "height": 1080, "fps": 60, ... },
      "audio": { "sample_rate": 48000, "bitrate": 160, ... },
      "hotkey": { "save_clip": "F9" }
    }
    ```
  - **Code Locations:**
    - Backend: `src/main.cpp:197-210`
    - UI: `ui/src/main/main.ts:391-453`

#### Thumbnails (Cache)
- `thumbnails\*.jpg` - Clip thumbnail images
  - **Created by:** UI FFmpeg (`ui/src/main/main.ts:583-619`)
  - **Format:** `{clipId}.jpg`
  - **Size:** 480x270 (16:9)
  - **Cleanup:** Automatic orphaned cleanup on startup
  - **Path:** `join(app.getPath('userData'), 'thumbnails')`

#### Audio Cache (Temporary)
- `thumbnails\audio\*.m4a` - Extracted audio tracks for editor
  - **Created by:** UI FFmpeg (`ui/src/main/main.ts:837-904`)
  - **Formats:**
    - `{clipId}_track1.m4a` - Desktop audio (track 1)
    - `{clipId}_track2.m4a` - Microphone (track 2)
  - **Encoding:** AAC, 128kbps
  - **Cleanup:** Automatic orphaned cleanup on startup
  - **Purpose:** Web Audio API playback in editor

**Code Locations:**
```typescript
// Thumbnails path
const thumbnailsPath = join(app.getPath('userData'), 'thumbnails')

// Audio cache path
const audioCachePath = join(thumbnailsPath, 'audio')

// Config path
join(app.getPath('appData'), 'ClipVault', 'settings.json')
```

---

### 3. BACKEND LOG FILES (C++)

**Base Path:** `{backend_exe_directory}` (varies by mode)

**Files:**
- `clipvault.log` - Main log file
  - **Created by:** Backend C++ (`src/logger.cpp`)
  - **Max Size:** 10 MB
  - **Rotation:** Automatic (keeps 3 backups)
  
- `clipvault.log.1` - First backup
- `clipvault.log.2` - Second backup  
- `clipvault.log.3` - Third backup

**Path Resolution (varies by mode):**
```typescript
// Production (packaged)
join(process.resourcesPath, 'bin', 'clipvault.log')
// → {app_dir}\resources\bin\clipvault.log

// Development
join(appDir, '..', '..', '..', 'bin', 'clipvault.log')
// → {project_root}\bin\clipvault.log
```

**C++ Code:** `src/main.cpp:164`
```cpp
std::string log_path = exe_dir + "\\clipvault.log";
```

---

### 4. RESOURCES (Bundled Files)

**Base Path:** `process.resourcesPath` (Electron resources folder)

**Production Structure:**
```
{app_dir}\resources\
├── 64x64.png              # Drag icon for file drag operations
├── bin\
│   ├── ClipVault.exe      # C++ Backend executable
│   ├── clipvault.log      # Backend log file
│   ├── obs.dll            # OBS libraries
│   ├── 64x64-2.png        # Tray icon
│   ├── data\              # OBS data files
│   └── obs-plugins\       # OBS plugins
└── ffmpeg\
    ├── ffmpeg.exe         # Video processing
    └── ffprobe.exe        # Video metadata
```

**Icons:**
- `64x64.png` - Drag icon (file drag to Discord, etc.)
- `64x64-2.png` - Tray icon (system tray notification area)

**Code Locations:**
```typescript
// Backend executable
join(process.resourcesPath, 'bin', 'ClipVault.exe')

// Tray icon (used by backend)
join(process.resourcesPath, 'bin', '64x64-2.png')

// Drag icon (used by UI)
join(process.resourcesPath, '64x64.png')

// FFmpeg
join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
join(process.resourcesPath, 'ffmpeg', 'ffprobe.exe')
```

---

### 5. DEVELOPMENT PATHS

**Project Root:** `D:\Projects-Personal\ClipVault2`

**Development Structure:**
```
ClipVault2/
├── bin\                          # Backend build output
│   ├── ClipVault.exe
│   ├── clipvault.log
│   ├── obs.dll
│   ├── 64x64-2.png
│   ├── data\                    # OBS data
│   └── obs-plugins\             # OBS plugins
├── ui/
│   ├── resources\               # Bundled resources
│   │   ├── 64x64.png
│   │   └── bin\                 # Backend copied here for packaging
│   ├── src/
│   │   ├── main\                # Electron main process
│   │   ├── preload\             # IPC bridge
│   │   └── renderer\            # React UI
│   └── release\                 # Packaged app output
│       └── win-unpacked\        # Final app
│           ├── ClipVault.exe    # Main Electron app
│           └── resources\       # Same as above
└── config\                      # Development config (optional)
    └── settings.json
```

---

## Path Resolution by Mode

### Production Mode (Packaged App)

**UI Executable:** `ui\release\win-unpacked\ClipVault.exe`

**Path Resolution:**
```typescript
// Main clips (from settings)
const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
settings.output_path  // Default: 'D:\\Clips\\ClipVault'

// User data (cache, thumbnails)
app.getPath('userData')  // → C:\Users\{user}\AppData\Roaming\ClipVault

// Resources (bundled)
process.resourcesPath    // → {exe_dir}\resources

// Backend
join(process.resourcesPath, 'bin', 'ClipVault.exe')
// → {exe_dir}\resources\bin\ClipVault.exe

// Backend log
join(process.resourcesPath, 'bin', 'clipvault.log')
// → {exe_dir}\resources\bin\clipvault.log

// Config
join(app.getPath('appData'), 'ClipVault', 'settings.json')
// → C:\Users\{user}\AppData\Roaming\ClipVault\settings.json
```

### Development Mode

**UI Executable:** Running via `npm run dev`

**Path Resolution:**
```typescript
// Main clips (from settings, same file as production)
const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
settings.output_path  // Default: 'D:\\Clips\\ClipVault'

// User data
app.getPath('userData')  // Electron dev userData path

// Backend (different location in dev)
join(appDir, '..', '..', '..', 'bin', 'ClipVault.exe')
// → D:\Projects-Personal\ClipVault2\bin\ClipVault.exe

// Backend log (in bin folder)
join(appDir, '..', '..', '..', 'bin', 'clipvault.log')
// → D:\Projects-Personal\ClipVault2\bin\clipvault.log

// Drag icon (project root)
join(appDir, '..', '..', '..', '64x64.png')
// → D:\Projects-Personal\ClipVault2\64x64.png
```

---

## Custom Protocol Handler

The app registers a custom protocol `clipvault://` to serve files:

```typescript
// Protocol mappings
clipvault://clip/{filename}     → clipsPath (D:\Clips\ClipVault)
clipvault://thumb/{filename}    → thumbnailsPath (%APPDATA%\ClipVault\thumbnails)
clipvault://audio/{filename}    → join(thumbnailsPath, 'audio')
clipvault://exported/{filename} → join(clipsPath, 'exported-clips')
```

**Used for:** Loading videos, thumbnails, and audio in the renderer process without exposing full file system paths.

**Code Location:** `ui/src/main/main.ts:1042-1097`

---

## Cleanup Behavior

### Automatic (Permanent Deletion)

1. **Orphaned Cache Cleanup** - Runs 5 seconds after app startup
   - Scans thumbnails folder for `.jpg` files
   - Scans audio folder for `.m4a` files
   - Deletes cache files for clips that no longer exist in clips folder
   - **Bypasses recycle bin** (uses `fs.unlink()`)

2. **Log Rotation** - Backend only
   - When `clipvault.log` exceeds 10 MB
   - Rotates to `.1`, `.2`, `.3` (deletes `.3` if exists)
   - **Bypasses recycle bin**

### Manual (Not Implemented)

- No UI for clearing cache yet
- No "delete clip" functionality (user must manually delete from `D:\Clips\ClipVault`)
- Cache cleanup only happens automatically for orphaned files

---

## Storage Estimates

| Data Type | Size per Item | Example Accumulation |
|-----------|---------------|---------------------|
| Main clip (2 min, 1080p60) | ~200-400 MB | 100 clips = ~30 GB |
| Exported clip | Varies by length | User controlled |
| Thumbnail | ~50-100 KB | 1000 clips = ~75 MB |
| Audio cache (2 min clip) | ~4-8 MB | 100 clips viewed = ~600 MB |
| Config file | ~1 KB | Negligible |
| Backend log | Max 10 MB x 4 files = 40 MB | Max 40 MB |

**Total Cache (auto-deletable):** thumbnails + audio cache = ~675 MB per 100 clips viewed
