# ClipVault Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         ClipVault                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐           │
│  │ Hotkey  │  │  System  │  │ Config │  │  Logger  │           │
│  │ Handler │  │   Tray   │  │        │  │          │           │
│  └────┬────┘  └────┬─────┘  └────┬───┘  └────┬─────┘           │
│       │            │             │            │                  │
│       └────────────┴──────┬──────┴────────────┘                  │
│                           │                                      │
│                    ┌──────▼──────┐                               │
│                    │     App     │                               │
│                    │  Lifecycle  │                               │
│                    └──────┬──────┘                               │
│                           │                                      │
├───────────────────────────┼──────────────────────────────────────┤
│                    ┌──────▼──────┐                               │
│                    │  OBS Core   │                               │
│                    │   Context   │                               │
│                    └──────┬──────┘                               │
│                           │                                      │
│         ┌─────────────────┼─────────────────┐                    │
│         │                 │                 │                    │
│  ┌──────▼──────┐  ┌───────▼───────┐  ┌─────▼─────┐              │
│  │   Capture   │  │   Encoders    │  │  Replay   │              │
│  │   Sources   │  │               │  │  Buffer   │              │
│  └─────────────┘  └───────────────┘  └───────────┘              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │     libobs      │
                    │ (obs-studio-src)│
                    └─────────────────┘
```

## Component Responsibilities

### App Layer

| Component | File | Responsibility |
|-----------|------|----------------|
| Main | main.cpp | Process lifecycle, single-instance guard, config bootstrap |
| Hotkey | hotkey.cpp | F9 global hotkey registration and handling |
| Tray | tray.cpp | System tray icon and context menu |
| Config | config.cpp | Load/save settings.json |
| Logger | logger.cpp | File and console logging |

### OBS Layer

| Component | File | Responsibility |
|-----------|------|----------------|
| ObsCore | obs_core.cpp | OBS startup, video/audio init, module loading |
| Capture | capture.cpp | Monitor capture, system audio, microphone sources |
| Encoder | encoder.cpp | NVENC/x264 video, AAC audio encoders |
| Replay | replay.cpp | Replay buffer output, save triggering |

## Data Flow

### Video Path
```
Monitor → obs_source (monitor_capture)
       → obs_encoder (h264_nvenc)
       → obs_output (replay_buffer)
       → MP4 file
```

### Audio Path (2 tracks)
```
System Audio → obs_source (wasapi_output_capture) → mixer track 1 → aac encoder 1 ─┐
                                                                                    ├→ MP4
Microphone   → obs_source (wasapi_input_capture)  → mixer track 2 → aac encoder 2 ─┘
```

## Threading Model

libobs handles threading internally:
- **Graphics thread** - Renders video frames
- **Audio thread** - Mixes audio samples
- **Encoder threads** - One per encoder
- **Output thread** - Writes to file

ClipVault runs on:
- **Main thread** - Win32 message pump, tray, hotkey
- All libobs work delegated to libobs threads

## Memory Model

Replay buffer memory usage:
- Video: ~150MB for 2 min @ 1080p60 CQP20
- Audio: ~10MB for 2 tracks @ 160kbps
- Total: ~200MB typical

Memory is managed by libobs replay_buffer output.

## Initialization Sequence

```
1. main()
   ├── Logger::init()
   ├── Config::load()
   ├── App::init()
   │   ├── Tray::init()
   │   ├── Hotkey::register()
   │   └── ObsCore::init()
   │       ├── obs_startup()
   │       ├── obs_add_data_path()
   │       ├── obs_add_module_path()
   │       ├── obs_load_all_modules()
   │       ├── obs_post_load_modules()
   │       ├── obs_reset_video()
   │       └── obs_reset_audio()
   │
   ├── Capture::init()
   │   ├── create monitor_capture
   │   ├── create wasapi_output_capture
   │   └── create wasapi_input_capture
   │
   ├── Encoder::init()
   │   ├── create h264_nvenc (or x264)
   │   ├── create aac encoder 1
   │   └── create aac encoder 2
   │
   └── Replay::init()
       ├── create replay_buffer output
       ├── connect encoders
       └── obs_output_start()

2. Message loop runs...

3. User presses F9
   └── Replay::save()
       ├── proc_handler_call("save")
       └── Wait for "saved" signal

4. App::shutdown()
   ├── Replay::stop()
   ├── Encoder::destroy()
   ├── Capture::destroy()
   └── ObsCore::shutdown()
       └── obs_shutdown()
```

## Error Handling Strategy

- **Initialization errors** - Log and exit with clear message
- **Runtime errors** - Log, show tray notification, continue if possible
- **Save errors** - Log, show tray notification, keep buffer running

## File Locations

| File | Location |
|------|----------|
| Executable | `bin/ClipVault.exe` |
| Config | `%APPDATA%\\ClipVault\\settings.json` (runtime), `config/settings.json` (template) |
| Log | `bin/clipvault.log` |
| Clips | User-configured (default: `D:\Clips\ClipVault\`) |
| OBS plugins | `bin/obs-plugins/64bit/` |
| OBS data | `bin/data/libobs/` |
