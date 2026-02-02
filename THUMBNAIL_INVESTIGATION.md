# Thumbnail Cache Native Addon Investigation

## Goal
Implement Windows Thumbnail Cache API for 10-50x faster thumbnail generation (target: <50ms vs FFmpeg's 300-800ms).

## Current Status
**FAILED** - Native addon cannot be made to work with Electron 27. App now uses FFmpeg exclusively (works, but slower).

## Root Cause
**ABI Mismatch**: The native addon crashes due to incompatible Node.js ABIs:
- Build environment: Node.js 22.11.0
- Electron 27 runtime: Node.js 18.19.0

Even with proper headers via `electron-rebuild`, the addon segfaults when functions are called.

## What We Tried

### 1. Direct Loading in Main Thread
- `require()` the addon in `ThumbnailWorkerManager` constructor
- **Result**: Instant crash on app startup

### 2. MTA COM Initialization
- Changed from STA (`COINIT_APARTMENTTHREADED`) to MTA (`COINIT_MULTITHREADED`)
- **Result**: No improvement - still crashes

### 3. Path Handling Fixes
- Added forward slash to backslash conversion for Windows API
- **Result**: Fixed `SHCreateItemFromParsingName HR=0x80070057`, but still crashes later

### 4. Async Worker Thread (N-API)
- Implemented `Napi::AsyncWorker` to run COM in separate thread
- **Result**: Build succeeded, but still segfaults when worker completes

### 5. Subprocess Isolation
- Created `thumbnail-extractor.cjs` worker process
- Spawn as child process with `spawn(process.execPath, [scriptPath])`
- Communication via stdin/stdout JSON
- **Result**: Worker process starts but crashes when calling addon.extractThumbnail()

### 6. Electron Rebuild with Correct Headers
```powershell
cd ui/native/thumbnail-addon
npx electron-rebuild --version=27.1.3 --arch=x64
```
- **Result**: Build succeeds, but crashes on function call

## Key Evidence

### Log Analysis
```
=== ExtractWindowsThumbnail ===
CoInitializeEx (MTA)...        ← COM succeeds
SHCreateItemFromParsingName: HR=0x00000000  ← Shell item created
GetImage result: HR=0x00000000              ← HBITMAP obtained
SaveHBitmapToJpeg - Complete                ← GDI+ save succeeds
[CRASH - No SUCCESS logged]                 ← Segfault on return
```

### Testing Results
```powershell
# Works: Loading addon
node -e "require('./build/Release/thumbnail_addon.node')"
# → { extractThumbnail: [Function] }

# Crashes: Calling function
node -e "require('./build/Release/thumbnail_addon.node').extractThumbnail(...)"
# → Segmentation fault
```

## Files Modified

### C++ Addon (`ui/native/thumbnail-addon/src/`)
- `addon.cpp` - N-API wrapper with async worker pattern
- `thumbnail.cpp` - Windows thumbnail extraction logic

### TypeScript (`ui/src/main/`)
- `main.ts` - `ThumbnailWorkerManager` class (current: FFmpeg-only)
- `thumbnail-extractor.cjs` - Subprocess worker script (not currently used)

### Build Config (`ui/`)
- `package.json` - Added worker script to build artifacts

## Conclusion

The Windows Thumbnail Cache native addon is **fundamentally incompatible** with Electron 27. The issue is at the ABI level - Node.js native addons compiled for Node.js 22 cannot work with Node.js 18, even when using `electron-rebuild`.

**Working Solution**: FFmpeg fallback
- Slower: 300-800ms per thumbnail
- Reliable: Works 100% of the time
- No crashes: Stable operation

## Future Options

1. **Wait for Electron 28+** - Node.js 20+ ABI might be more stable
2. **Alternative approach** - Use WIC (Windows Imaging Component) directly without N-API
3. **Pre-generate thumbnails** - Extract during recording, store as sidecar files
4. **Accept FFmpeg** - Performance is acceptable for most use cases

## Build Commands Reference

```powershell
# Build FFmpeg-only version
cd ui
npm run build:electron
npx electron-builder --win --dir

# Try rebuilding addon (will still crash)
cd ui/native/thumbnail-addon
npx electron-rebuild --version=27.1.3 --arch=x64

# Test addon manually
node -e "const a = require('./build/Release/thumbnail_addon.node'); console.log(Object.keys(a));"
```

## Key Files to Reference

- `ui/native/thumbnail-addon/src/addon.cpp` - N-API implementation
- `ui/native/thumbnail-addon/src/thumbnail.cpp` - Windows API calls
- `ui/src/main/main.ts` - ThumbnailWorkerManager class
- `ui/native/thumbnail-addon/binding.gyp` - Build configuration
- `ui/package.json` - Build artifacts configuration