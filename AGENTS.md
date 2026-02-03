# AGENTS.md - ClipVault Agent Guidelines

> **For LLM Agents**: Read this file first. Claude should also read `CLAUDE.md` for Claude-specific notes. See `AGENT_WORKFLOW.md` for the development process.

## Branch & PR Workflow (CRITICAL)

**ALL work must be done on branches. ALL changes must go through pull requests.**

```text
1. Create branch from master: git checkout -b feature/your-feature
2. Make changes on branch
3. Commit changes (use conventional commits)
4. Push branch: git push -u origin feature/your-feature
5. Create PR on GitHub
6. CodeRabbit reviews PR automatically
7. Address CodeRabbit feedback
8. Get human review + approval
9. Merge to master
10. Delete branch
```

### Branch Naming

- `feature/*` - New features
- `fix/*` - Bug fixes
- `refactor/*` - Code refactoring
- `docs/*` - Documentation only
- `test/*` - Adding/fixing tests

### Never

- ❌ Never commit directly to master
- ❌ Never push to master
- ❌ Never work without a branch

## CodeRabbit Integration

CodeRabbit automatically reviews every PR on GitHub. To use its context in Claude:

1. **Check CodeRabbit comments on GitHub** - Read all feedback before finalizing work
2. **Use @coderabbitai commands** in GitHub PR comments:
   - `@coderabbitai summarize` - Get PR summary
   - `@coderabbitai explain` - Explain specific code sections
   - `@coderabbitai walkthrough` - Step-by-step walkthrough
3. **Fetch CodeRabbit context** before writing code - Check if it has reviewed similar changes

### Fetching CodeRabbit PR Comments

When working on a PR, fetch the review comments to understand what CodeRabbit flagged:

```powershell
# Get PR number from GitHub URL
gh pr view --json number,title,body,reviews
gh pr review-diff  # See all comments
```

Add relevant CodeRabbit suggestions to your implementation context.

## Quick Start

```powershell
# 1. Verify environment
.\scripts\verify-env.ps1

# 1b. Install UI deps (first-time or after cleanup)
cd ui && npm install
cd ..

# 2. Check status
Get-Content PROGRESS.md | Select-String "Current Status"

# 3. Create branch for your work
git checkout -b feature/your-feature-name

# 4. Build & test (ALWAYS test packaged version!)
.\build.ps1
cd ui && npm run build:react && npx electron-builder --win --dir

# 5. Test packaged app
.\ui\release\win-unpacked\ClipVault.exe

# 6. Commit and push
git add .
git commit -m "feat: description of changes"
git push -u origin feature/your-feature-name

# 7. Create PR on GitHub - CodeRabbit will review automatically
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
obs_load_all_modules();               // MUST be before video/audio reset
obs_post_load_modules();
obs_reset_video(&ovi);                // AFTER modules
obs_reset_audio(&oai);
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

- ❌ Never commit directly to master
- ❌ Never push to master
- ❌ Never work without a branch
- ❌ Don't commit without testing packaged version
- ❌ Don't ignore OBS return values
- ❌ Don't forget to release OBS objects
- ❌ Don't use `using namespace std;`
- ❌ Don't skip trailing slash in data paths
- ❌ Don't call `obs_add_data_path` before `obs_startup`
