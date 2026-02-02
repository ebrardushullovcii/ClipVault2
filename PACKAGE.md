# Package and Create Installer

## Quick Start (One Command)

### Full Package + Installer
```powershell
powershell -ExecutionPolicy Bypass -Command "cd ui; npm run build:react; npx electron-builder --win"
```

## Step by Step (If Above Fails)

### 1. Build Backend
```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

### 2. Build Frontend  
```powershell
cd ui && npm run build:react
```

### 3. Create Installer
```powershell
cd ui && npx electron-builder --win
```

## Output Locations

- **Portable**: `ui/release/win-unpacked/ClipVault.exe`
- **Installer**: `ui/release/ClipVault Setup.exe`

## Prerequisites

- Backend built: `bin/ClipVault.exe` exists
- Node modules installed: `cd ui && npm install`

## Troubleshooting

**Error: "ClipVault.exe is running"**
- Close the app from system tray first
- Or run: `taskkill /F /IM ClipVault.exe`

**Error: "Cannot find module"**
- Run: `cd ui && npm install`
