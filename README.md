# ClipVault

A **lightweight, open-source game clipping tool** for Windows. Press F9, instantly save the last 2 minutes as a high-quality MP4 with separate audio tracks.

## Project Vision

**Goal**: Create a performance-focused clipping software comparable to **Outplayed** or **SteelSeries GG** - minimal CPU/GPU/RAM usage while maintaining excellent capture quality.

**Key Requirements**:
- **Performance**: Minimal resource usage comparable to commercial tools (actual targets TBD based on measurement)
- **Quality**: Visually comparable to commercial solutions (slightly lower acceptable)
- **Audio**: Two separate channels (system audio + microphone) for later mixing
- **Workflow**: Non-destructive editing → export short clips from 2-3 min recordings
- **Configuration**: JSON-based settings (resolution, FPS, buffer length, etc.)
- **Target Users**: Personal use + friends (small scale, open source)

## Features

- **Invisible** - Runs in system tray with minimal CPU usage (NVENC hardware encoding)
- **Two Audio Tracks** - Game audio (track 1) + microphone (track 2), separately adjustable
- **Anti-Cheat Safe** - Monitor capture only, no hooks or injection
- **Hardware Encoding** - NVIDIA NVENC (GTX 600+) with CPU x264 fallback
- **Configurable** - JSON settings for resolution, FPS, quality, buffer duration
- **Non-Destructive Editing** - Phase 2: Library + trim/export without re-encoding
- **Lightweight** - Designed for long recording sessions without impacting gameplay

## Performance Goals

**Target**: Comparable to tools like Outplayed, Medal, or SteelSeries GG

**Observed with similar tools**:
- Outplayed: ~1.2-1.5GB RAM usage
- CPU impact: Minimal with hardware encoding
- No noticeable FPS drops during gameplay

**Our Approach**:
- Use NVENC hardware encoding to minimize CPU load
- Buffer compressed video (not raw frames) in memory
- Optimize for user's specific hardware
- Measure actual performance once replay buffer is implemented
- Tune settings based on real-world usage

**Quality Settings** (configurable in `config/settings.json`):
- Resolution: 1080p (configurable)
- Framerate: 60 FPS (configurable)
- Bitrate: ~15 Mbps for high quality
- Acceptable trade-off: Slightly lower quality than premium tools is okay (5-10% difference)

## Requirements

- Windows 10/11
- NVIDIA GPU (GTX 600+) for NVENC hardware encoding, or CPU x264 fallback
- RAM: Depends on buffer duration and quality settings (typical 1-2GB for 2-minute 1080p60)

## Quick Start

```powershell
# Build
.\build.ps1

# Run (starts in system tray)
.\bin\ClipVault.exe

# View logs in real-time
Get-Content -Path .\bin\clipvault.log -Wait -Tail 20

# Stop the app
taskkill /IM ClipVault.exe /F

# Clean build
Remove-Item -Recurse -Force .\build
.\build.ps1
```

## Development Status

**Current Phase: 1.3 - Capture Sources**

Completed:
- ✅ File logging system
- ✅ System tray with menu
- ✅ Configuration loading from JSON
- ✅ Clips folder management
- ✅ OBS initialization (video + audio)
- ✅ OBS module loading

Next: Capture sources (monitor, system audio, microphone)

## Usage

1. Run ClipVault (starts in system tray - look for icon in bottom-right)
2. Right-click tray icon for menu:
   - **Open Clips Folder** - Opens `D:\Clips\ClipVault`
   - **Exit** - Closes the app
3. View logs: `.\bin\clipvault.log`

*Note: Recording functionality not yet implemented. Currently a Hello World tray app.*

## Configuration

Edit `bin/config/settings.json`:

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
        "system_audio_enabled": true,
        "microphone_enabled": true
    },
    "hotkey": {
        "save_clip": "F9"
    },
    "ui": {
        "show_notifications": true,
        "minimize_to_tray": true,
        "start_with_windows": false
    }
}
```

Restart ClipVault after editing config.

## Troubleshooting

**App won't start?**
```powershell
# Check the log file
type .\bin\clipvault.log
```

**Can't find tray icon?**
- Look in bottom-right taskbar, click the ^ arrow to show hidden icons
- Icon shows as default Windows application icon

**Need to restart?**
```powershell
taskkill /IM ClipVault.exe /F
.\bin\ClipVault.exe
```

**Build issues?**
```powershell
# Clean build
Remove-Item -Recurse -Force .\build
.\build.ps1
```

For more issues, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

## Documentation Map

**For Users:**
- This README - Quick start and usage
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common problems and fixes
- `config/settings.json` - Configuration reference

**For Developers/Agents:**
| Document | Purpose | Read When |
|----------|---------|-----------|
| [AGENTS.md](AGENTS.md) | **START HERE** - Build commands, code style, OBS patterns | Every agent session |
| [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) | Step-by-step development process | Before starting work |
| [PLAN.md](PLAN.md) | Development roadmap and current status | To find next task |
| [CONVENTIONS.md](CONVENTIONS.md) | Complete code style guide | When writing new code |
| [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | Step-by-step coding examples | When implementing features |
| [docs/LIBOBS.md](docs/LIBOBS.md) | Full libobs API reference | When using OBS functions |
| [TESTING.md](TESTING.md) | Manual test procedures | After completing features |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and data flow | Understanding overall structure |
| [docs/BUILD.md](docs/BUILD.md) | Detailed build instructions | Build troubleshooting |

## For Agents (Opencode, Claude Code, etc.)

### What You Can Do
✅ **Write and modify code** (src/, scripts/)  
✅ **Update documentation** (AGENTS.md, PLAN.md, etc.) when things change  
✅ **Add new documentation** when you discover patterns or gotchas  
✅ **Fix errors** in existing docs if you find them  
✅ **Create TODOs** in code comments for future work  

### What You CANNOT Do
❌ **NEVER commit code** - The user will commit manually when ready  
❌ **NEVER push to GitHub** - Wait for user instruction  
❌ **NEVER modify** `.gitignore`, `LICENSE`, or repository structure without asking  

### Rule Documentation Process
**If the user tells you:**
- "Always do X..."
- "Never do Y..."  
- "When Z happens, do this..."

**You MUST ask:**
> "Should I add this rule to AGENTS.md or another documentation file so future agents know it?"

This ensures knowledge persists across sessions and all agents follow the same rules.

### Updating This Repo
The documentation files are living documents. If you:
1. Discover a new pattern or gotcha
2. Find outdated information
3. Complete a phase/task
4. Learn something that would help future agents

**Update the relevant docs** (especially AGENTS.md and PLAN.md) to keep them current.

## Building from Source

See [docs/BUILD.md](docs/BUILD.md) for detailed instructions.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design.

## License

MIT
