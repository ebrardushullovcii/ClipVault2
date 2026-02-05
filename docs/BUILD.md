# Building ClipVault

## Prerequisites

Install via [Scoop](https://scoop.sh/):

```powershell
scoop install mingw cmake git nodejs
```

Or manually install:
- MinGW-w64 (GCC 12+)
- CMake 3.20+
- Node.js 18+
- Git

## Building

### Backend (C++)

```powershell
# First-time setup (clones OBS, copies DLLs)
npm run backend:setup

# Regular build
npm run backend:build

# Clean rebuild
npm run backend:clean

# Debug build
npm run backend:debug
```

Output: `bin\ClipVault.exe`

### UI (Electron + React)

```powershell
# Install dependencies (first time)
npm install

# Development mode with hot reload
npm run dev

# Production build
npm run build:react
```

### Full Build (Backend + UI)

```powershell
npm run build:all
```

### Full Package

```powershell
npm run package:portable
```

Output: `ui\release\ClipVault-Portable.exe` (portable app)

### Installer

```powershell
npm run package:win
```

Output: `ui\release\ClipVault-Setup-{version}.exe`

## Directory Structure After Build

```text
bin/                          # Backend build output
├── ClipVault.exe            # Backend executable
├── clipvault.log            # Runtime log
├── obs.dll                  # OBS core
├── libobs-d3d11.dll         # D3D11 graphics
├── obs-nvenc-test.exe       # NVENC detection
├── data/
│   └── libobs/              # OBS shader files
└── obs-plugins/
    └── 64bit/               # OBS plugins (capture, encoding)

ui/release/win-unpacked/     # Packaged app
├── ClipVault.exe            # Electron app (run this)
└── resources/
    ├── bin/                 # Bundled backend + OBS
    ├── ffmpeg/              # FFmpeg binaries
    └── app.asar             # Bundled UI
```

## Troubleshooting

### "mingw32-make not found"

Add MinGW to PATH:
```powershell
$env:PATH += ";C:\Users\$env:USERNAME\scoop\apps\mingw\current\bin"
```

### "obs.h not found"

Run first-time setup:
```powershell
npm run backend:setup
```

### CMake generator mismatch

Clean and rebuild:
```powershell
npm run backend:clean
npm run backend:build
```

### obs_reset_video fails

Check:
1. `graphics_module` set to `"libobs-d3d11"`
2. `libobs-d3d11.dll` exists in `bin/`
3. Data path has trailing slash: `"./data/libobs/"`

### NVENC not working

Ensure `bin/obs-nvenc-test.exe` exists. If missing:
```powershell
npm run backend:build  # Copies it automatically
```
