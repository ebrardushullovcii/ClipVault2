# ClipVault UI Documentation

Electron-based user interface for browsing, editing, and exporting clips.

## Project Structure

```
ui/
├── src/
│   ├── main/                    # Electron main process (Node.js)
│   │   ├── main.ts              # App entry, window management, IPC handlers
│   │   ├── cleanup.ts           # Cache cleanup utilities
│   │   └── tsconfig.json
│   ├── preload/                 # Secure IPC bridge
│   │   └── index.ts
│   ├── renderer/                # React UI (Chromium)
│   │   ├── components/          # Library, Editor, Settings, shared UI
│   │   ├── hooks/               # useLibraryState, thumbnails, metadata, etc.
│   │   ├── stores/              # Zustand stores (e.g., gameTagEditorStore)
│   │   ├── styles/              # Global styles
│   │   ├── types/               # Shared TypeScript types
│   │   ├── utils/               # Helper utilities
│   │   └── App.tsx              # Root component
│   └── constants/               # Shared constants
├── package.json                 # Build + electron-builder config
├── vite.config.ts
└── tailwind.config.js
```

## Process Model

- **Electron main** starts the UI, registers the custom protocol, and spawns the C++ backend.
- **Renderer** uses `window.electronAPI` (from preload) to call IPC handlers.
- **Backend** runs as a separate process (tray icon + recorder) and is managed by the main process.

## IPC & Protocols

The renderer talks to the main process via IPC. The main process exposes a curated API in `preload/index.ts`.

Common IPC channels:
- `clips:list`, `clips:scan`, `clips:delete`
- `clips:saveMetadata`, `clips:getMetadata`
- `editor:saveState`, `editor:loadState`
- `ffmpeg:thumbnail`, `ffmpeg:trim`, `ffmpeg:info`
- `settings:get`, `settings:set`

Custom protocol:
- `clipvault://` is used to safely load clips, thumbnails, audio cache, and exports without exposing raw paths.

## Key Views

- **Library**: Grid/list browsing, search/sort/filter, multi-select bulk actions.
- **Editor**: Trim points, audio track toggles, volume, tags/favorite/game, export.
- **Settings**: Recording quality, resolution/FPS, audio device selection, startup behavior.

## State Management

- Lightweight Zustand store for specific UI flows (`gameTagEditorStore.ts`).
- Component state + custom hooks (`useLibraryState`, `useThumbnails`, etc.) for most UI state.

## Build & Dev

```powershell
cd ui
npm run dev          # Dev mode
npm run build:react  # Build renderer
npm run build:electron
npx electron-builder --win --dir
```
