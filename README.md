# ClipVault

A lightweight game clipping tool for Windows. Press F9 to save the last 2 minutes as a high-quality MP4 with separate game audio and microphone tracks.

## Features

- **Always Recording** - Runs silently in system tray, continuously buffering gameplay
- **Two Audio Tracks** - Game audio + microphone on separate tracks, adjustable in editor
- **Anti-Cheat Safe** - Uses monitor capture (no game hooks or injection)
- **Hardware Encoding** - NVENC for minimal CPU impact (x264 fallback)
- **Modern Editor** - Browse clips, trim, adjust audio, export to Discord/YouTube
- **Single EXE** - Self-contained, no installation required

## Requirements

- Windows 10/11
- NVIDIA GPU (GTX 600+) for NVENC, or any CPU for x264 fallback
- ~500MB RAM for 2-minute 1080p60 buffer

## Quick Start

**Run the app:**
```powershell
.\ClipVault.exe
```

**Usage:**
1. ClipVault starts in system tray, recording begins automatically
2. Play games normally - last 2 minutes always buffered
3. Press **F9** to save a clip
4. Clip appears in library - click to edit, trim, export

## Configuration

Settings are stored at `%APPDATA%\ClipVault\settings.json` and can be changed in the Settings UI:

- **Clips folder** - Where clips are saved
- **Buffer duration** - How much gameplay to keep (30-300 seconds)
- **Quality preset** - Low/Medium/High/Ultra
- **Resolution/FPS** - Match your monitor or downscale
- **Audio devices** - Choose system audio and microphone sources

## Building from Source

```powershell
# Build C++ backend
npm run backend:build

# Build UI and package
npm install
npm run package:portable
```

Output: `ui\release\win-unpacked\ClipVault.exe`

See [docs/BUILD.md](docs/BUILD.md) for detailed instructions.

## Project Structure

```
ClipVault/
├── src/           # C++ backend (OBS-based recording engine)
├── ui/            # Electron + React frontend
├── bin/           # Backend build output
├── config/        # Default settings template
└── docs/          # Technical documentation
```

## Documentation

| File | Description |
|------|-------------|
| [docs/BUILD.md](docs/BUILD.md) | Building and packaging |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design |
| [docs/LIBOBS.md](docs/LIBOBS.md) | OBS API patterns |
| [docs/FILE_PATHS.md](docs/FILE_PATHS.md) | File locations |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues |
| [AGENTS.md](AGENTS.md) | For AI agents working on this codebase |

## License

GPL-2.0-or-later

This project uses libobs from OBS Studio, which is licensed under GPL-2.0-or-later. As required by the GPL, this project is also licensed under GPL-2.0-or-later.
