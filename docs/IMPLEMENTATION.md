# ClipVault Implementation Guide

Step-by-step instructions for implementing ClipVault from scratch. Each step is independently testable.

## Prerequisites

- MinGW installed (`scoop install mingw`)
- CMake installed (`scoop install cmake`)
- Git installed

## Phase 1: Setup

### Step 1.1: Clone OBS as Submodule

```bash
cd D:\Projects-Personal\ClipVault2
git init
git submodule add https://github.com/obsproject/obs-studio.git third_party/obs-studio
cd third_party/obs-studio
git checkout 31.0.2  # Or latest stable
```

**Verify**: `third_party/obs-studio/libobs/obs.h` exists.

### Step 1.2: Build libobs

Create `scripts/build-libobs.ps1`:

```powershell
$obsDir = "third_party/obs-studio"
$buildDir = "third_party/obs-build"

mkdir -Force $buildDir
cd $buildDir

cmake ../obs-studio `
    -G "MinGW Makefiles" `
    -DCMAKE_BUILD_TYPE=Release `
    -DENABLE_UI=OFF `
    -DENABLE_SCRIPTING=OFF `
    -DENABLE_BROWSER=OFF

cmake --build . --target libobs --parallel
```

**Verify**: `third_party/obs-build/libobs/libobs.dll` exists.

### Step 1.3: Copy Runtime Files

After building, copy to `bin/`:
- `libobs.dll`
- `libobs-d3d11.dll`
- `w32-pthreads.dll`
- `data/libobs/` folder (contains .effect files)
- `obs-plugins/64bit/` folder (contains capture/encoder plugins)

---

## Phase 2: Minimal OBS App

### Step 2.1: Create main.cpp

```cpp
#include <obs.h>
#include <cstdio>

int main() {
    printf("Starting OBS...\n");

    if (!obs_startup("en-US", nullptr, nullptr)) {
        printf("Failed to start OBS\n");
        return 1;
    }

    printf("OBS Version: %s\n", obs_get_version_string());

    obs_shutdown();
    printf("OBS shutdown complete\n");
    return 0;
}
```

**Verify**: Compiles, runs, prints OBS version, exits cleanly.

### Step 2.2: Add Video Initialization

```cpp
#include <obs.h>
#include <cstdio>

int main() {
    if (!obs_startup("en-US", nullptr, nullptr)) {
        printf("Failed to start OBS\n");
        return 1;
    }

    // Add data path (trailing slash required!)
    obs_add_data_path("./data/libobs/");

    // Add module path
    obs_add_module_path("./obs-plugins/64bit", "./data/obs-plugins");

    // Video config
    obs_video_info ovi = {};
    ovi.graphics_module = "libobs-d3d11";  // CRITICAL
    ovi.fps_num = 60;
    ovi.fps_den = 1;
    ovi.base_width = 1920;
    ovi.base_height = 1080;
    ovi.output_width = 1920;
    ovi.output_height = 1080;
    ovi.output_format = VIDEO_FORMAT_NV12;
    ovi.adapter = 0;
    ovi.gpu_conversion = true;
    ovi.colorspace = VIDEO_CS_709;
    ovi.range = VIDEO_RANGE_PARTIAL;
    ovi.scale_type = OBS_SCALE_BICUBIC;

    int ret = obs_reset_video(&ovi);
    if (ret != OBS_VIDEO_SUCCESS) {
        printf("obs_reset_video failed: %d\n", ret);
        obs_shutdown();
        return 1;
    }

    printf("Video initialized: 1920x1080 @ 60fps\n");

    obs_shutdown();
    return 0;
}
```

**Verify**: No errors, prints "Video initialized".

### Step 2.3: Add Audio Initialization

Add after video:

```cpp
    obs_audio_info oai = {};
    oai.samples_per_sec = 48000;
    oai.speakers = SPEAKERS_STEREO;

    if (!obs_reset_audio(&oai)) {
        printf("obs_reset_audio failed\n");
        obs_shutdown();
        return 1;
    }

    printf("Audio initialized: 48000 Hz stereo\n");
```

**Verify**: No errors, prints "Audio initialized".

### Step 2.4: Load Modules

Add after audio:

```cpp
    obs_load_all_modules();
    obs_post_load_modules();
    printf("Modules loaded\n");
```

**Verify**: Console shows loaded modules (win-capture, obs-ffmpeg, etc.)

---

## Phase 3: Capture Sources

### Step 3.1: Monitor Capture

```cpp
obs_data_t* settings = obs_data_create();
obs_data_set_int(settings, "monitor", 0);
obs_data_set_bool(settings, "capture_cursor", true);

obs_source_t* monitor = obs_source_create("monitor_capture", "monitor", settings, nullptr);
obs_data_release(settings);

if (!monitor) {
    printf("Failed to create monitor capture\n");
    return 1;
}

// Set as main output
obs_set_output_source(0, monitor);
printf("Monitor capture created\n");
```

**Verify**: No errors, source created.

### Step 3.2: System Audio Capture

```cpp
obs_data_t* audio_settings = obs_data_create();
obs_source_t* desktop_audio = obs_source_create("wasapi_output_capture", "desktop", audio_settings, nullptr);
obs_data_release(audio_settings);

