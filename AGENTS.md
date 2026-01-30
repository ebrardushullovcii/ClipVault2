# AGENTS.md - Agent Guidelines for ClipVault

## Build Commands

```powershell
# First-time setup (clone and build OBS dependencies)
.\build.ps1 -Setup

# Regular build (Release)
.\build.ps1

# Debug build
.\build.ps1 -Debug

# Clean build
.\build.ps1 -Clean

# Build and run
.\build.ps1 -Run

# Run executable
.\bin\ClipVault.exe
```

## Language Server (clangd)

**clangd** provides IDE features: autocomplete, go-to-definition, real-time error checking.

### Install clangd

```powershell
# Via scoop (recommended)
scoop install llvm

# Or download from https://github.com/clangd/clangd/releases
```

### Setup

1. **Generate compile commands** (required for clangd to understand includes):
```powershell
# Build once to generate compile_commands.json in build/
.\build.ps1
```

2. **Editor setup**:
   - **VS Code**: Install "clangd" extension (NOT Microsoft's C/C++ extension)
   - **Cursor**: Same as VS Code - install clangd extension
   - **Other editors**: See https://clangd.llvm.org/installation.html

### Configuration Files

- `.clangd` - clangd configuration with OBS-specific settings
- `CMakePresets.json` - CMake preset to ensure compile_commands.json is generated
- `build/compile_commands.json` - Auto-generated on build, tells clangd how files are compiled

### Verify LSP Works

1. Open any `.cpp` file in editor
2. You should see:
   - Autocomplete on `#include <obs.h>` types
   - Error squiggles for invalid code
   - "Go to definition" on OBS functions (F12 in VS Code)

## Testing

**No automated test suite.** Tests are manual verification per TESTING.md:

```powershell
# Watch log during development
Get-Content -Path ".\bin\clipvault.log" -Wait -Tail 20

# Verify clip has 2 audio tracks (after saving with F9)
ffprobe -show_streams clip.mp4 2>&1 | Select-String "codec_type=audio"
```

## Code Style (C++17)

### Naming
- Files: `snake_case.cpp`, `snake_case.h`
- Classes: `PascalCase`
- Functions/variables: `snake_case`
- Constants: `SCREAMING_SNAKE_CASE`
- Private members: `snake_case_` (trailing underscore)

### Formatting
- 4 spaces (no tabs)
- Functions: brace on new line
- Control structures: brace on same line
- Line length: soft 100, hard 120

```cpp
void function()
{
    if (condition) {
        return true;
    }
}
```

### Includes Order
```cpp
#pragma once

// 1. Corresponding header (for .cpp)
#include "my_class.h"

// 2. System headers
#include <string>
#include <windows.h>

// 3. Third-party headers
#include <obs.h>

// 4. Project headers
#include "config.h"
```

## Project Structure

```
src/
├── main.cpp         # Entry point, WinMain
├── app.cpp          # Application lifecycle
├── obs_core.cpp     # OBS initialization (CRITICAL)
├── capture.cpp      # Monitor + audio sources
├── encoder.cpp      # NVENC + AAC setup
├── replay.cpp       # Replay buffer (CORE FEATURE)
├── hotkey.cpp       # F9 global hotkey
├── config.cpp       # Settings JSON
├── logger.cpp       # File logging
└── tray.cpp         # System tray icon
```

## Error Handling

```cpp
// Return bool for success/failure
bool initialize() {
    if (!obs_startup(...)) {
        LOG_ERROR("Failed to start OBS");
        return false;
    }
    return true;
}

// Use early returns
bool do_thing() {
    if (!precondition) {
        LOG_ERROR("Precondition failed");
        return false;
    }
    // Main logic here
    return true;
}
```

## Logging

```cpp
LOG_INFO("Starting component");
LOG_WARNING("Non-fatal issue: " << details);
LOG_ERROR("Fatal error: " << error_code);
LOG_DEBUG("Debug info: " << value);  // Debug builds only
```

## Critical OBS Patterns

### Reference Counting (ALWAYS release)
```cpp
obs_data_t* settings = obs_data_create();
// ... use settings ...
obs_data_release(settings);  // REQUIRED

obs_source_t* source = obs_source_create(...);
obs_source_release(source);  // REQUIRED when done
```

### Initialization Order (MUST follow)
```cpp
obs_startup("en-US", config_path, nullptr);
obs_add_data_path("./data/libobs/");  // Trailing slash REQUIRED
obs_add_module_path(plugin_bin, plugin_data);

obs_video_info ovi = {};
ovi.graphics_module = "libobs-d3d11";  // REQUIRED on Windows
obs_reset_video(&ovi);

obs_audio_info oai = {};
oai.samples_per_sec = 48000;
obs_reset_audio(&oai);

obs_load_all_modules();
```

### Two Audio Tracks
```cpp
// Route sources to tracks
obs_source_set_audio_mixers(system_audio, 1);  // Track 1
obs_source_set_audio_mixers(microphone, 2);    // Track 2

// Connect encoders to output
obs_output_set_audio_encoder(output, audio_enc_1, 0);
obs_output_set_audio_encoder(output, audio_enc_2, 1);
obs_output_set_mixers(output, 0x03);  // Enable tracks 1+2
```

## Common IDs

| Component | ID |
|-----------|-----|
| Monitor capture | `monitor_capture` |
| System audio | `wasapi_output_capture` |
| Microphone | `wasapi_input_capture` |
| NVENC encoder | `jim_nvenc` |
| x264 fallback | `obs_x264` |
| Audio encoder | `ffmpeg_aac` |
| Replay buffer | `replay_buffer` |

## Don't Do

- Don't use `using namespace std;`
- Don't ignore OBS return values
- Don't forget to release OBS objects
- Don't add TODO comments (fix it or ask)
- Don't use game_capture (anti-cheat issues)
- Don't call obs_add_data_path before obs_startup (crash)
- Don't forget trailing slash on data paths

## Documentation

- **docs/LIBOBS.md** - Full libobs API reference
- **docs/IMPLEMENTATION.md** - Step-by-step implementation guide
- **CONVENTIONS.md** - Complete style guide
- **TESTING.md** - Manual test procedures
- **PLAN.md** - Development roadmap
