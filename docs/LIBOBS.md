# libobs API Guide

This document covers the libobs API patterns used in ClipVault.

## Core Concepts

### Objects and References

libobs uses reference counting. Always release objects when done:

```cpp
obs_data_t *settings = obs_data_create();
// ... use settings ...
obs_data_release(settings);  // REQUIRED

obs_source_t *source = obs_source_create(...);
// ... use source ...
obs_source_release(source);  // REQUIRED
```

### Initialization Order

**CRITICAL**: Order matters. Follow exactly:

```cpp
// 1. Start OBS
obs_startup("en-US", config_path, nullptr);

// 2. Add data paths (AFTER startup, WITH trailing slash)
obs_add_data_path("./data/libobs/");  // Note the trailing slash!

// 3. Add module paths
obs_add_module_path("./obs-plugins/64bit", "./data/obs-plugins");

// 4. Load modules (BEFORE video/audio reset - CRITICAL!)
// If you reset video before loading modules, monitor_capture will be BLACK
// See: https://github.com/obsproject/obs-studio/discussions/12367
obs_load_all_modules();
obs_post_load_modules();

// 5. Reset video (AFTER modules loaded, MUST set graphics_module on Windows)
obs_video_info ovi = {};
ovi.graphics_module = "libobs-d3d11";  // CRITICAL!
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
obs_reset_video(&ovi);

// 6. Reset audio (AFTER modules loaded)
obs_audio_info oai = {};
oai.samples_per_sec = 48000;
oai.speakers = SPEAKERS_STEREO;
obs_reset_audio(&oai);
```

**⚠️ WARNING**: If you call `obs_reset_video()` before `obs_load_all_modules()`, capture sources like `monitor_capture` will produce **black frames**. The modules must be loaded first so capture plugins can register their graphics capabilities.

## Sources

### Source Types

| ID | Description |
|----|-------------|
| `monitor_capture` | Capture entire monitor (anti-cheat safe) |
| `window_capture` | Capture specific window |
| `game_capture` | Hook game process (NOT anti-cheat safe) |
| `wasapi_output_capture` | System audio (what speakers play) |
| `wasapi_input_capture` | Microphone input |

### Creating Sources

```cpp
// Monitor capture
obs_data_t *settings = obs_data_create();
obs_data_set_int(settings, "monitor", 0);  // Monitor index
obs_data_set_bool(settings, "capture_cursor", true);
obs_source_t *monitor = obs_source_create("monitor_capture", "my_monitor", settings, nullptr);
obs_data_release(settings);

// System audio (WASAPI output/loopback)
obs_data_t *audio_settings = obs_data_create();
obs_data_set_string(audio_settings, "device_id", "default");  // Use "default" or specific device ID
obs_data_set_bool(audio_settings, "use_device_timing", true);
obs_source_t *desktop = obs_source_create("wasapi_output_capture", "desktop_audio", audio_settings, nullptr);
obs_data_release(audio_settings);

// Microphone (WASAPI input)
obs_data_t *mic_settings = obs_data_create();
obs_data_set_string(mic_settings, "device_id", "default");  // Use "default" or specific device ID
obs_source_t *mic = obs_source_create("wasapi_input_capture", "microphone", mic_settings, nullptr);
obs_data_release(mic_settings);
```

### Audio Source Activation (CRITICAL)

Audio sources must be **activated** and **connected to output channels** to capture:

```cpp
// Create and configure source
obs_source_t *desktop = obs_source_create("wasapi_output_capture", "desktop", settings, nullptr);

// 1. Activate the source (starts capture)
obs_source_activate(desktop);

// 2. Connect to output channel (CRITICAL: channels 1-6 are for audio)
obs_set_output_source(1, desktop);  // Channel 1 = first audio source

// 3. Route to mixer track
obs_source_set_audio_mixers(desktop, 1);  // Track 1
```

**⚠️ WARNING**: Without `obs_source_activate()` and `obs_set_output_source()`, audio sources will be silent even though they appear to be working!

### Audio Routing

Each audio source can be routed to specific mixer tracks (1-6):

```cpp
// Route to track 1 only (bit 0 = 0x01)
obs_source_set_audio_mixers(desktop_audio, 1);

// Route to track 2 only (bit 1 = 0x02)
obs_source_set_audio_mixers(microphone, 2);

// Route to tracks 1 and 2 (bits 0+1 = 0x03)
obs_source_set_audio_mixers(source, 3);
```

## Encoders

### Encoder Types

| ID | Description |
|----|-------------|
| `ffmpeg_nvenc` | NVIDIA NVENC H.264 (recommended) - provided by obs-ffmpeg.dll |
| `jim_nvenc` | Alternative NVENC (requires obs-nvenc.dll plugin) |
| `obs_x264` | CPU x264 (fallback) |
| `ffmpeg_aac` | AAC audio encoder |

