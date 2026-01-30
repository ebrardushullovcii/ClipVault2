# ClipVault - Project Overview

Game clip recorder for Windows. Press F9, instantly save the last 2 minutes as a high-quality MP4 with two separate audio tracks (game audio + microphone).

## Quick Links

- **README.md** - Full project description, features, usage guide
- **AGENTS.md** - Build commands, code style, OBS patterns (agents start here)
- **AGENT_WORKFLOW.md** - Step-by-step development process
- **PROGRESS.md** - Current status and active tasks (check this frequently!)
- **PLAN.md** - Static development roadmap (don't modify - use PROGRESS.md for updates)

## Documentation

| File | Purpose | Frequency |
|------|---------|-----------|
| `README.md` | Project overview, features, quick start | Once |
| `AGENTS.md` | **Agent guidelines** - build, style, patterns, rules | Every session |
| `AGENT_WORKFLOW.md` | Step-by-step workflow for agents | Before starting work |
| `PROGRESS.md` | Current status, blockers, recent changes | **Check every time!** |
| `PLAN.md` | Static roadmap (don't modify) | Reference only |
| `docs/` | Technical references (LIBOBS, IMPLEMENTATION, etc.) | As needed |

**Important**: PLAN.md is static - don't modify it. Use PROGRESS.md to track actual progress.

See README.md for full project details.

## Current Status

**Phase 1**: Core Clipping Engine (command-line/tray app)
- Next task: Implement `src/replay.cpp` (see PROGRESS.md)

## Tech Stack

- **Language**: C++17
- **Platform**: Windows 10/11
- **Capture**: libobs
- **Video**: NVENC / x264
- **Audio**: AAC
- **Build**: CMake + MinGW
