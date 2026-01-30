# ClipVault - Project Overview

Game clip recorder for Windows. User presses F9, gets the last 2 minutes saved as MP4 with two audio tracks (game + microphone).

## Quick Reference

See **AGENTS.md** for:
- Build commands
- Code style guidelines  
- OBS patterns and pitfalls

## Documentation

| File | Purpose |
|------|---------|
| `AGENTS.md` | Build commands, code style, OBS patterns |
| `docs/LIBOBS.md` | Full libobs API reference |
| `docs/IMPLEMENTATION.md` | Step-by-step implementation guide |
| `CONVENTIONS.md` | Complete style guide |
| `TESTING.md` | Manual test procedures |
| `PLAN.md` | Development roadmap |

## Current Status

**Phase 1**: Core Clipping Engine (command-line/tray app)

## Tech Stack

- **Language**: C++17
- **Platform**: Windows 10/11 only
- **Capture**: libobs (built from source)
- **Video**: NVENC or x264
- **Audio**: AAC via FFmpeg
- **Build**: CMake + MinGW
