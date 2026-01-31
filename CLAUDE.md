# ClipVault - Project Overview

> **This file is deprecated.** Please see [PROGRESS.md](PROGRESS.md) for current status.

## Quick Links

| File | Description |
|------|-------------|
| [README.md](README.md) | Project overview, features, quick start |
| [PROGRESS.md](PROGRESS.md) | **Current status** - always check this first |
| [PLAN.md](PLAN.md) | Static development roadmap |
| [AGENTS.md](AGENTS.md) | Build commands, code style, agent rules |
| [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) | Step-by-step development process |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | C++17 with libobs (OBS Studio) |
| UI | Electron + React + TypeScript |
| Video | NVENC (hardware) / x264 (CPU fallback) |
| Audio | AAC (2 separate tracks) |
| Build | CMake + MinGW |
| Packaging | Electron Builder |

## Application Status

**Complete** - Full application working

- Core recording engine (C++ backend)
- Clip library browser (Electron UI)
- Video editor (trim, audio controls)
- Export system (FFmpeg-based)
- Single EXE packaging
