# ClipVault Development Plan

This document outlines the complete development roadmap for ClipVault, split into two major phases.

**Note**: This is a static roadmap. For current implementation status, see `PROGRESS.md`.

---

## Phase 1: Core Clipping Engine

**Goal**: A working command-line/tray application that captures video + 2 audio tracks and saves clips on hotkey press.

**Success Criteria**: Press F9 → MP4 file appears with video, system audio (track 1), and microphone (track 2).

### 1.1 Project Setup
- Initialize git repository
- Clone OBS Studio as submodule (`third_party/obs-studio-src`)
- Create build script (`build.ps1`)
- Copy required DLLs and data files to `third_party/obs-download/`

**Verification**: `third_party/obs-studio-src/libobs/obs.h` and `third_party/obs-download/bin/64bit/obs.dll` exist.

### 1.2 Minimal OBS Application
- Create `src/main.cpp` with WinMain
- Create `src/logger.cpp` for file logging
- Create `src/obs_core.cpp` with OBS initialization
- Implement proper init sequence:
  1. `obs_startup()`
  2. `obs_add_data_path()` (with trailing slash!)
  3. `obs_add_module_path()`
  4. `obs_load_all_modules()` (must be before video/audio reset)
  5. `obs_reset_video()` (with `graphics_module = "libobs-d3d11"`)
  6. `obs_reset_audio()`
- Implement clean shutdown

**Verification**: App starts, logs "OBS initialized", shuts down cleanly.

### 1.3 Capture Sources
- Create `src/capture.cpp`
- Implement monitor capture (`monitor_capture` source)
- Implement system audio capture (`wasapi_output_capture`)
- Implement microphone capture (`wasapi_input_capture`)
- Route system audio to mixer track 1
- Route microphone to mixer track 2

**Verification**: All three sources created without errors in log.

### 1.4 Encoders
- Create `src/encoder.cpp` / `src/encoder.h`
- Implement NVENC video encoder (`jim_nvenc`)
- Implement x264 fallback (`obs_x264`)
- Implement AAC encoder creation
- Connect encoders to replay buffer

**Verification**: Encoders created, log shows "NVENC" or "x264" selected.

### 1.5 Replay Buffer
- Create `src/replay.h` (header)
- Create `src/replay.cpp` (implementation)
- Create replay buffer output (`replay_buffer`)
- Connect video encoder to output
- Connect both audio encoders to output
- Set mixer mask to `0x03` (tracks 1 + 2)
- Start replay buffer
- Implement save trigger via `proc_handler_call`
- Connect to "saved" signal for confirmation

**Verification**: "Replay buffer running" in log, no errors.
**Reference**: See `docs/IMPLEMENTATION.md` Phase 5 for code examples

### 1.6 Hotkey & Save
- Create `src/hotkey.h` (header)
- Create `src/hotkey.cpp` (implementation)
- Register global F9 hotkey (Windows API)
- On F9 press, trigger replay buffer save
- Generate filename with timestamp
- Log save path on completion

**Verification**: Press F9 → MP4 file created in output folder.

### 1.7 Configuration
- Create `src/config.cpp` / `src/config.h`
- Load settings from `%APPDATA%\ClipVault\settings.json` (template in `config/settings.json`)
- Support: buffer duration, resolution, FPS, output path, hotkey
- Create default config if missing

**Verification**: Changing `settings.json` affects app behavior.

### 1.8 System Tray
- Create `src/tray.cpp` / `src/tray.h`
- Add system tray icon
- Context menu: Open Clips Folder, Exit
- Show notification on clip save

**Verification**: Tray icon appears, menu works, notification shows on save.

### 1.9 Polish & Testing
- Test with multiple games
- Verify 2 audio tracks with `ffprobe`
- Test NVENC and x264 fallback
- Test various resolutions (1080p, 1440p, 4K)
- Memory usage profiling
- CPU usage profiling

**Phase 1 Complete When**:
- App runs silently in system tray
- F9 saves last 2 minutes as MP4
- MP4 has video + 2 separate audio tracks
- Works with anti-cheat games (monitor capture only)
- CPU/memory usage is reasonable (measure and compare to commercial tools)

---

## Phase 2: Clip Editor UI

**Goal**: A modern, SteelSeries GG-inspired desktop UI for browsing, previewing, and non-destructively editing saved clips.

