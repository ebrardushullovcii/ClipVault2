# Agent Development Workflow for ClipVault

> This guide is optimized for autonomous agents (Opencode, Claude Code, etc.)
> Human review is minimal - agents must verify their own work

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

CodeRabbit automatically reviews every PR on GitHub. Use these commands in PR comments:

- `@coderabbitai summarize` - Get PR summary
- `@coderabbitai explain` - Explain specific code sections
- `@coderabbitai walkthrough` - Step-by-step walkthrough

**Before writing code, fetch CodeRabbit PR comments:**

```powershell
gh pr view --json number,title,body,reviews
gh pr review-diff  # See all comments
```

Add relevant CodeRabbit suggestions to your implementation context.

## Critical Principle

**If you can't verify it works, don't say it's done.**

## Pre-Flight Checklist (MANDATORY)

Before starting ANY work:

```powershell
# 1. Check environment
.\scripts\verify-env.ps1

# 2. Verify build works
.\build.ps1

# 3. Check current implementation status
Get-Content PROGRESS.md | Select-String "Current Phase|Active Task"
```

If `verify-env.ps1` fails, STOP and ask user to run `.\build.ps1 -Setup`

## Workflow for Adding New Components

### Step 1: Study Existing Patterns (5 min)

Look at a similar completed component:
- **Logger** (`src/logger.h` + `src/logger.cpp`) - Simple singleton pattern
- **Config** (`src/config.h` + `src/config.cpp`) - Settings management
- **Capture** (`src/capture.h` + `src/capture.cpp`) - OBS source management

Copy the structure, adapt for your component.

### Step 2: Check PLAN.md (2 min)

Find your task in PLAN.md. Note:
- What phase are you in?
- What files should exist?
- What are the acceptance criteria?

### Step 3: Create Header First (10 min)

ALWAYS create `.h` before `.cpp`:

```cpp
#pragma once
#include <string>

namespace clipvault {

class YourManager {
public:
    static YourManager& instance();
    
    bool initialize();  // Return false on error, set last_error_
    void shutdown();
    
    bool is_initialized() const { return initialized_; }
    const std::string& last_error() const { return last_error_; }

private:
    YourManager() = default;
    ~YourManager();
    
    bool initialized_ = false;
    std::string last_error_;
};

} // namespace clipvault
```

### Step 4: Add to CMakeLists.txt (2 min)

Edit `CMakeLists.txt`, add your `.cpp` to SOURCES list:

```cmake
set(SOURCES
    src/main.cpp
    src/logger.cpp
    src/config.cpp
    ...
    src/your_component.cpp  # ADD THIS
)
```

**Without this, your code won't compile!**

### Step 5: Implement .cpp (30-60 min)

Follow patterns from similar components:

```cpp
#include "your_component.h"
#include "logger.h"

#include <obs.h>  // If using OBS

namespace clipvault {

YourManager& YourManager::instance() {
    static YourManager instance;
    return instance;
}

YourManager::~YourManager() {
    if (initialized_) {
        shutdown();
    }
}

bool YourManager::initialize() {
    if (initialized_) {
        return true;
    }
    
    LOG_INFO("Initializing your component...");
    
    // Your initialization code here
    // Return false and set last_error_ on failure
    
    initialized_ = true;
    LOG_INFO("Your component initialized");
    return true;
}

void YourManager::shutdown() {
    if (!initialized_) {
        return;
    }
    
    LOG_INFO("Shutting down your component...");
    
    // Cleanup code here
    // Always release OBS objects: obs_source_release(source_);
    
    initialized_ = false;
}

} // namespace clipvault
```

### Step 6: Integrate into main.cpp (5 min)

Add to `main.cpp`:

```cpp
#include "your_component.h"

// In WinMain, after other initializations:
auto& your_comp = clipvault::YourManager::instance();
if (!your_comp.initialize()) {
    LOG_ERROR("Failed to initialize your component: " + your_comp.last_error());
    // Cleanup previous managers
    return 1;
}

// In cleanup section:
your_comp.shutdown();
```

### Step 7: Build and Fix (Until it compiles)

```powershell
.\build.ps1
```

Fix ALL compiler errors before proceeding.

### Step 8: Verify with LSP

In VS Code/Cursor with clangd:
1. Open your .cpp file
2. Check for error squiggles
3. Hover over OBS types - should show documentation
4. Press F12 on functions - should go to definition

### Step 9: Test (MANDATORY)

Run the application:

```powershell
.\bin\ClipVault.exe
```

Check the log:
```powershell
Get-Content .\bin\clipvault.log -Tail 30
```

You should see:
- No ERROR messages
- "Your component initialized" message
- Clean shutdown message

### Step 10: Update Documentation

Mark complete in PROGRESS.md:
```markdown
## Completed ✅

### Phase X.Y: Component Name
- [x] Create src/component.cpp
- [x] Implement feature Y
```

Also update the "Current Status Overview" section at the top.

## Common Agent Mistakes (And How to Avoid)

### Mistake 1: Forgetting CMakeLists.txt
**Symptom**: "undefined reference" errors
**Fix**: Always add new .cpp files to CMakeLists.txt SOURCES

