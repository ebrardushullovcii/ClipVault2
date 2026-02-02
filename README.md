# ClipVault

> **Development Workflow**: All work is done on branches and through pull requests. See [AGENTS.md](AGENTS.md) for details.

A lightweight game clipping tool for Windows. Press F9, get the last 2 minutes as a perfect-quality MP4 with two separate audio tracks.

## Features

- **Invisible Recording** - Runs in system tray, always recording
- **Two Audio Tracks** - Game audio + microphone, independently adjustable
- **Anti-Cheat Safe** - Monitor capture, no game hooks or injection
- **Hardware Encoding** - NVENC for minimal performance impact (fallback to x264)
- **Modern UI** - Browse clips, trim, adjust audio, export to Discord/YouTube
- **Single EXE** - Self-contained application, no installer needed

## Requirements

- Windows 10/11
- NVIDIA GPU (GTX 600+) for NVENC, or CPU fallback with x264
- ~1-2GB RAM for 2-minute 1080p60 buffer

## Quick Start

### Run Packaged App

```powershell
cd ui\release\win-unpacked
.\ClipVault.exe
```

### Development

```powershell
# Build C++ backend
.\build.ps1

# Run backend (tray icon only)
.\bin\ClipVault.exe

# Run UI dev server
cd ui && npm run dev

# Build full packaged app
.\build.ps1
cd ui && npm run build:react && npx electron-builder --win --dir
```

## Usage

1. Run ClipVault - backend starts in system tray, UI opens
2. Play games normally - always recording last 2 minutes
3. Press **F9** to save a clip
4. Clip appears in UI library automatically
5. Click clip to edit: trim, adjust audio, add tags
6. Export and drag to Discord

## Project Status

**Status: Complete** - Full application working

| Component | Status |
|-----------|--------|
| Core Recording Engine (C++) | Complete |
| Clip Library UI (Electron) | Complete |
| Video Editor (trim, audio) | Complete |
| Export System | Complete |
| Single EXE Packaging | Complete |

## Documentation

| File | Description |
|------|-------------|
| [PROGRESS.md](PROGRESS.md) | Current status and active tasks |
| [PLAN.md](PLAN.md) | Development roadmap |
| [AGENTS.md](AGENTS.md) | Build commands, code style, agent rules |
| [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) | Step-by-step development process |
| [CLAUDE.md](CLAUDE.md) | Claude AI context and guidelines |
| [docs/BUILD.md](docs/BUILD.md) | Building from source |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design |
| [docs/LIBOBS.md](docs/LIBOBS.md) | libobs API patterns |
| [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | Step-by-step implementation guide |
| [TESTING.md](TESTING.md) | Manual testing procedures |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and solutions |

## Code Reviews

This project uses [CodeRabbit](https://coderabbit.ai) for AI-powered code reviews on all pull requests. CodeRabbit automatically reviews:
- C++ backend code (`src/`)
- TypeScript/React UI code (`ui/src/`)

Use `@coderabbitai` commands in PR comments:
- `@coderabbitai summarize` - Get PR summary
- `@coderabbitai explain` - Explain specific code sections
- `@coderabbitai walkthrough` - Step-by-step walkthrough

## Architecture

```
┌─────────────────────────────────────────────────┐
│ ClipVault Application                            │
├─────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────────────┐    │
│  │ Electron UI │◄──►│ C++ Backend (OBS)   │    │
│  │  React/TS   │    │ Tray icon, F9, rec  │    │
│  └─────────────┘    └─────────┬───────────┘    │
│                              │                 │
│  ui/release/win-unpacked/     ▼                 │
│  ClipVault.exe (172 MB)    bin/                │
│  - Electron runtime       ClipVault.exe        │
│  - React UI               - OBS capture        │
│  - C++ backend bundled    - NVENC encoding     │
│  - OBS DLLs               - Replay buffer      │
│  - FFmpeg                 - F9 hotkey          │
└─────────────────────────────────────────────────┘
```

## Configuration

Edit `config/settings.json`:

```json
{
    "output_path": "D:\\Clips\\ClipVault",
    "buffer_seconds": 120,
    "video": {
        "width": 1920,
        "height": 1080,
        "fps": 60,
        "encoder": "auto",
        "quality": 20
    },
    "audio": {
        "sample_rate": 48000,
        "bitrate": 160,
        "channels": 2
    },
    "hotkey": {
        "save_clip": "F9"
    }
}
```

## Troubleshooting

**App won't start?**
```powershell
Get-Content .\bin\clipvault.log
```

**No audio tracks?**
```powershell
ffprobe -show_streams clip.mp4 2>&1 | Select-String "codec_type=audio"
```

**Build issues?**
```powershell
.\build.ps1 -Clean
.\build.ps1
```

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more.

## Building from Source

See [docs/BUILD.md](docs/BUILD.md) for detailed instructions.

## License

MIT