**Note on NVENC**: We use `ffmpeg_nvenc` as the primary encoder because it's provided by `obs-ffmpeg.dll` which is always present. The `jim_nvenc` encoder requires a separate `obs-nvenc.dll` plugin which may not be included in all OBS distributions.

### Creating Video Encoder

```cpp
obs_data_t *settings = obs_data_create();
obs_data_set_string(settings, "rate_control", "CQP");
obs_data_set_int(settings, "cqp", 20);  // Quality (lower = better)
obs_data_set_string(settings, "preset", "p4");  // NVENC preset (p1-p7)

// Try NVENC first (ffmpeg_nvenc)
obs_encoder_t *video_enc = obs_video_encoder_create("ffmpeg_nvenc", "video", settings, nullptr);

if (!video_enc) {
    // Fallback to x264
    obs_data_set_string(settings, "preset", "veryfast");  // x264 preset
    video_enc = obs_video_encoder_create("obs_x264", "video", settings, nullptr);
}

obs_data_release(settings);

// Connect to video output
obs_encoder_set_video(video_enc, obs_get_video());
```

### Creating Audio Encoders (2 tracks)

```cpp
obs_data_t *settings = obs_data_create();
obs_data_set_int(settings, "bitrate", 160);

// Track 1 encoder (mixer index 0)
obs_encoder_t *audio_enc_1 = obs_audio_encoder_create("ffmpeg_aac", "aac_track1", settings, 0, nullptr);
obs_encoder_set_audio(audio_enc_1, obs_get_audio());

// Track 2 encoder (mixer index 1)
obs_encoder_t *audio_enc_2 = obs_audio_encoder_create("ffmpeg_aac", "aac_track2", settings, 1, nullptr);
obs_encoder_set_audio(audio_enc_2, obs_get_audio());

obs_data_release(settings);
```

## Outputs

### Output Types

| ID | Description |
|----|-------------|
| `replay_buffer` | Rolling buffer, saves on demand |
| `ffmpeg_muxer` | Direct file recording |
| `rtmp_output` | RTMP streaming |

### Replay Buffer Setup

```cpp
obs_data_t *settings = obs_data_create();
obs_data_set_int(settings, "max_time_sec", 120);  // Buffer duration
obs_data_set_int(settings, "max_size_mb", 512);   // Max memory

obs_output_t *replay = obs_output_create("replay_buffer", "replay", settings, nullptr);
obs_data_release(settings);

// Connect video encoder
obs_output_set_video_encoder(replay, video_enc);

// Connect audio encoders
obs_output_set_audio_encoder(replay, audio_enc_1, 0);  // Track 1
obs_output_set_audio_encoder(replay, audio_enc_2, 1);  // Track 2

// Enable both mixer tracks
obs_output_set_mixers(replay, 0x03);  // Binary 11 = tracks 1 and 2
```

### Starting/Stopping

```cpp
// Start
if (!obs_output_start(replay)) {
    const char *error = obs_output_get_last_error(replay);
    printf("Failed to start: %s\n", error);
}

// Stop
obs_output_stop(replay);
```

### Saving Replay

```cpp
// Get proc handler
proc_handler_t *ph = obs_output_get_proc_handler(replay);

// Call save procedure
calldata_t cd;
calldata_init(&cd);
calldata_set_string(&cd, "path", "D:/Clips/my_clip.mp4");
proc_handler_call(ph, "save", &cd);
calldata_free(&cd);
```

### Save Complete Signal

```cpp
// Callback function
void on_saved(void *data, calldata_t *cd) {
    const char *path = calldata_string(cd, "path");
    printf("Saved to: %s\n", path);
}

// Connect to signal
signal_handler_t *sh = obs_output_get_signal_handler(replay);
signal_handler_connect(sh, "saved", on_saved, nullptr);
```

## Common Error Codes

### obs_reset_video return values

| Code | Constant | Cause | Fix |
|------|----------|-------|-----|
| 0 | OBS_VIDEO_SUCCESS | Success | - |
| -1 | OBS_VIDEO_NOT_SUPPORTED | Bad config | Check graphics_module is set |
| -2 | OBS_VIDEO_INVALID_PARAM | Invalid parameter | Check all ovi fields |
| -3 | OBS_VIDEO_CURRENTLY_ACTIVE | Already running | Call obs_shutdown first |
| -4 | OBS_VIDEO_MODULE_NOT_FOUND | Can't load graphics | Check libobs-d3d11.dll exists |
| -5 | OBS_VIDEO_FAIL | Generic failure | Check data paths |

## Best Practices

1. **Always check return values** - Most functions return nullptr or false on failure
2. **Always release objects** - Memory leaks will accumulate
3. **Initialize in correct order** - Startup → paths → video → audio → modules
4. **Use trailing slash on data paths** - OBS concatenates paths directly
5. **Set graphics_module** - Required on Windows, crashes without it
6. **Don't use game_capture** - Not anti-cheat safe, use monitor_capture instead
