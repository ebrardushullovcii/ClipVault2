# Code Conventions

This document defines coding standards for ClipVault. Follow these to maintain consistency.

## Language

- **C++17** standard
- Windows-only (no cross-platform abstractions needed)

## File Organization

### Naming
- Source files: `snake_case.cpp`, `snake_case.h`
- Classes: `PascalCase`
- Functions: `snake_case`
- Variables: `snake_case`
- Constants: `SCREAMING_SNAKE_CASE`
- Private members: `snake_case_` (trailing underscore)

### Structure
```
src/
├── main.cpp              # Entry point only
├── component.h           # Header with class declaration
├── component.cpp         # Implementation
└── types.h               # Shared type definitions
```

### Header Format
```cpp
#pragma once

// System includes
#include <string>
#include <vector>

// Third-party includes
#include <obs.h>

// Project includes
#include "types.h"

namespace clipvault {

class ClassName {
public:
    // Constructors/destructor
    ClassName();
    ~ClassName();

    // Public methods
    bool initialize();
    void shutdown();

private:
    // Private methods
    bool do_internal_thing();

    // Private members (trailing underscore)
    bool initialized_;
    std::string name_;
};

} // namespace clipvault
```

## Code Style

### Braces
```cpp
// Functions: brace on new line
void function()
{
    // ...
}

// Control structures: brace on same line
if (condition) {
    // ...
} else {
    // ...
}

for (int i = 0; i < count; i++) {
    // ...
}
```

### Indentation
- 4 spaces (no tabs)
- Continuation indent: 4 spaces

### Line Length
- Soft limit: 100 characters
- Hard limit: 120 characters

### Includes
Order:
1. Corresponding header (for .cpp files)
2. System headers (`<iostream>`, `<windows.h>`)
3. Third-party headers (`<obs.h>`)
4. Project headers (`"config.h"`)

Separate groups with blank line:
```cpp
#include "my_class.h"

#include <string>
#include <vector>

#include <windows.h>

#include <obs.h>

#include "config.h"
#include "logger.h"
```

## Patterns

### RAII for OBS Objects
```cpp
class ObsSourceWrapper {
public:
    ObsSourceWrapper(obs_source_t* source) : source_(source) {}
    ~ObsSourceWrapper() {
        if (source_) {
            obs_source_release(source_);
        }
    }

    obs_source_t* get() { return source_; }

private:
    obs_source_t* source_;
};
```

### Error Handling
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
    if (!precondition1) {
        LOG_ERROR("Precondition 1 failed");
        return false;
    }

    if (!precondition2) {
        LOG_ERROR("Precondition 2 failed");
        return false;
    }

    // Main logic here
    return true;
}
```

### Logging
```cpp
// Use the LOG macros
LOG_INFO("Starting component");
LOG_WARNING("Non-fatal issue: " << details);
LOG_ERROR("Fatal error: " << error_code);
LOG_DEBUG("Debug info: " << value);  // Only in debug builds
```

### Configuration Access
```cpp
// Get config through singleton
auto& config = Config::instance();
int buffer_seconds = config.get_buffer_seconds();
```

## Documentation

### When to Comment
- Non-obvious logic
- Workarounds for bugs/limitations
- libobs quirks (there are many)

### When NOT to Comment
- Self-explanatory code
- Obvious getters/setters
- Restating what the code does

### Good Comment Examples
```cpp
// libobs requires trailing slash on data paths - it concatenates directly
obs_add_data_path("./data/libobs/");

// NVENC CQP 20 gives ~15Mbps at 1080p60, good quality/size balance
obs_data_set_int(settings, "cqp", 20);

// Must be called AFTER obs_reset_video or encoders won't initialize
obs_load_all_modules();
```

## OBS-Specific Conventions

### Reference Counting
Always release OBS objects:
```cpp
obs_data_t* settings = obs_data_create();
// ... use settings ...
obs_data_release(settings);  // ALWAYS
```

### Null Checks
Always check OBS function returns:
```cpp
obs_source_t* source = obs_source_create(...);
if (!source) {
    LOG_ERROR("Failed to create source");
    return false;
}
```

### Settings Pattern
```cpp
obs_data_t* settings = obs_data_create();
obs_data_set_int(settings, "key", value);
obs_data_set_string(settings, "key", "value");

obs_source_t* source = obs_source_create(type, name, settings, nullptr);
obs_data_release(settings);  // Release AFTER creating object

// ... use source ...
obs_source_release(source);  // Release when done
```

## Git Conventions

### Commits
- Use present tense: "Add feature" not "Added feature"
- Keep subject under 50 characters
- Reference phase/step if applicable: "Phase 1.3: Add capture sources"

### Branches
- `main` - stable, working code
- `dev` - development work
- `feature/name` - specific features
- `fix/name` - bug fixes

## Don't Do These

- Don't use `using namespace std;`
- Don't use raw `new`/`delete` (use smart pointers or RAII)
- Don't ignore return values from OBS functions
- Don't forget to release OBS objects
- Don't add TODO comments (fix it or ask the user)
- Don't add empty catch blocks
- Don't use magic numbers without explanation
