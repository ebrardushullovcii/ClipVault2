# Commands Reference

All commands to build, run, and test ClipVault.

## Build

### Backend (C++)

```powershell
npm run backend:build     # Build backend
npm run backend:clean     # Clean rebuild
npm run backend:debug     # Debug build
npm run backend:setup     # First-time setup (clone OBS, copy DLLs)
```

Output: `bin\ClipVault.exe`

### UI (Electron + React)

```powershell
npm install              # Install dependencies (first time)
npm run build:react      # Build React for production
npm run build:electron   # Build Electron main process
```

### Full Build (Backend + UI)

```powershell
npm run build:all
```

### Full Package (Portable)

```powershell
npm run package:portable
```

Output: `ui\release\ClipVault-Portable.exe`

### Installer

```powershell
npm run package:win
```

Output: `ui\release\ClipVault-Setup-{version}.exe`

## Run

### Development

```powershell
# Backend only (tray icon, F9 hotkey)
.\bin\ClipVault.exe

# UI dev mode (hot reload)
npm run dev

# Both together
Start-Process .\bin\ClipVault.exe; npm run dev
```

### Production (Installed)

```powershell
.\ui\release\ClipVault-Setup-{version}.exe
```

Run the setup exe to install ClipVault with Start menu/Search/Uninstall registration.

### Production (Portable)

```powershell
.\ui\release\ClipVault-Portable.exe
```

Portable builds run without installing and do not register with Windows.

### Unpacked Smoke Test

```powershell
.\ui\release\win-unpacked\ClipVault.exe
```

This is only for packaging smoke tests. It is not an installed app and will not show up in Windows Search or Apps & features.

## Test

### Verify Build

```powershell
# Check backend builds
npm run backend:build

# Check UI builds
npm run build:react

# Check types
npm run typecheck

# Check lint
npm run lint
```

### Verify Package

```powershell
# Build and test the real installer flow
npm run package:win
.\ui\release\ClipVault-Setup-{version}.exe
```

### Verify Clip Recording

```powershell
# 1. Run a packaged app
.\ui\release\ClipVault-Portable.exe

# 2. Wait for tray icon to appear
# 3. Press F9 to save clip
# 4. Check clip was created
ls D:\Clips\ClipVault\*.mp4

# 5. Verify 2 audio tracks
ffprobe -show_streams "D:\Clips\ClipVault\latest.mp4" 2>&1 | Select-String "codec_type=audio"
```

### Check Logs

```powershell
# Backend log
type bin\clipvault.log

# Watch log in real-time
Get-Content bin\clipvault.log -Wait -Tail 30
```

## Lint & Format

```powershell
npm run lint             # Check for issues
npm run lint:fix         # Auto-fix issues
npm run format           # Format with Prettier
npm run typecheck        # TypeScript check
```

## Clean

```powershell
# Clean backend build
npm run backend:clean

# Clean UI build
rm -r ui\dist, ui\release

# Clean all
npm run backend:clean
rm -r ui\dist, ui\release, ui\node_modules
```
