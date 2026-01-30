# ClipVault - Project Overview

Game clip recorder for Windows. Press F9, instantly save the last 2 minutes as a high-quality MP4 with two separate audio tracks (game audio + microphone).

## Quick Links

- **README.md** - Full project description, features, usage guide
- **AGENTS.md** - Build commands, code style, OBS patterns (agents start here)
- **AGENT_WORKFLOW.md** - Step-by-step development process
- **PLAN.md** - Development roadmap and current status

## Documentation

| File | Purpose |
|------|---------|
| `README.md` | Project overview, features, quick start |
| `AGENTS.md` | **Agent guidelines** - build, style, patterns, rules |
| `AGENT_WORKFLOW.md` | Step-by-step workflow for agents |
| `PLAN.md` | Roadmap and implementation status |
| `docs/` | Technical references (LIBOBS, IMPLEMENTATION, etc.) |

See README.md for full project details.

## Current Status

**Phase 1**: Core Clipping Engine (command-line/tray app)
- Next task: Implement `src/replay.cpp` (see PLAN.md)

## Tech Stack

- **Language**: C++17
- **Platform**: Windows 10/11
- **Capture**: libobs
- **Video**: NVENC / x264
- **Audio**: AAC
- **Build**: CMake + MinGW
