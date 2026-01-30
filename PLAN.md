# ClipVault Development Plan

This document outlines the complete development roadmap for ClipVault, split into two major phases.

---

## Phase 1: Core Clipping Engine

**Goal**: A working command-line/tray application that captures video + 2 audio tracks and saves clips on hotkey press.

**Success Criteria**: Press F9 → MP4 file appears with video, system audio (track 1), and microphone (track 2).

### 1.1 Project Setup
- [x] Initialize git repository
- [x] Clone OBS Studio as submodule (`third_party/obs-studio-src`)
- [x] Create build script (`build.ps1`)
- [x] Copy required DLLs and data files to `third_party/obs-download/`
- [ ] Build libobs from source (NOT REQUIRED - using prebuilt from obs-download)

**Status**: ✅ COMPLETE - Using prebuilt OBS binaries
**Verification**: `third_party/obs-studio-src/libobs/obs.h` and `third_party/obs-download/bin/64bit/obs.dll` exist.

### 1.2 Minimal OBS Application
- [x] Create `src/main.cpp` with WinMain
- [x] Create `src/logger.cpp` for file logging
- [x] Create `src/obs_core.cpp` with OBS initialization
- [x] Implement proper init sequence:
  1. `obs_startup()`
  2. `obs_add_data_path()` (with trailing slash!)
  3. `obs_add_module_path()`
  4. `obs_reset_video()` (with `graphics_module = "libobs-d3d11"`)
  5. `obs_reset_audio()`
  6. `obs_load_all_modules()`
- [x] Implement clean shutdown

**Status**: ✅ COMPLETE
**Verification**: App starts, logs "OBS initialized", shuts down cleanly.

### 1.3 Capture Sources
- [x] Create `src/capture.cpp`
- [x] Implement monitor capture (`monitor_capture` source)
- [x] Implement system audio capture (`wasapi_output_capture`)
- [x] Implement microphone capture (`wasapi_input_capture`)
- [ ] Route system audio to mixer track 1 (PENDING - needs replay buffer)
- [ ] Route microphone to mixer track 2 (PENDING - needs replay buffer)

**Status**: 🟡 PARTIAL - Sources created but not routed (waiting for replay buffer)
**Verification**: All three sources created without errors in log.

### 1.4 Encoders
- [x] Create `src/encoder.cpp` / `src/encoder.h`
- [x] Implement NVENC video encoder (`jim_nvenc`)
- [x] Implement x264 fallback (`obs_x264`)
- [x] Implement AAC encoder creation
- [ ] Connect encoders to replay buffer (PENDING - needs replay buffer implementation)

**Status**: 🟡 PARTIAL - Encoder class exists but not integrated into main flow
**Verification**: Encoders created, log shows "NVENC" or "x264" selected.

### 1.5 Replay Buffer ⬅️ CURRENT TASK
- [x] Create `src/replay.h` (header stub created)
- [ ] Create `src/replay.cpp` (NEEDS IMPLEMENTATION)
- [ ] Create replay buffer output (`replay_buffer`)
- [ ] Connect video encoder to output
- [ ] Connect both audio encoders to output
- [ ] Set mixer mask to `0x03` (tracks 1 + 2)
- [ ] Start replay buffer
- [ ] Implement save trigger via `proc_handler_call`
- [ ] Connect to "saved" signal for confirmation

**Status**: 🔴 NOT STARTED - Header exists, implementation needed
**Priority**: HIGH - This is the CORE FEATURE
**Verification**: "Replay buffer running" in log, no errors.
**Reference**: See `docs/IMPLEMENTATION.md` Phase 5 for code examples

### 1.6 Hotkey & Save
- [x] Create `src/hotkey.h` (header stub created)
- [ ] Create `src/hotkey.cpp` (NEEDS IMPLEMENTATION)
- [ ] Register global F9 hotkey (Windows API)
- [ ] On F9 press, trigger replay buffer save
- [ ] Generate filename with timestamp
- [ ] Log save path on completion

**Status**: 🔴 NOT STARTED - Header exists, implementation needed
**Priority**: HIGH - Required for user interaction
**Blocked by**: Phase 1.5 (Replay Buffer)
**Verification**: Press F9 → MP4 file created in output folder.

### 1.7 Configuration
- [x] Create `src/config.cpp` / `src/config.h`
- [x] Load settings from `config/settings.json`
- [x] Support: buffer duration, resolution, FPS, output path, hotkey
- [x] Create default config if missing

**Status**: ✅ COMPLETE
**Verification**: Changing `settings.json` affects app behavior.

### 1.8 System Tray
- [x] Create `src/tray.cpp` / `src/tray.h`
- [x] Add system tray icon
- [x] Context menu: Open Clips Folder, Exit (Status/Settings pending)
- [ ] Show notification on clip save (PENDING - needs replay buffer)

**Status**: 🟡 PARTIAL - Basic tray working, notifications need replay buffer
**Verification**: Tray icon appears, menu works, notification shows on save.

### 1.9 Polish & Testing
- [ ] Test with multiple games
- [ ] Verify 2 audio tracks with `ffprobe`
- [ ] Test NVENC and x264 fallback
- [ ] Test various resolutions (1080p, 1440p, 4K)
- [ ] Memory usage profiling (should be ~200MB for 2 min buffer)
- [ ] CPU usage profiling (should be <5% with NVENC)

**Phase 1 Current Status**:

