# ClipVault

A lightweight game clipping tool for Windows. Press F9, get the last 2 minutes as a perfect-quality MP4.

## Features

- **Invisible** - Runs in system tray, under 5% CPU
- **Two Audio Tracks** - Game audio + microphone, separately adjustable
- **Anti-Cheat Safe** - Monitor capture only, no hooks or injection
- **Hardware Encoding** - NVENC for minimal performance impact
- **Simple** - One hotkey, no complex UI

## Requirements

- Windows 10/11
- NVIDIA GPU (GTX 600+) for NVENC, or CPU fallback
- ~200MB RAM for 2-minute buffer

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

## Building from Source

See [docs/BUILD.md](docs/BUILD.md) for detailed instructions.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design.

## License

MIT
