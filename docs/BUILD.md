# Building ClipVault

## Prerequisites

Install via [Scoop](https://scoop.sh/):

```powershell
scoop install mingw cmake git
```

Or manually install:
- MinGW-w64 (GCC 12+)
- CMake 3.20+
- Git

## First-Time Setup

Run the setup script to clone OBS and build libobs:

```powershell
.\build.ps1 -Setup
```

This will:
1. Clone OBS Studio as a git submodule
2. Build only libobs (not the full OBS application)
3. Copy required DLLs to `bin/`
4. Copy required data files to `bin/data/`

## Building ClipVault

After setup, build with:

```powershell
.\build.ps1
```

Or for a clean build:

```powershell
.\build.ps1 -Clean
```

## Running

```powershell
.\build.ps1 -Run
```

Or directly:

```powershell
.\bin\ClipVault.exe
```

## Build Flags

| Flag | Description |
|------|-------------|
| `-Setup` | First-time setup (clone OBS, build libobs) |
| `-Clean` | Remove build artifacts before building |
| `-Run` | Build and run |
| `-Debug` | Debug build (no optimization, symbols) |
| `-Release` | Release build (default) |

## Manual Build (Without Script)

```powershell
# Create build directory
mkdir build
cd build

# Configure
cmake .. -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build . --parallel

# Copy result
copy ClipVault.exe ..\bin\
```

## Directory Structure After Build

```
bin/
├── ClipVault.exe           # Main executable
├── clipvault.log           # Log file (created on run)
├── obs-config/             # OBS config directory
├── libobs.dll              # OBS core library
├── libobs-d3d11.dll        # D3D11 graphics backend
├── w32-pthreads.dll        # Threading library
├── obs-plugins/
│   └── 64bit/
│       ├── win-capture.dll
│       ├── win-wasapi.dll
│       ├── obs-ffmpeg.dll
│       └── obs-outputs.dll
└── data/
    ├── libobs/
    │   ├── default.effect
    │   ├── bicubic_scale.effect
    │   └── ...
    └── obs-plugins/
        └── ...
```

## Troubleshooting

### "mingw32-make not found"

Add MinGW to PATH:
```powershell
$env:PATH += ";C:\Users\$env:USERNAME\scoop\apps\mingw\current\bin"
```

### "obs.h not found"

Run setup first:
```powershell
.\build.ps1 -Setup
```

### "libobs.dll not found"

The DLLs should be in `bin/`. If missing, re-run setup:
```powershell
.\build.ps1 -Setup
```

### "Failed to find file 'default.effect'"

The data path isn't set correctly. Check that:
1. `bin/data/libobs/` exists and contains `.effect` files
2. The code adds the data path with a trailing slash

### obs_reset_video returns -1

Check:
1. `graphics_module` is set to `"libobs-d3d11"`
2. `libobs-d3d11.dll` exists in `bin/`
3. Data path is correct

### obs_reset_video returns -5

Missing module. Ensure `bin/obs-plugins/64bit/` contains the required DLLs.

## Building libobs Manually

If the setup script fails, you can build libobs manually:

```powershell
cd third_party/obs-studio-src

mkdir build
cd build

cmake .. -G "MinGW Makefiles" `
    -DCMAKE_BUILD_TYPE=Release `
    -DENABLE_UI=OFF `
    -DENABLE_SCRIPTING=OFF `
    -DENABLE_BROWSER=OFF `
    -DENABLE_PLUGINS=ON

cmake --build . --target obs-frontend-api --parallel
cmake --build . --target libobs --parallel
```

Then copy the built files to `bin/`.
