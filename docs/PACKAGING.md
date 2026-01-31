# ClipVault Packaging Guide

How ClipVault is packaged into a single self-contained EXE.

## Overview

```
ui/release/win-unpacked/
├── ClipVault.exe              # Electron main executable (172 MB)
├── resources/
│   ├── bin/
│   │   ├── ClipVault.exe      # C++ backend (3.2 MB)
│   │   ├── obs.dll            # OBS core
│   │   ├── obs-ffmpeg.dll     # FFmpeg encoder plugin
│   │   ├── libobs-d3d11.dll   # D3D11 graphics backend
│   │   ├── ffmpeg.exe         # FFmpeg CLI for thumbnails/export
│   │   └── 64x64-2.png        # Tray icon
│   │
│   ├── data/
│   │   ├── libobs/            # OBS shaders/effects
│   │   └── obs-plugins/       # OBS capture/encode plugins
│   │
│   ├── 64x64.png              # Drag-and-drop icon
│   └── app.asar               # Bundled React UI
```

## Build Process

### Step 1: Build C++ Backend

```powershell
cd D:\Projects-Personal\ClipVault2
.\build.ps1
```

Output: `bin/ClipVault.exe` + all OBS DLLs

### Step 2: Copy Backend to Resources

```powershell
mkdir ui\resources\bin
copy bin\ClipVault.exe ui\resources\bin\
xcopy /e /i bin\*.dll ui\resources\bin\
xcopy /e /i bin\*.exe ui\resources\bin\
```

### Step 3: Build React UI

```powershell
cd ui
npm run build:react
```

Output: `dist/` (bundled assets)

### Step 4: Package with Electron Builder

```powershell
cd ui
npx electron-builder --win --dir
```

Output: `release/win-unpacked/ClipVault.exe`

## Electron Builder Configuration

```json5
// electron-builder.json5
{
  appId: 'com.clipvault.app',
  productName: 'ClipVault',
  directories: {
    output: 'release'
  },
  files: [
    'dist/',
    '!node_modules/**/*'
  ],
  extraResources: [
    {
      from: 'resources/',
      to: ''
    }
  ],
  win: {
    target: 'dir',
    icon: 'src/assets/icon.ico'
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  }
}
```

## Backend Startup (Packaged)

When packaged app launches:

1. Electron main process starts
2. Spawns C++ backend from `resources/bin/ClipVault.exe`
3. Backend shows tray icon
4. UI connects to backend API
5. Both run independently

### Spawn Code

```typescript
// In Electron main.ts
const backendPath = path.join(process.resourcesPath, 'bin/ClipVault.exe');
const backend = spawn(backendPath, [
  '--tray',
  '--port', '28645',
  '--data', path.join(process.resourcesPath, 'data')
], {
  stdio: 'pipe',
  detached: true
});

// Pipe backend output to log file
backend.stdout.pipe(fs.createWriteStream('backend.log'));
backend.stderr.pipe(fs.createWriteStream('backend.log'));
```

## Single Instance Lock

Both Electron and backend use mutex for single instance:

```cpp
// C++ backend
HANDLE mutex = CreateMutex(nullptr, TRUE, L"ClipVaultBackendMutex");
if (GetLastError() == ERROR_ALREADY_EXISTS) {
    // Another instance running, exit
}

// Electron
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}
```

## Icons

| Icon | Size | Purpose |
|------|------|---------|
| `64x64-2.png` | 64x64 | System tray icon |
| `64x64.png` | 64x64 | Drag-and-drop preview |
| `icon.ico` | 256x256 | EXE icon |

### Generating Icons

```powershell
# Using ImageMagick
magick convert -background transparent 64x64.png -resize 256x256 icon.ico
```

## File Size Breakdown

| Component | Size | Notes |
|-----------|------|-------|
| Electron runtime | ~120 MB | Chromium + Node.js |
| React UI (asar) | ~5 MB | Minified JS/CSS |
| C++ backend | ~3.2 MB | OBS-based recorder |
| OBS DLLs | ~40 MB | obs.dll, Qt6, plugins |
| FFmpeg | ~5 MB | CLI for export |
| **Total** | **~172 MB** | Single portable EXE |

## NSIS Installer (Optional)

For installer-based distribution:

