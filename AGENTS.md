# AGENTS.md - ClipVault Agent Guidelines

> **For LLM Agents**: Read this file first. See `AGENT_WORKFLOW.md` for the development process.

## Quick Start

```powershell
# 1. Verify environment
.\scripts\verify-env.ps1

# 2. Check status
Get-Content PROGRESS.md | Select-String "Current Status"

# 3. Build & test (ALWAYS test packaged version!)
.\build.ps1
cd ui && npm run build:react && npx electron-builder --win --dir

# 4. Test packaged app
.\ui\release\win-unpacked\ClipVault.exe

# 5. Update PROGRESS.md when done
```

## Build Commands

### C++ Backend

```powershell
.\build.ps1              # Release build
.\build.ps1 -Debug       # Debug build
.\build.ps1 -Clean       # Clean build
.\build.ps1 -Setup       # First-time setup
```

### UI (run from `ui/` directory)

```powershell
npm run dev              # Dev mode with hot reload
npm run build:react      # Build React
npm run build:electron   # Build Electron main process
npm run lint             # Lint code
npm run lint:fix         # Auto-fix lint issues
npm run format           # Format code
npm run typecheck        # TypeScript check
```

### Full Package

```powershell
cd ui
npm run build:react && npx electron-builder --win --dir
# Output: ui/release/win-unpacked/ClipVault.exe
```

## Code Style

### C++17 (Backend)

- **Files**: `snake_case.cpp`, `snake_case.h`
- **Classes**: `PascalCase`
- **Functions/variables**: `snake_case`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Private members**: `snake_case_` (trailing underscore)
- **Indentation**: 4 spaces, no tabs
- **Braces**: Function: new line, Control: same line

```cpp
void my_function()
{
    if (condition) {
        do_something();
    }
}
```

### TypeScript/React (UI)

- **Files**: `camelCase.ts`, `PascalCase.tsx`
- **Components**: `PascalCase`
- **Hooks**: `camelCase` starting with `use`
- **Formatting**: Prettier (configured in `.prettierrc`)

### Import Order (C++)

```cpp
#pragma once

// 1. Corresponding header
#include "my_class.h"

// 2. System headers
#include <string>
#include <windows.h>

// 3. Third-party
#include <obs.h>

// 4. Project
#include "config.h"
```

## Error Handling

```cpp
// Return bool, use early returns
bool initialize() {
    if (!obs_startup(...)) {
        LOG_ERROR("Failed to start OBS");
        return false;
    }
    return true;
}
```

## OBS Patterns (CRITICAL)

**Always release OBS objects:**

```cpp
obs_data_t* settings = obs_data_create();
obs_data_release(settings);

obs_source_t* source = obs_source_create(...);
obs_source_release(source);
```

**Initialization order (MUST follow):**

```cpp
obs_startup("en-US", config_path, nullptr);
obs_add_data_path("./data/libobs/");  // Trailing slash!
obs_add_module_path(plugin_bin, plugin_data);
obs_reset_video(&ovi);  // AFTER modules
obs_reset_audio(&oai);
obs_load_all_modules();
```

## Project Structure

```
src/                    # C++ backend
├── main.cpp           # Entry point
├── obs_core.cpp       # OBS init
├── capture.cpp        # Video/audio sources
├── encoder.cpp        # NVENC/x264
├── replay.cpp         # Replay buffer
├── hotkey.cpp         # F9 handler
└── config.cpp         # Settings

ui/src/                 # Electron UI
├── main/              # Main process
│   └── main.ts        # App lifecycle
├── renderer/          # React UI
│   ├── components/
│   ├── stores/
│   └── hooks/
└── preload/           # IPC bridge
```

## Documentation

- **PROGRESS.md**: Current status, active tasks
- **PLAN.md**: Static roadmap
- **AGENT_WORKFLOW.md**: Step-by-step process
- **docs/LIBOBS.md**: OBS API reference

## Don't Do

- ❌ Don't commit without testing packaged version
- ❌ Don't ignore OBS return values
- ❌ Don't forget to release OBS objects
- ❌ Don't use `using namespace std;`
- ❌ Don't skip trailing slash in data paths
- ❌ Don't call `obs_add_data_path` before `obs_startup`
