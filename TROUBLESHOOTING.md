# Troubleshooting Guide

Common issues and their solutions. This is based on real problems encountered during development.

## OBS Initialization Errors

### obs_reset_video returns -1 (OBS_VIDEO_NOT_SUPPORTED)

**Symptoms**: Log shows `obs_reset_video failed with code: -1`

**Causes**:
1. `graphics_module` not set
2. Invalid video configuration

**Fix**:
```cpp
obs_video_info ovi = {};
ovi.graphics_module = "libobs-d3d11";  // REQUIRED on Windows!
// ... rest of config
```

---

### obs_reset_video returns -4 (OBS_VIDEO_MODULE_NOT_FOUND)

**Symptoms**: Log shows `obs_reset_video failed with code: -4`

**Cause**: `libobs-d3d11.dll` not found

**Fix**: Ensure these files exist in your `bin/` directory:
- `libobs-d3d11.dll`
- `libobs.dll`

---

### obs_reset_video returns -5

**Symptoms**: Log shows `obs_reset_video failed with code: -5`

**Cause**: Generic initialization failure, usually data path issues

**Fix**: Check data paths are set correctly with trailing slash:
```cpp
// CORRECT
obs_add_data_path("./data/libobs/");

// WRONG - missing trailing slash
obs_add_data_path("./data/libobs");
```

---

### "Failed to find file 'default.effect'"

**Symptoms**: Error in log about missing effect files

**Cause**: libobs can't find its shader files

**Fix**:
1. Ensure `bin/data/libobs/` folder exists
2. Ensure it contains `.effect` files (default.effect, etc.)
3. Ensure data path has trailing slash

---

## Build Errors

### "obs.h not found"

**Cause**: OBS headers not available

**Fix**: Run setup to clone OBS:
```powershell
.\build.ps1 -Setup
```

---

### "undefined reference to obs_*"

**Cause**: Not linking against libobs

**Fix**: Check CMakeLists.txt links the library:
```cmake
target_link_libraries(ClipVault PRIVATE ${LIBOBS_LIBRARY})
```

---

### "mingw32-make not found"

**Cause**: MinGW not in PATH

**Fix**:
```powershell
# Add to current session
$env:PATH += ";C:\Users\$env:USERNAME\scoop\apps\mingw\current\bin"

# Or install via scoop
scoop install mingw
```

---

## Runtime Errors

### App crashes immediately on startup

**Possible Causes**:
1. Missing DLLs
2. Wrong OBS initialization order

**Debug Steps**:
1. Run from command line to see error messages
2. Check `clipvault.log`
3. Verify all DLLs present in `bin/`

---

### No audio in saved clips

**Cause**: Audio mixers not configured correctly

**Fix**: Ensure both:
1. Sources routed to correct tracks:
```cpp
obs_source_set_audio_mixers(system_audio, 1);  // Track 1
obs_source_set_audio_mixers(microphone, 2);    // Track 2
```

2. Output has mixers enabled:
```cpp
obs_output_set_mixers(replay, 0x03);  // Tracks 1 and 2
```

---

### Only one audio track in MP4

**Cause**: Only one audio encoder connected

**Fix**: Connect both encoders:
```cpp
obs_output_set_audio_encoder(replay, audio_enc_1, 0);  // Index 0
obs_output_set_audio_encoder(replay, audio_enc_2, 1);  // Index 1
```

---

### Audio/video out of sync

**Cause**: Usually wrong initialization order

**Fix**: Follow exact order:
1. `obs_startup()`
2. `obs_add_data_path()`
3. `obs_add_module_path()`
4. `obs_reset_video()` ← Video FIRST
5. `obs_reset_audio()` ← Audio SECOND
6. `obs_load_all_modules()` ← Modules LAST

---

### Replay buffer fails to start

**Symptoms**: `obs_output_start()` returns false

**Debug**:
```cpp
if (!obs_output_start(replay)) {
    const char* error = obs_output_get_last_error(replay);
    LOG_ERROR("Replay start failed: " << error);
}
```

**Common Causes**:
1. Encoder not connected
2. Encoder failed to initialize
3. Invalid output settings

---

### NVENC not available

**Symptoms**: Falls back to x264, or encoder creation fails

**Causes**:
1. No NVIDIA GPU
2. Old GPU (needs GTX 600+)
3. Driver too old
4. obs-ffmpeg module not loaded

**Fix**: Ensure fallback to x264:
```cpp
encoder = obs_video_encoder_create("jim_nvenc", ...);
if (!encoder) {
    LOG_WARNING("NVENC not available, using x264");
    encoder = obs_video_encoder_create("obs_x264", ...);
}
```

---

### Hotkey doesn't work

**Symptoms**: F9 press does nothing

**Causes**:
1. Hotkey not registered
2. Another app has the hotkey
3. App doesn't have focus (for some hotkey methods)

**Fix**: Use `RegisterHotKey` for global hotkey:
```cpp
RegisterHotKey(hwnd, HOTKEY_ID, 0, VK_F9);
```

---

### Clips saved to wrong location

**Cause**: Output path not set or invalid

**Fix**: Check config loading and path handling:
```cpp
std::string output_dir = config.get_output_dir();
if (!PathFileExistsA(output_dir.c_str())) {
    CreateDirectoryA(output_dir.c_str(), nullptr);
}
```

---

## Verification Commands

### Check clip has 2 audio tracks
```powershell
ffprobe -show_streams clip.mp4 2>&1 | Select-String "codec_type=audio"
# Should show 2 lines
```

### Check clip codec info
```powershell
ffprobe -show_streams clip.mp4 2>&1 | Select-String "codec_name"
# Should show: h264, aac, aac
```

### Check DLLs in bin/
```powershell
ls bin/*.dll
# Should include: libobs.dll, libobs-d3d11.dll, w32-pthreads.dll
```

### Check data files
```powershell
ls bin/data/libobs/*.effect
# Should show multiple .effect files
```

### Check modules
```powershell
ls bin/obs-plugins/64bit/*.dll
# Should include: win-capture.dll, win-wasapi.dll, obs-ffmpeg.dll
```

---

## Getting Help

If none of the above fixes your issue:

1. Check `clipvault.log` for detailed error messages
2. Run with verbose logging enabled
3. Verify all files are present (DLLs, data, plugins)
4. Compare your code against AGENT.md examples
5. Re-read LIBOBS.md for API usage patterns
