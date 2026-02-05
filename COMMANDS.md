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

Output: `ui\release\win-unpacked\ClipVault.exe`

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

### Production (Packaged)

```powershell
.\ui\release\win-unpacked\ClipVault.exe
```

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
# Build and run packaged version
npm run package:portable
.\ui\release\win-unpacked\ClipVault.exe
```

### Verify Clip Recording

```powershell
# 1. Run packaged app
.\ui\release\win-unpacked\ClipVault.exe

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