**Success Criteria**: User can browse clip library, trim clips (start/end), control audio tracks (mute/merge), and export with settings preserved in metadata.

### Technology Stack (Chosen: Electron + React)

| Component | Choice | Reason |
|-----------|--------|--------|
| **UI Framework** | Electron + React + TypeScript | Modern, excellent styling, large ecosystem |
| **Build Tool** | Vite | Fast development, hot reload, optimized builds |
| **Styling** | Tailwind CSS + Framer Motion | Dark theme, smooth animations, SteelSeries GG look |
| **State Management** | Zustand | Simple, performant, minimal boilerplate |
| **Video Player** | libvlc (via node-libvlc) | Robust playback, multi-track audio support |
| **Video Processing** | FFmpeg (node-fluent-ffmpeg) | Non-destructive trims with `-c copy` |
| **Icons** | Lucide React | Clean, modern icon set |

**Reference Design**: SteelSeries GG Moments editor - dark theme, minimalist controls, audio toggle buttons

### 2.1 UI Framework Setup (1-2 days)

- [ ] Initialize Electron + Vite + React + TypeScript project
- [ ] Configure Tailwind CSS with dark theme color palette
- [ ] Set up Zustand for state management
- [ ] Create main process entry (main.ts)
- [ ] Create renderer process entry (App.tsx)
- [ ] Configure IPC bridge for file system access
- [ ] Verify: `npm run dev` launches application

### 2.2 Clip Library Browser (2-3 days)

- [ ] Create `Library.tsx` page component
- [ ] Scan `output_path` for MP4 files
- [ ] Generate thumbnails (extract frame 1 second in via FFmpeg)
- [ ] Display clips in responsive grid (SteelSeries GG style cards)
- [ ] Grid card design: thumbnail, filename, duration, creation date
- [ ] Hover effects: scale up, show play icon
- [ ] Search bar for filtering clips
- [ ] Sort dropdown: date (newest/oldest), duration, name
- [ ] Empty state when no clips exist
- [ ] Click clip → open in editor
- [ ] Context menu: Delete, Open folder, Export

### 2.3 Video Player with Timeline (2-3 days)

- [ ] Create `VideoPlayer.tsx` component with libvlc
- [ ] Video container: 16:9 aspect ratio, black background
- [ ] Playback controls: Play/Pause, -15s/+15s, Fullscreen
- [ ] Keyboard shortcuts: Space (play/pause), J/L (seek), I/O (set trim points)
- [ ] Timeline component: scrubber bar with position indicator
- [ ] Time display: current / total (MM:SS format)
- [ ] Trim markers: draggable handles for start/end points
- [ ] Preview trim: show only selected range when enabled
- [ ] Timeline tooltips: hover to preview time

### 2.4 Audio Controls (1-2 days)

**Requirement**: Simple toggles like SteelSeries GG (no waveform needed)

- [ ] Create `AudioControls.tsx` component
- [ ] Two audio track toggles with icons:
  - Track 1: "Desktop Audio" (speakers icon)
  - Track 2: "Microphone" (microphone icon)
- [ ] Toggle states: ON (green) / OFF (gray with strikethrough)
- [ ] "Preview Both" button: merge audio for playback
- [ ] Track selection affects preview audio in real-time
- [ ] Visual indicators showing which tracks are active

### 2.5 Non-Destructive Editing & Metadata (1-2 days)

**Core Principle**: Never modify original MP4; store edits in sidecar JSON

Sidecar file format: `clips-metadata/{clipId}.json`

```json
{
  "version": 1,
  "originalFile": "2026-01-31_00-25-21.mp4",
  "createdAt": "2026-01-31T00:25:21.000Z",
  "modifiedAt": "2026-01-31T01:15:00.000Z",
  "trim": {
    "enabled": true,
    "startTime": 15.5,
    "endTime": 85.2,
    "duration": 69.7
  },
  "audio": {
    "track1": { "enabled": true, "name": "Desktop Audio" },
    "track2": { "enabled": true, "name": "Microphone" }
  },
  "tags": ["Valorant", "clutch"],
  "notes": "Great clutch round!",
  "favorite": false
}
```

- [ ] Read sidecar on clip load
- [ ] Auto-save edits to sidecar (debounced)
- [ ] Apply trim points from metadata
- [ ] Apply audio settings from metadata
- [ ] "Reset to Original" button (clears trim, resets audio)
- [ ] Metadata persistence: closing app preserves edits
- [ ] Tags input: add/remove tags
- [ ] Notes textarea: add description
- [ ] Favorite button: star/unstar clips