| Component | Status | Files |
|-----------|--------|-------|
| Project Setup | ✅ Complete | build.ps1, .gitignore, docs |
| OBS Core | ✅ Complete | obs_core.cpp, logger.cpp |
| Capture Sources | ✅ Complete | capture.cpp |
| Encoders | 🟡 Partial | encoder.cpp (not integrated) |
| **Replay Buffer** | 🔴 **Not Started** | **replay.h stub, needs .cpp** ⬅️ |
| **Hotkey** | 🔴 **Not Started** | **hotkey.h stub, needs .cpp** |
| Configuration | ✅ Complete | config.cpp |
| System Tray | 🟡 Partial | tray.cpp (basic, needs notifications) |

**Phase 1 Complete When**:
- App runs silently in system tray
- F9 saves last 2 minutes as MP4
- MP4 has video + 2 separate audio tracks
- Works with anti-cheat games (monitor capture only)
- CPU/memory usage is minimal

**Next Priority**: Implement `src/replay.cpp` (see docs/IMPLEMENTATION.md Phase 5)

---

## Phase 2: Clip Editor UI

**Goal**: A desktop UI for browsing, previewing, and non-destructively editing saved clips.

**Success Criteria**: User can trim clips, adjust audio levels, add markers, and export without re-encoding.

### 2.1 UI Framework Setup
- [ ] Choose UI framework (options: Qt, Dear ImGui, or web-based with Electron/Tauri)
- [ ] Set up project structure for UI
- [ ] Create main window with basic layout

### 2.2 Clip Browser
- [ ] Scan clips folder for MP4 files
- [ ] Display clips in grid/list view
- [ ] Show thumbnails (extract frame from video)
- [ ] Sort by date, game, duration
- [ ] Filter by game (using `games.json` detection)

### 2.3 Video Preview
- [ ] Embed video player in UI
- [ ] Play/pause/seek controls
- [ ] Timeline scrubber
- [ ] Frame-accurate seeking
- [ ] Audio track selection (play track 1, track 2, or both)

### 2.4 Non-Destructive Editing
- [ ] **Trim**: Set in/out points without re-encoding
- [ ] **Audio Levels**: Adjust track 1/track 2 volume independently
- [ ] **Markers**: Add named markers to timeline
- [ ] **Metadata**: Edit clip title, tags, notes
- [ ] Store edits in sidecar file (e.g., `clip.mp4.edit.json`)

### 2.5 Export
- [ ] Export trimmed clip (fast, no re-encode using FFmpeg `-c copy`)
- [ ] Export with audio adjustments (requires audio re-encode only)
- [ ] Export presets: Discord (8MB limit), YouTube, Full Quality
- [ ] Batch export multiple clips

### 2.6 Clip Management
- [ ] Delete clips (with confirmation)
- [ ] Move clips to folders
- [ ] Favorite/star clips
- [ ] Search clips by name/tags

### 2.7 Settings UI
- [ ] Configure buffer duration
- [ ] Configure output folder
- [ ] Configure hotkey
- [ ] Configure video quality (resolution, FPS, encoder settings)
- [ ] Audio device selection

### 2.8 Integration
- [ ] Launch editor from tray menu
- [ ] Auto-open editor after saving clip (optional)
- [ ] Tray notification click opens clip in editor

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

### Phase 2 (UI) - To Be Decided
| Option | Pros | Cons |
|--------|------|------|
| **Qt** | Native, fast, good video support | Large dependency, licensing |
| **Dear ImGui** | Lightweight, C++ native | Limited widgets, custom video player |
| **Tauri** | Modern UI (web), small binary | Rust toolchain, video playback complexity |
| **Electron** | Easy UI development | Large binary, memory heavy |

Recommendation: **Qt** for native performance and good multimedia support, or **Tauri** for modern UI with smaller footprint.

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

### Phase 1 Files - Implementation Status

```
src/
├── main.cpp           ✅ Entry point (WinMain)
├── obs_core.h/cpp     ✅ OBS initialization (COMPLETE)
├── capture.h/cpp      ✅ Video/audio sources (COMPLETE)
├── encoder.h/cpp      🟡 NVENC/AAC encoders (class exists, needs integration)
├── replay.h           ✅ Header stub created
├── replay.cpp         🔴 NEEDS IMPLEMENTATION ⬅️ NEXT TASK
├── hotkey.h           ✅ Header stub created
├── hotkey.cpp         🔴 NEEDS IMPLEMENTATION
├── config.h/cpp       ✅ JSON settings (COMPLETE)
├── logger.h/cpp       ✅ File logging (COMPLETE)
└── tray.h/cpp         🟡 System tray (basic implementation)
```

**Missing Core Feature**: `replay.cpp` - This is the replay buffer that saves clips
**See**: `docs/IMPLEMENTATION.md` Phase 5 for implementation guide

### Phase 2 Files (TBD based on framework)
```
ui/
├── main_window        # Main application window
├── clip_browser       # Grid/list of clips
├── video_player       # Preview player
├── timeline           # Edit timeline
├── export_dialog      # Export options
└── settings_dialog    # Configuration UI
```

---

## Notes for LLM Agents

1. **Always complete Phase 1 before starting Phase 2**
2. **Test each sub-phase before moving on** - verification steps are provided
3. **Read CLAUDE.md and LIBOBS.md** before touching OBS code
4. **Common failure point**: OBS initialization order and data paths
5. **Don't skip steps** - each builds on the previous
6. **Ask user** before making technology decisions for Phase 2