### Mistake 2: Not Checking Return Values
**Symptom**: Silent failures, crashes
**Fix**: Always check OBS function returns:
```cpp
obs_source_t* source = obs_source_create(...);
if (!source) {
    last_error_ = "Failed to create source";
    return false;
}
```

### Mistake 3: Memory Leaks
**Symptom**: Memory usage grows, eventual crash
**Fix**: Always release OBS objects in destructor/shutdown:
```cpp
if (source_) {
    obs_source_release(source_);
    source_ = nullptr;
}
```

### Mistake 4: Wrong Include Order
**Symptom**: Compilation errors, missing definitions
**Fix**: Follow include order from AGENTS.md:
1. Corresponding header
2. System headers
3. Third-party (obs.h)
4. Project headers

### Mistake 5: Missing Trailing Slashes
**Symptom**: "Failed to find file" errors
**Fix**: Always use trailing slash on paths:
```cpp
obs_add_data_path("./data/libobs/");  // CORRECT
obs_add_data_path("./data/libobs");   // WRONG
```

### Mistake 6: Wrong OBS Init Order
**Symptom**: obs_reset_video fails, crashes
**Fix**: Follow exact order from AGENTS.md:
1. obs_startup
2. obs_add_data_path
3. obs_add_module_path
4. obs_reset_video (REQUIRES graphics_module)
5. obs_reset_audio
6. obs_load_all_modules

### Mistake 7: Not Setting last_error_
**Symptom**: "Failed to initialize" with no details
**Fix**: Always set last_error_ before returning false:
```cpp
if (!success) {
    last_error_ = "Specific error message";
    return false;
}
```

## Decision Tree

```
Starting task
    |
    v
Run verify-env.ps1
    |
    v
Fails? --> STOP, ask user to run build.ps1 -Setup
    |
    v
Read PROGRESS.md for current phase and task
    |
    v
Check if similar component exists
    |
    v
Study existing component pattern
    |
    v
Create header (.h)
    |
    v
Add to CMakeLists.txt
    |
    v
Implement .cpp
    |
    v
Build (./build.ps1)
    |
    v
Errors? --> Fix and rebuild
    |
    v
Update main.cpp integration
    |
    v
Build again
    |
    v
Test (run executable)
    |
    v
Check log for errors
    |
    v
Errors? --> Debug and fix
    |
    v
Update PROGRESS.md
    |
    v
DONE - Report success
```

## Verification Commands

### Build Verification
```powershell
# Must compile without errors
.\build.ps1

# Check executable exists
Test-Path .\bin\ClipVault.exe  # Should be True
```

### Runtime Verification
```powershell
# Run app
.\bin\ClipVault.exe

# Check log in another terminal
Get-Content .\bin\clipvault.log -Wait -Tail 20

# Look for:
# - [INFO] messages
# - No [ERROR] messages
# - "Component initialized successfully"
```

### LSP Verification
```powershell
# Check compile_commands.json exists
Test-Path build/compile_commands.json

# Check clangd can see includes
Get-Content build/compile_commands.json | Select-String "obs.h"
```

## Emergency: When Things Go Wrong

### Build Fails
```powershell
# Clean and rebuild
.\build.ps1 -Clean
.\build.ps1

# Check CMakeLists.txt syntax
```

### App Crashes on Start
```powershell
# Check log for last error
tail -50 .\bin\clipvault.log

# Common causes:
# - Missing OBS DLLs
# - Wrong initialization order
# - Null pointer dereference
```

### LSP Not Working
```powershell
# 1. Check clangd installed
clangd --version

# 2. Regenerate compile commands
Remove-Item -Recurse build
.\build.ps1

# 3. Restart VS Code/Cursor
```

## Files That Must Exist for Agents

Before claiming "environment ready", verify:

```powershell
$required = @(
    ".clangd",
    "CMakeLists.txt",
    "CMakePresets.json",
    "AGENTS.md",
    "PLAN.md",
    "src/main.cpp",
    "src/logger.cpp",
    "src/config.cpp",
    "src/obs_core.cpp",
    "src/capture.cpp",
    "src/encoder.cpp",
    "src/tray.cpp",
    "build/compile_commands.json"
)

foreach ($file in $required) {
    if (Test-Path $file) {
        Write-Host "✓ $file" -ForegroundColor Green
    } else {
        Write-Host "✗ $file MISSING" -ForegroundColor Red
    }
}
```

## Final Checklist Before Submitting Work

- [ ] Code compiles without warnings
- [ ] Added new files to CMakeLists.txt
- [ ] Integrated into main.cpp
- [ ] Tested by running .\bin\ClipVault.exe
- [ ] Checked .\bin\clipvault.log for errors
- [ ] Updated PROGRESS.md with completion status
- [ ] Followed naming conventions from AGENTS.md
- [ ] No TODO comments left in code
- [ ] All OBS objects properly released

## Remember

**The user tests, not reviews code.**

Your code must:
1. Compile on first try
2. Run without crashing
3. Show success messages in log
4. Follow all patterns from existing code

When in doubt, copy the pattern from `src/logger.cpp` - it's the simplest correct implementation.