### 2.6 Export Functionality (2-3 days)

**Non-destructive Export**: Uses FFmpeg with `-c copy` for speed

- [ ] Create `ExportDialog.tsx` modal
- [ ] Export settings:
  - Trim: Use current trim points (on/off toggle)
  - Audio: Track 1, Track 2, Both, or Merged
  - Format: MP4 (H.264/AAC)
- [ ] Export presets:
  - **Discord**: 8MB limit, 720p, 60s max
  - **YouTube**: 1080p, high quality
  - **Original**: Same quality as source
- [ ] Export filename: `{original}_edited.mp4` or `{original}_{preset}.mp4`
- [ ] Progress dialog with FFmpeg output
- [ ] Cancel button during export
- [ ] "Open folder" button after export completes
- [ ] Export history log

### 2.7 Settings Panel (1 day)

- [ ] Create `Settings.tsx` page
- [ ] Output folder path (browse button)
- [ ] Default audio behavior (both tracks / ask each time)
- [ ] Auto-export preferences
- [ ] Theme toggle: Dark / Light / System
- [ ] Keyboard shortcuts reference
- [ ] About section with version info

### 2.8 Polish & Integration (2-3 days)

- [ ] Smooth transitions between views (Framer Motion)
- [ ] Toast notifications: "Clip saved", "Export complete", "Error"
- [ ] Loading states for thumbnails and video
- [ ] Drag-and-drop clips from file explorer
- [ ] System tray: "Open Editor" menu item
- [ ] Window state persistence (size, position)
- [ ] Error boundaries for crash handling
- [ ] Performance: Lazy load thumbnails, virtualized grid for large libraries

### 2.9 Testing & Documentation (1-2 days)

- [ ] Test with various clip formats (NVENC, x264, different resolutions)
- [ ] Test audio track control with different sources
- [ ] Test export quality and file sizes
- [ ] Update documentation: UI usage guide
- [ ] Keyboard shortcuts reference sheet
- Configure hotkey
- Configure video quality (resolution, FPS, encoder settings)
- Audio device selection

### 2.8 Integration
- Launch editor from tray menu
- Auto-open editor after saving clip (optional)
- Tray notification click opens clip in editor

**Phase 2 Complete When**:
- Clean UI for browsing all clips
- Video preview with audio track selection
- Trim clips without re-encoding
- Adjust audio levels per track
- Export optimized for Discord/YouTube
- Settings configurable via UI

---

## Technology Decisions

### Phase 1 (Core)
| Component | Choice | Reason |
|-----------|--------|--------|
| Language | C++17 | libobs compatibility |
| Build | CMake + MinGW | No VS dependency |
| Capture | libobs | Proven, handles A/V sync |
| Encoding | NVENC/x264 | Hardware acceleration |

### Phase 2 (UI) - Chosen: Electron + React + TypeScript
| Component | Choice | Reason |
|-----------|--------|--------|
| **Framework** | Electron 27+ | Mature, excellent video support, Windows native |
| **UI Library** | React 18 + TypeScript | Component-based, excellent DX, large ecosystem |
| **Build Tool** | Vite | Fast HMR, optimized production builds |
| **Styling** | Tailwind CSS + Framer Motion | Dark theme, smooth animations, SteelSeries GG look |
| **State** | Zustand | Simple, performant, minimal boilerplate |
| **Video** | libvlc (node-libvlc) | Robust playback, multi-track audio, hardware decode |
| **Processing** | FFmpeg (fluent-ffmpeg) | Non-destructive trims, audio merging |
| **Icons** | Lucide React | Modern, consistent icon set |

**Decision Rationale**: Electron provides the best balance of modern UI capabilities (like SteelSeries GG), robust video/audio handling, and development speed. The app will have a ~150MB footprint which is acceptable for a video editor. React's ecosystem and Tailwind's styling make achieving the target "sleek" look straightforward.

---

## Milestones

| Milestone | Description | Target |
|-----------|-------------|--------|
| M1 | OBS initializes and shuts down cleanly | Phase 1.2 |
| M2 | First clip saved (any quality) | Phase 1.6 |
| M3 | Full quality clip with 2 audio tracks | Phase 1.9 |
| M4 | UI displays clip library | Phase 2.2 |
| M5 | Non-destructive trim working | Phase 2.4 |
| M6 | Full editor feature complete | Phase 2.8 |

