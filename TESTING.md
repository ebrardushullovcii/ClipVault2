# Testing Guide

How to verify each phase of ClipVault works correctly.

## Prerequisites

Install FFmpeg for clip verification:
```powershell
scoop install ffmpeg
```

---

## Phase 1.1: Project Setup

### Test: OBS submodule cloned
```powershell
Test-Path "third_party/obs-studio/libobs/obs.h"
# Should return: True
```

### Test: libobs built
```powershell
Test-Path "third_party/obs-build/libobs/libobs.dll"
# Should return: True
```

### Test: DLLs copied to bin
```powershell
Test-Path "bin/libobs.dll"
Test-Path "bin/libobs-d3d11.dll"
# Both should return: True
```

### Test: Data files copied
```powershell
(Get-ChildItem "bin/data/libobs/*.effect").Count -gt 5
# Should return: True (there are ~10 effect files)
```

---

## Phase 1.2: Minimal OBS Application

### Test: App starts and stops
```powershell
.\bin\ClipVault.exe
# Check log for:
# - "OBS initialized" or similar success message
# - No error messages
# - Clean shutdown message
```

### Test: Log file created
```powershell
Test-Path "bin/clipvault.log"
# Should return: True
```

### Expected log output:
```
[INFO] === ClipVault Starting ===
[INFO] Starting OBS...
[INFO] Video initialized: 1920x1080 @ 60fps
[INFO] Audio initialized: 48000 Hz
[INFO] Modules loaded
[INFO] OBS initialized successfully
```

---

## Phase 1.3: Capture Sources

### Test: Sources created
Check log for:
```
[INFO] Monitor capture created successfully
[INFO] System audio capture created successfully
[INFO] Microphone capture created successfully
```

### Test: No source errors
Log should NOT contain:
```
[ERROR] Failed to create monitor capture
[ERROR] Failed to create audio capture
```

---

## Phase 1.4: Encoders

### Test: Video encoder created
Check log for one of:
```
[INFO] Using video encoder: jim_nvenc
[INFO] Using video encoder: obs_x264
```

### Test: Audio encoders created
Check log for:
```
[INFO] Audio encoder 1 created (system audio)
[INFO] Audio encoder 2 created (microphone)
```

---

## Phase 1.5: Replay Buffer

### Test: Replay buffer running
Check log for:
```
[INFO] Replay buffer started successfully
```

### Test: No replay errors
Log should NOT contain:
```
[ERROR] Failed to start replay buffer
```

---

## Phase 1.6: Hotkey & Save

### Test: Hotkey registered
Check log for:
```
[INFO] Hotkey F9 registered
```

### Test: Save clip
1. Let app run for at least 10 seconds (to have buffer content)
2. Press F9
3. Check log for:
```
[INFO] Save triggered
[INFO] Clip saved: D:\Clips\ClipVault\clip_2024-01-30_12-30-45.mp4
```

### Test: Clip file exists
```powershell
Get-ChildItem "D:\Clips\ClipVault\*.mp4" | Select-Object -First 1
# Should show a recent MP4 file
```

### Test: Clip is valid video
```powershell
$clip = (Get-ChildItem "D:\Clips\ClipVault\*.mp4" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
ffprobe $clip 2>&1 | Select-String "Video:"
# Should show: Video: h264 ...
```

### Test: Clip has 2 audio tracks
```powershell
$clip = (Get-ChildItem "D:\Clips\ClipVault\*.mp4" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
(ffprobe -show_streams $clip 2>&1 | Select-String "codec_type=audio").Count
# Should return: 2
```

### Test: Clip duration reasonable
```powershell
$clip = (Get-ChildItem "D:\Clips\ClipVault\*.mp4" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
ffprobe -show_entries format=duration $clip 2>&1 | Select-String "duration="
# Should show duration close to buffer_seconds in config (default 120)
```

---

## Phase 1.7: Configuration

### Test: Config loads
Check log for:
```
[INFO] Configuration loaded from: config/settings.json
[INFO] Buffer duration: 120 seconds
[INFO] Resolution: 1920x1080
```

### Test: Config changes take effect
1. Edit `config/settings.json`, change `buffer_seconds` to 60
2. Restart app
3. Check log shows `Buffer duration: 60 seconds`

---

## Phase 1.8: System Tray

### Test: Tray icon appears
1. Start app
2. Look for ClipVault icon in system tray
3. Icon should be visible

### Test: Tray menu works
1. Right-click tray icon
2. Menu should show: Status, Open Clips, Settings, Exit
3. Click "Exit" - app should close

### Test: Save notification
1. Press F9 to save clip
2. Windows notification should appear showing clip saved

---

## Full Integration Test

Run this complete test sequence:

```powershell
# 1. Start fresh
Remove-Item "bin/clipvault.log" -ErrorAction SilentlyContinue
Remove-Item "D:\Clips\ClipVault\*.mp4" -ErrorAction SilentlyContinue

# 2. Start app
Start-Process ".\bin\ClipVault.exe"

# 3. Wait for initialization (watch log)
Start-Sleep -Seconds 5
Get-Content "bin/clipvault.log" -Tail 20

# 4. Wait for buffer to fill (at least 10 seconds of content)
Start-Sleep -Seconds 15

# 5. Trigger save (you need to press F9 manually)
Write-Host "Press F9 now..."
Read-Host "Press Enter after pressing F9"

# 6. Wait for save
Start-Sleep -Seconds 5

# 7. Verify clip
$clip = (Get-ChildItem "D:\Clips\ClipVault\*.mp4" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
Write-Host "Latest clip: $clip"

# 8. Check streams
Write-Host "`nStream info:"
ffprobe -show_streams $clip 2>&1 | Select-String "codec_type|codec_name"

# 9. Check audio track count
$audioTracks = (ffprobe -show_streams $clip 2>&1 | Select-String "codec_type=audio").Count
Write-Host "`nAudio tracks: $audioTracks (should be 2)"

# 10. Check for errors in log
Write-Host "`nErrors in log:"
Get-Content "bin/clipvault.log" | Select-String "ERROR"
```

## Expected Final State

After Phase 1 is complete, this should all pass:

| Check | Expected |
|-------|----------|
| App starts without errors | ✓ |
| Tray icon visible | ✓ |
| Log shows "Replay buffer started" | ✓ |
| F9 triggers save | ✓ |
| MP4 file created | ✓ |
| Video codec is h264 | ✓ |
| Audio tracks = 2 | ✓ |
| Audio codec is aac | ✓ |
| No errors in log | ✓ |
| CPU usage < 5% (with NVENC) | ✓ |
| Memory usage < 300MB | ✓ |

---

## Troubleshooting Failed Tests

If any test fails, see `TROUBLESHOOTING.md` for solutions.

Common issues:
- Missing DLLs → Run `.\build.ps1 -Setup`
- obs_reset_video fails → Check `graphics_module` is set
- No audio tracks → Check mixer configuration
- Hotkey doesn't work → Check another app isn't using F9
