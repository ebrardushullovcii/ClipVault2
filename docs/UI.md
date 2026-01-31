# ClipVault UI Documentation

Electron-based user interface for browsing, editing, and exporting clips.

## Architecture

```
ui/
├── src/
│   ├── main/                    # Electron main process (Node.js)
│   │   ├── main.ts              # App entry, window management
│   │   ├── ipc-handlers.ts      # IPC handlers (backend communication)
│   │   └── preload.ts           # Preload script (secure IPC bridge)
│   │
│   ├── renderer/                # React UI (Chromium)
│   │   ├── components/
│   │   │   ├── Library/         # Clip browser
│   │   │   ├── Editor/          # Video editor
│   │   │   ├── Export/          # Export dialog
│   │   │   └── Common/          # Shared components
│   │   ├── stores/              # Zustand state stores
│   │   ├── hooks/               # Custom React hooks
│   │   ├── utils/               # Helper functions
│   │   └── App.tsx              # Root component
│   │
│   └── preload/                 # Preload script
│       └── index.ts             # Exposed IPC APIs
│
├── package.json
├── vite.config.ts
├── electron-builder.json5
└── tsconfig.json
```

## Communication

### Backend (C++) ↔ UI (Electron)

**Protocol**: Named pipes or custom protocol

When UI launches, it spawns the C++ backend:
```typescript
// In main.ts
const backendPath = path.join(process.resourcesPath, 'bin/ClipVault.exe');
const backend = spawn(backendPath, ['--ipc']);
```

UI communicates via:
- **clipvault:// protocol** - Opens specific clips: `clipvault://open?file=path.mp4`
- **HTTP API** - Backend serves localhost API for status/commands
- **IPC** - Direct process communication

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Get backend status (running, recording) |
| `/api/clips` | GET | List saved clips |
| `/api/clips/:name` | GET | Get clip metadata |
| `/api/settings` | GET/POST | Get/update settings |
| `/api/save` | POST | Trigger manual save |

## Views

### Library View

Displays all saved clips in a grid with:
- Thumbnail (first frame)
- Duration, resolution, FPS
- Tags and favorite indicator
- Date created, file size

**Controls**:
- Search bar (filter by name, tags)
- Sort dropdown (date, size, name, favorites)
- Filter buttons (all, favorites, recent)

### Editor View

For editing individual clips:

**Timeline**:
- Scrubber for seeking
- Trim markers (start/end) with drag handles
- Current time / total time display

**Audio Controls**:
- Track 1 toggle (desktop audio)
- Track 2 toggle (microphone)
- Volume sliders per track

**Metadata**:
- Tags input (add/remove)
- Notes textarea
- Favorite toggle

### Export View

**Settings**:
- Trim points (use current or full)
- Audio track selection
- Presets: Discord, YouTube, Original

**Progress**:
- FFmpeg progress bar
- Cancel button
- "Open folder" on completion

## State Management

Zustand stores for state management:

| Store | Purpose |
|-------|---------|
| `clipStore.ts` | Library clips list, scanning |
| `editorStore.ts` | Current clip, trim points, audio state |
| `exportStore.ts` | Export settings, progress |
| `uiStore.ts` | Theme, modals, notifications |

## IPC Handlers

Main process handlers available to renderer:

```typescript
// File operations
ipcRenderer.invoke('clips:list', dir)
ipcRenderer.invoke('clips:scan')
ipcRenderer.invoke('clips:getMetadata', filename)
ipcRenderer.invoke('clips:delete', filename)

// FFmpeg operations
ipcRenderer.invoke('ffmpeg:thumbnail', input, output, time)
ipcRenderer.invoke('ffmpeg:trim', input, output, start, end, audioTracks)
ipcRenderer.invoke('ffmpeg:info', file)

// Settings
ipcRenderer.invoke('settings:get')
ipcRenderer.invoke('settings:set', newSettings)
```

## Backend Communication

### Starting Backend

```typescript
// In src/main/main.ts
async function startBackend() {
  const backendExe = path.join(process.resourcesPath, 'bin/ClipVault.exe');
  const backend = spawn(backendExe, ['--ui', '--port', '28645'], {
    detached: true,
    stdio: 'pipe'
  });

  // Wait for backend to be ready
  await waitForUrl('http://localhost:28645/api/status');
}
```

### Single Instance

If another instance launches, focus existing window:

```typescript
// In main.ts
app.requestSingleInstanceLock([...commandLine]);

app.on('second-instance', (event, commandLine) => {
  // Focus existing window
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
```

## Styling

- **Framework**: Tailwind CSS
- **Theme**: Dark mode by default
- **Color palette**: Custom accent color (cyan/teal)
- **Animations**: Framer Motion for transitions

### Tailwind Config

```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          // ...
          500: '#06b6d4',  // Main accent
          600: '#0891b2',
        }
      }
    }
  }
}
```

## Development

### Running Dev Server

```powershell
cd ui
npm run dev
```

### Building React

```powershell
npm run build:react
```

### Electron Packaging

```powershell
npx electron-builder --win --dir
```

Output: `release/win-unpacked/`

## Troubleshooting

### UI doesn't connect to backend

Check backend is running:
```powershell
curl http://localhost:28645/api/status
```

### Clips not appearing

1. Check output path in settings
2. Verify backend has file permissions
3. Check logs: `resources/bin/clipvault.log`

### Export fails

1. Check FFmpeg is bundled: `resources/bin/ffmpeg.exe`
2. Verify disk space
3. Check export format compatibility

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Play/Pause |
| `J` / `L` | Seek backward/forward |
| `I` / `O` | Set trim start/end |
| `F` | Toggle favorite |
| `Ctrl+E` | Export |
| `F12` | Developer tools |