---

## File Checklist

### Phase 1 Files

```
src/
├── main.cpp           # Entry point (WinMain)
├── obs_core.h/cpp     # OBS initialization
├── capture.h/cpp      # Video/audio sources
├── encoder.h/cpp      # NVENC/AAC encoders
├── replay.h/cpp       # Replay buffer (CORE FEATURE)
├── hotkey.h/cpp       # F9 handler
├── config.h/cpp       # JSON settings
├── logger.h/cpp       # File logging
└── tray.h/cpp         # System tray
```

### Phase 2 Files (Electron + React)
```
ui/
├── src/
│   ├── main/                    # Electron main process (Node.js)
│   │   ├── main.ts              # App entry, window management
│   │   ├── preload.ts           # IPC bridge setup
│   │   └── ipc-handlers.ts      # File system, FFmpeg operations
│   │
│   ├── renderer/                # React UI (runs in Chromium)
│   │   ├── components/
│   │   │   ├── Layout/          # App shell, navigation
│   │   │   │   ├── AppLayout.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Header.tsx
│   │   │   ├── Library/         # Clip browser
│   │   │   │   ├── Library.tsx
│   │   │   │   ├── ClipGrid.tsx
│   │   │   │   ├── ClipCard.tsx
│   │   │   │   └── Thumbnail.tsx
│   │   │   ├── Editor/          # Video editor
│   │   │   │   ├── Editor.tsx
│   │   │   │   ├── VideoPlayer.tsx
│   │   │   │   ├── Timeline.tsx
│   │   │   │   ├── TrimMarkers.tsx
│   │   │   │   └── AudioControls.tsx
│   │   │   ├── Common/          # Shared components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── IconButton.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Tooltip.tsx
│   │   │   │   └── Toast.tsx
│   │   │   └── Export/          # Export dialog
│   │   │       ├── ExportDialog.tsx
│   │   │       ├── ExportProgress.tsx
│   │   │       └── ExportSettings.tsx
│   │   │
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useVideoPlayer.ts
│   │   │   ├── useClipMetadata.ts
│   │   │   ├── useFFmpeg.ts
│   │   │   └── useKeyboardShortcuts.ts
│   │   │
│   │   ├── stores/              # Zustand state stores
│   │   │   ├── clipStore.ts     # Library state
│   │   │   ├── editorStore.ts   # Editor state (trim, audio)
│   │   │   ├── exportStore.ts   # Export state
│   │   │   └── uiStore.ts       # UI state (theme, modals)
│   │   │
│   │   ├── utils/               # Helper functions
│   │   │   ├── ffmpeg.ts        # FFmpeg wrappers
│   │   │   ├── thumbnail.ts     # Frame extraction
│   │   │   ├── metadata.ts      # JSON read/write
│   │   │   ├── time.ts          # Time formatting
│   │   │   └── file.ts          # File operations
│   │   │
│   │   ├── styles/              # Global styles
│   │   │   ├── theme.ts         # Color palette, Tailwind config
│   │   │   ├── globals.css      # Global CSS
│   │   │   └── animations.ts    # Framer Motion variants
│   │   │
│   │   ├── types/               # TypeScript types
│   │   │   ├── clip.ts          # Clip metadata types
│   │   │   ├── editor.ts        # Editor state types
│   │   │   └── export.ts        # Export settings types
│   │   │
│   │   └── App.tsx              # Root component
│   │
│   └── preload/                 # Preload script
│       └── index.ts             # Expose IPC to renderer
│
├── public/                      # Static assets
│   ├── index.html
│   └── icons/
│
├── package.json                 # Scripts + electron-builder config
├── tsconfig.json
├── vite.config.ts               # Vite + Electron plugin
├── tailwind.config.js           # Tailwind + custom theme
└── .env                         # Environment variables
```

---

## Notes for LLM Agents

1. **Always complete Phase 1 before starting Phase 2**
2. **Test each sub-phase before moving on** - verification steps are provided
3. **Read CLAUDE.md and LIBOBS.md** before touching OBS code
4. **Common failure point**: OBS initialization order and data paths
5. **Don't skip steps** - each builds on the previous
6. **Ask user** before making technology decisions for Phase 2

**For current status**: See `PROGRESS.md` (dynamic, updated frequently)
