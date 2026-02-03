# ClipVault Packaging Guide

How ClipVault is packaged into a self-contained Electron app + bundled backend.

## Overview (Packaged Layout)

```text
ui/release/win-unpacked/
├── ClipVault.exe              # Electron main executable
├── resources/
│   ├── bin/                   # C++ backend + OBS + FFmpeg
│   │   ├── ClipVault.exe
│   │   ├── obs.dll
│   │   ├── obs-ffmpeg.dll
│   │   ├── libobs-d3d11.dll
│   │   ├── ffmpeg.exe
│   │   └── 64x64-2.png
│   ├── 64x64.png              # Drag icon
│   └── app.asar               # Bundled UI
```

## Build Process

### 1. Build the C++ backend

```powershell
cd D:\Projects-Personal\ClipVault2
.\build.ps1
```

### 2. Build the renderer

```powershell
cd ui
npm run build:react
```

### 3. Package (portable folder)

```powershell
cd ui
npx electron-builder --win --dir
```

Output: `ui/release/win-unpacked/ClipVault.exe`

### 4. Package (installer)

```powershell
cd ui
npx electron-builder --win
```

Output: `ui/release/ClipVault-Setup-${version}.exe`

## electron-builder Config

The packaging configuration lives in `ui/package.json` under the `build` key.

```json
"build": {
  "appId": "com.clipvault.editor",
  "productName": "ClipVault",
  "afterPack": "build/afterPack.js",
  "directories": { "output": "release" },
  "files": ["dist/**/*", "node_modules/**/*"],
  "extraResources": [
    { "from": "../bin", "to": "bin", "filter": ["**/*"] },
    { "from": "../64x64.png", "to": "64x64.png" }
  ],
  "win": { "target": [{ "target": "nsis", "arch": ["x64"] }] },
  "nsis": {
    "include": "build/installer.nsh",
    "installerIcon": "build/icon.ico",
    "artifactName": "ClipVault-Setup-${version}.exe"
  }
}
```

Note: the referenced build assets live under `ui/build/` (`afterPack.js`, `installer.nsh`, and `icon.ico`).

## Backend Startup (Packaged)

The Electron main process spawns the bundled backend from `resources/bin/ClipVault.exe`.

Backend path resolution and spawn details (implementation in `ui/src/main/main.ts`):

- **Path resolution**: `getBackendPaths()` uses `process.resourcesPath/bin/ClipVault.exe` in production and falls back to `appDir/../../../bin/ClipVault.exe` in dev (where `appDir = dirname(app.getAppPath())`).
- **Spawn arguments**: the backend is started with no CLI arguments (`spawn(backendPath, [], ...)`) and inherits the Electron process environment (no overrides).
- **Process options**: `detached: true` with `stdio: ['ignore', 'pipe', 'pipe']` so stdout/stderr can be captured.
- **Logging**: startup logs are appended to `clipvault.log` in the same bin folder, and stderr is mirrored to the console for visibility.
- **Error handling**: missing backend path triggers an error dialog and aborts startup; spawn errors and exit events are logged and the backend handle is cleared.
- **Retry/restart**: `restartBackend()` reuses `startBackend()` after shutdown when settings or UI actions request a restart.

Reference: see `getBackendPaths()` and `startBackend()` in `ui/src/main/main.ts`.

## Troubleshooting

- **Backend won’t start**: verify `resources/bin/` includes OBS DLLs and FFmpeg.
- **Icons missing**: ensure `64x64-2.png` is in `resources/bin/` and `64x64.png` is in `resources/`.
- **Protocol handler issues**: see `ui/src/main/main.ts` for registration logic.