```nsis
; installer.nsi
Name "ClipVault"
OutFile "ClipVault-Setup.exe"
InstallDir "$LOCALAPPDATA\ClipVault"

Section "Install"
    SetOutPath "$INSTDIR"
    File /r "release\win-unpacked\*.*"
    
    CreateDirectory "$SMPROGRAMS\ClipVault"
    CreateShortCut "$SMPROGRAMS\ClipVault\ClipVault.lnk" "$INSTDIR\ClipVault.exe"
    
    ; Register protocol handler
    WriteRegStr HKCR "clipvault" "" "URL:ClipVault Protocol"
    WriteRegStr HKCR "clipvault" "URL Protocol" ""
    WriteRegStr HKCR "clipvault\Shell\Open\Command" "" "$INSTDIR\ClipVault.exe %1"
SectionEnd
```

## Testing Packaged App

```powershell
# Run the packaged app
.\ui\release\win-unpacked\ClipVault.exe

# Check backend logs
Get-Content .\ui\release\win-unpacked\resources\bin\clipvault.log -Tail 20

# Verify F9 works
# Press F9 while running, check clips folder

# Verify 2 audio tracks
ffprobe (Get-ChildItem D:\Clips\ClipVault\*.mp4 | Sort LastWriteTime -Desc | Select -First 1).FullName 2>&1 | Select-String "codec_type=audio"
```

## Troubleshooting

### Backend won't start

1. Check antivirus isn't blocking
2. Verify all DLLs present in `resources/bin/`
3. Check `resources/bin/clipvault.log`

### Missing icons

1. Verify `resources/bin/64x64-2.png` exists
2. Check PNG is valid (not corrupted)

### Protocol handler not working

```powershell
# Check registry
reg query HKCR\clipvault

# Should show:
# clipvault       REG_SZ    URL:ClipVault Protocol
```

## Installation & Distribution

### Option 1: Portable (Recommended for Individual Use)

Simply copy the entire `win-unpacked` folder to any location:

```powershell
# After building, copy folder
xcopy /e /i ui\release\win-unpacked "D:\Apps\ClipVault"

# Run from new location
"D:\Apps\ClipVault\ClipVault.exe"
```

**Pros**: No installation, fully portable, delete folder to uninstall
**Cons**: No start menu shortcut, no automatic updates

### Option 2: NSIS Installer (Recommended for Distribution)

Create a proper Windows installer with start menu shortcuts and uninstall support:

```powershell
# Install NSIS
scoop install nsis

# Build the installer
cd ui
npx electron-builder --win
```

Output: `release/ClipVault Setup 1.0.0.exe`

#### Running the Installer

1. Download `ClipVault Setup 1.0.0.exe`
2. Run as administrator
3. Follow installation wizard
4. Launch from Start Menu

#### Installer Features

- Start menu shortcut
- Desktop icon option
- Add to PATH (for CLI usage)
- Registry entries for `clipvault://` protocol
- Proper uninstall via Windows Add/Remove Programs

### Build & Install Script

For quick build + install:

```powershell
# scripts/build-and-install.ps1
$version = "1.0.0"

# Build everything
cd D:\Projects-Personal\ClipVault2
.\build.ps1

cd ui
npm run build:react
npx electron-builder --win

# Install to local app data
$dest = "$env:LOCALAPPDATA\ClipVault"
Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $dest

xcopy "release\win-unpacked\*" "$dest\" /e /i

# Create shortcut on desktop
$shortcut = "$env:USERPROFILE\Desktop\ClipVault.lnk"
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($shortcut)
$lnk.TargetPath = "$dest\ClipVault.exe"
$lnk.Save()

Write-Host "Installed to: $dest"
Write-Host "Desktop shortcut created"
```

### Distribution Checklist

Before releasing:

- [ ] Update version in `ui/package.json`
- [ ] Update version in C++ backend (optional)
- [ ] Build and test on clean Windows VM
- [ ] Verify all features work
- [ ] Test F9 hotkey in games
- [ ] Verify 2 audio tracks
- [ ] Test export functionality
- [ ] Scan installer with antivirus (false positives common)
- [ ] Test uninstall cleanly removes all files

### Code References

- Backend packaging: `scripts/build.ps1` (copies DLLs)
- Electron build: `ui/package.json` scripts
- Builder config: `ui/electron-builder.json5`
- Backend spawn: `ui/src/main/main.ts`