if (!desktop_audio) {
    printf("Failed to create desktop audio\n");
    return 1;
}

// Route to track 1
obs_source_set_audio_mixers(desktop_audio, 1);
printf("Desktop audio created (track 1)\n");
```

### Step 3.3: Microphone Capture

```cpp
obs_data_t* mic_settings = obs_data_create();
obs_source_t* mic = obs_source_create("wasapi_input_capture", "mic", mic_settings, nullptr);
obs_data_release(mic_settings);

if (!mic) {
    printf("Failed to create microphone\n");
    return 1;
}

// Route to track 2
obs_source_set_audio_mixers(mic, 2);
printf("Microphone created (track 2)\n");
```

**Verify**: All three sources created without errors.

---

## Phase 4: Encoders

### Step 4.1: Video Encoder (NVENC)

```cpp
obs_data_t* enc_settings = obs_data_create();
obs_data_set_string(enc_settings, "rate_control", "CQP");
obs_data_set_int(enc_settings, "cqp", 20);

obs_encoder_t* video_enc = obs_video_encoder_create("jim_nvenc", "nvenc", enc_settings, nullptr);

if (!video_enc) {
    printf("NVENC not available, trying x264\n");
    video_enc = obs_video_encoder_create("obs_x264", "x264", enc_settings, nullptr);
}

obs_data_release(enc_settings);

if (!video_enc) {
    printf("No video encoder available\n");
    return 1;
}

obs_encoder_set_video(video_enc, obs_get_video());
printf("Video encoder created\n");
```

### Step 4.2: Audio Encoders (2 tracks)

```cpp
obs_data_t* aac_settings = obs_data_create();
obs_data_set_int(aac_settings, "bitrate", 160);

// Track 1 encoder
obs_encoder_t* audio_enc_1 = obs_audio_encoder_create("ffmpeg_aac", "aac1", aac_settings, 0, nullptr);
obs_encoder_set_audio(audio_enc_1, obs_get_audio());

// Track 2 encoder
obs_encoder_t* audio_enc_2 = obs_audio_encoder_create("ffmpeg_aac", "aac2", aac_settings, 1, nullptr);
obs_encoder_set_audio(audio_enc_2, obs_get_audio());

obs_data_release(aac_settings);
printf("Audio encoders created (2 tracks)\n");
```

**Verify**: Encoders created without errors.

---

## Phase 5: Replay Buffer

### Step 5.1: Create Replay Buffer Output

```cpp
obs_data_t* replay_settings = obs_data_create();
obs_data_set_int(replay_settings, "max_time_sec", 120);  // 2 minutes
obs_data_set_int(replay_settings, "max_size_mb", 512);

obs_output_t* replay = obs_output_create("replay_buffer", "replay", replay_settings, nullptr);
obs_data_release(replay_settings);

if (!replay) {
    printf("Failed to create replay buffer\n");
    return 1;
}

// Connect encoders
obs_output_set_video_encoder(replay, video_enc);
obs_output_set_audio_encoder(replay, audio_enc_1, 0);
obs_output_set_audio_encoder(replay, audio_enc_2, 1);
obs_output_set_mixers(replay, 0x03);  // Enable tracks 1 and 2

printf("Replay buffer configured\n");
```

### Step 5.2: Start Replay Buffer

```cpp
if (!obs_output_start(replay)) {
    printf("Failed to start replay: %s\n", obs_output_get_last_error(replay));
    return 1;
}

printf("Replay buffer running!\n");
```

**Verify**: "Replay buffer running!" printed, no errors.

---

## Phase 6: Save Clip

### Step 6.1: Trigger Save

```cpp
// To save the replay buffer:
proc_handler_t* ph = obs_output_get_proc_handler(replay);

calldata_t cd;
calldata_init(&cd);
calldata_set_string(&cd, "path", "D:/Clips/test.mp4");

proc_handler_call(ph, "save", &cd);
calldata_free(&cd);

printf("Save triggered\n");
```

### Step 6.2: Wait for Save Signal

```cpp
// Connect to save signal
signal_handler_t* sh = obs_output_get_signal_handler(replay);

auto on_saved = [](void* data, calldata_t* cd) {
    const char* path = calldata_string(cd, "path");
    printf("Clip saved: %s\n", path);
};

signal_handler_connect(sh, "saved", on_saved, nullptr);
```

**Verify**: Clip file created at specified path.

---

## Phase 7: Integration

Combine all the above into proper classes:
- `ObsCore` - init/shutdown
- `Capture` - sources
- `Encoder` - video/audio encoders
- `Replay` - replay buffer
- `Hotkey` - F9 handler
- `App` - ties it all together

---

## Final Verification

```powershell
# Run the app
.\bin\ClipVault.exe

# Wait for "Replay buffer running!" in console/log

# Press F9

# Check clip was saved
ls D:\Clips\

# Verify 2 audio tracks
ffprobe -show_streams D:\Clips\test.mp4 2>&1 | Select-String "codec_type"
# Should show: video, audio, audio (3 streams)
```
