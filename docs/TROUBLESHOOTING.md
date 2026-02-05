# Troubleshooting

Common issues and solutions.

## App Won't Start

**Check the log:**
```powershell
type bin\clipvault.log
```

**Missing DLLs:**
```powershell
# Verify required DLLs exist
ls bin\*.dll
# Should include: obs.dll, libobs-d3d11.dll, w32-pthreads.dll
```

**Fix:** Run `.\build.ps1 -Setup` (or `npm run backend:setup`) to re-copy all required files.

## No Video / Black Screen

**Causes:**
1. OBS modules not loaded before video init
2. Monitor capture source not created

**Check log for:**
```
[INFO] Using monitor_capture
[INFO] Scene set as output source
```

**Fix:** Ensure `obs_load_all_modules()` is called BEFORE `obs_reset_video()`.

## No Audio in Clips

**Check clip has audio tracks:**
```powershell
ffprobe -show_streams clip.mp4 2>&1 | Select-String "codec_type=audio"
# Should show 2 lines (desktop + mic)
```

**Causes:**
1. Audio sources not activated
2. Wrong mixer track configuration
3. Audio device not available

**Check log for:**
```
[INFO] Desktop audio source activated
[INFO] Microphone source activated
```

## Only One Audio Track

**Cause:** Only one audio encoder connected to output.

**Verify both encoders connected:**
```cpp
obs_output_set_audio_encoder(replay, audio_enc_1, 0);  // Track 1
obs_output_set_audio_encoder(replay, audio_enc_2, 1);  // Track 2
```

## NVENC Not Available

**Symptoms:** Falls back to x264 (higher CPU usage).

**Requirements:**
- NVIDIA GPU (GTX 600 or newer)
- Up-to-date drivers
- `obs-nvenc-test.exe` in `bin/`

**Check log for:**
```
[INFO] Using encoder: jim_nvenc    # NVENC working
[INFO] Using encoder: obs_x264    # Fallback to CPU
```

**Fix:**
```powershell
.\build.ps1  # Re-copies obs-nvenc-test.exe
npm run backend:build  # Re-copies obs-nvenc-test.exe
```

## F9 Hotkey Doesn't Work

**Causes:**
1. Another app has F9 registered
2. Backend not running

**Verify backend running:**
- Check system tray for ClipVault icon
- Check Task Manager for `ClipVault.exe` process

**Change hotkey:** Edit `%APPDATA%\ClipVault\settings.json`:
```json
"hotkey": {
    "save_clip": "F10"
}
```

## Clips Not Appearing in Library

**Causes:**
1. Clips saved to different folder than UI is watching
2. File watcher not working

**Fix:** Check clips folder matches in Settings UI and `settings.json`.

**Manual refresh:** Click the refresh button in the library toolbar.

## Build Errors

### CMake generator mismatch
```powershell
.\build.ps1 -Clean
.\build.ps1

# Or from repo root:
npm run backend:clean
npm run backend:build
```

### obs.h not found
```powershell
.\build.ps1 -Setup

# Or from repo root:
npm run backend:setup
```

### Linker errors (undefined reference)
Check `CMakeLists.txt` includes all `.cpp` files in SOURCES.

## Verification Commands

```powershell
# Check clip streams
ffprobe -show_streams clip.mp4

# Check audio track count
ffprobe -show_streams clip.mp4 2>&1 | Select-String "codec_type=audio"

# Watch backend log
Get-Content bin\clipvault.log -Wait -Tail 20

# Check OBS plugins loaded
type bin\clipvault.log | Select-String "loaded module"
```
