# AGENTS.md - Agent Guidelines for ClipVault

> **For LLM Agents**: Read this file first, then check `AGENT_WORKFLOW.md` for the step-by-step development process.

## Quick Start for Agents

1. **Verify environment**: `.\scripts\verify-env.ps1`
2. **Check current status**: Read `PROGRESS.md` (dynamic status, updated frequently)
3. **Read workflow**: `AGENT_WORKFLOW.md` (how to implement)
4. **Build**: `.\build.ps1`
5. **Implement next task** (see PROGRESS.md for current priority)
6. **Update PROGRESS.md**: Mark tasks complete, add notes
7. **Test**: Run `.\bin\ClipVault.exe` and check `.\bin\clipvault.log`

**Note**: PLAN.md is the static roadmap (don't modify). Use PROGRESS.md for day-to-day status updates.

## Current Status

**See `PROGRESS.md` for full implementation status** - it contains:

- Current phase and active task
- Completed items ✅
- What's blocked/waiting ⏸️
- Recent changes
- Agent notes and blockers

**Quick Summary** (check PROGRESS.md for details):

- **Phase**: 1.5 (Replay Buffer Implementation)
- **Next Task**: Implement `src/replay.cpp` (see PROGRESS.md)
- **Priority**: HIGH - this is the core feature that saves clips

## Agent Rules & Responsibilities

### Project Goal

Create a **lightweight, open-source game clipping tool** for Windows with performance comparable to commercial tools like Outplayed or SteelSeries GG.

**Key Requirements**:

- **Performance**: Minimal CPU/GPU impact using hardware encoding (NVENC). Actual memory usage depends on buffer size and quality settings.
- **Quality**: High quality capture (1080p60 default) visually comparable to commercial tools
- **Audio**: Two separate tracks (system + microphone) for independent mixing later
- **Workflow**: 2-3 min buffer clips → library browser → non-destructive editing → export short highlights
- **Configuration**: JSON-based settings (resolution, FPS, buffer duration, quality, hotkey)

**Reference**: Similar tools (Outplayed) typically use 1-2GB RAM for 1080p60 2-minute buffers. We aim for comparable efficiency.

### What You CAN Do ✅

- **Write and modify code** in `src/`, `scripts/`, `config/`
- **Update documentation** when you discover new patterns, gotchas, or outdated info
- **Add new docs** for complex features or agent workflows
- **Create headers** for planned components (like we did with `replay.h`, `hotkey.h`)
- **Mark tasks complete** in PROGRESS.md when you finish them
- **Add rules/guidelines** when you learn something important
- **Fix documentation errors** immediately when you spot them

### What You CANNOT Do ❌

- **NEVER commit code** - The user commits manually when satisfied
- **NEVER push to GitHub** - Wait for explicit user instruction
- **NEVER modify** `.gitignore`, `LICENSE`, or repo structure without asking
- **NEVER delete** documentation files without asking

### Rule Documentation Process (IMPORTANT)

**When the user tells you:**

> "Always do X..." or "Never do Y..." or "When Z happens, do this..."

**You MUST ask:**

> "Should I add this rule to AGENTS.md (or another doc) so future agents know it?"

**Why?** So knowledge persists across sessions. Future agents (Opencode, Claude, etc.) need to follow the same rules.

### Keeping Documentation Updated

These are **living documents**. Update them when:

1. ✅ You complete a task (mark it done in PROGRESS.md)
2. 🐛 You discover a bug/gotcha not documented
3. 📚 You learn a new OBS pattern
4. 🔄 You change how something works
5. ❓ You find unclear instructions

**Docs you should update most often:**

- **PROGRESS.md** - Mark completed items, note blockers, update status
- **AGENTS.md** - Add new patterns, fix errors
- **CONVENTIONS.md** - Document new code style decisions
- **docs/LIBOBS.md** - Add new API examples

### Before You Start Work

1. Run `scripts\verify-env.ps1`
2. Read AGENT_WORKFLOW.md for the process
3. Check PROGRESS.md for current phase and priority task
4. Read the Implementation section of the relevant phase in docs/IMPLEMENTATION.md

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

## UI Language Tools (TypeScript/React)

The UI project uses **TypeScript**, **ESLint**, and **Prettier** with VS Code's built-in TypeScript language server.

### VS Code Extensions

Install these extensions:

- `dbaeumer.vscode-eslint` - ESLint integration
- `esbenp.prettier-vscode` - Prettier formatting
- `bradlc.vscode-tailwindcss` - Tailwind CSS support

### Commands (run from root)

**Note:** If `npm` is not recognized, Node.js might not be in your PATH. Add `C:\Program Files\nodejs\` to PATH or use full path:

```powershell
# If npm is not in PATH, use full path:
& "C:\Program Files\nodejs\npm" run ui:dev

# Or add to PATH permanently:
$env:Path += ";C:\Program Files\nodejs"

# Run UI dev server
npm run ui:dev

# Build UI
npm run ui:build

# Lint UI code
npm run ui:lint
npm run ui:lint:fix  # Auto-fix issues

# TypeScript typecheck
npm run ui:typecheck

# Check/fix formatting
npm run ui:format:check
npm run ui:format     # Auto-format

# Full UI verification
npm run ui:test
```

### Script Verification

```powershell
# Quick lint + typecheck from scripts folder
.\scripts\verify-ui.ps1
```

### Configuration Files

- `tsconfig.json` - TypeScript config (references `ui/tsconfig.json`)
- `eslint.config.js` - ESLint config (extends `ui/eslint.config.js`)
- `.prettierrc` - Prettier config (matches UI config)

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

| Component       | ID                      |
| --------------- | ----------------------- |
| Monitor capture | `monitor_capture`       |
| System audio    | `wasapi_output_capture` |
| Microphone      | `wasapi_input_capture`  |
| NVENC encoder   | `ffmpeg_nvenc`          |
| x264 fallback   | `obs_x264`              |
| Audio encoder   | `ffmpeg_aac`            |
| Replay buffer   | `replay_buffer`         |

## Don't Do

- Don't use `using namespace std;`
- Don't ignore OBS return values
- Don't forget to release OBS objects
- Don't add TODO comments (fix it or ask)
- Don't use game_capture (anti-cheat issues)
- Don't call obs_add_data_path before obs_startup (crash)
- Don't forget trailing slash on data paths

## Documentation Map

**Quick Reference:**
| Document | Purpose | When to Read |
|----------|---------|--------------|
| **README.md** | Project overview, quick start | First time viewing repo |
| **AGENTS.md** (this file) | Agent rules, build commands, OBS patterns | Every agent session |
| **AGENT_WORKFLOW.md** | Step-by-step development process | Before starting work |
| **PROGRESS.md** | **Current status, active tasks, blockers** | **Every session - this is your source of truth!** |
| **PLAN.md** | Static roadmap (don't modify) | Reference only |
| **CONVENTIONS.md** | Complete code style guide | When writing new code |
| **TESTING.md** | Manual test procedures | After completing features |

**Important**: PLAN.md is static - don't modify it. Use PROGRESS.md to track actual progress, mark completed tasks, and note any blockers.

**Technical References:**
| Document | Purpose |
|----------|---------|
| **docs/LIBOBS.md** | Full libobs API reference, OBS patterns |
| **docs/IMPLEMENTATION.md** | Step-by-step coding examples by phase |
| **docs/ARCHITECTURE.md** | System design and data flow |
| **docs/BUILD.md** | Detailed build instructions |
| **TROUBLESHOOTING.md** | Common errors and solutions |

**Configuration:**

- **config/settings.json** - App configuration reference
- **.clangd** - LSP configuration for clangd
- **CMakeLists.txt** - Build system configuration
