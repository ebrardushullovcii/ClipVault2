cmake_minimum_required(VERSION 3.20)
project(ClipVault VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Output to bin/
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/bin)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_DEBUG ${CMAKE_SOURCE_DIR}/bin)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_SOURCE_DIR}/bin)

# OBS paths
set(OBS_SRC_DIR ${CMAKE_SOURCE_DIR}/third_party/obs-studio-src)
set(OBS_BIN_DIR ${CMAKE_SOURCE_DIR}/bin)

# Source files
set(SOURCES
    src/main.cpp
    src/logger.cpp
    src/config.cpp
    src/tray.cpp
    src/hotkey.cpp
    src/obs_core.cpp
    src/capture.cpp
    src/encoder.cpp
    src/replay.cpp
)

# Create executable as Windows GUI app (no console window)
add_executable(ClipVault WIN32 ${SOURCES})

# Include directories
target_include_directories(ClipVault PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${OBS_SRC_DIR}/libobs
    ${OBS_SRC_DIR}/libobs/media-io
    ${OBS_SRC_DIR}/libobs/util
    ${OBS_SRC_DIR}/libobs/graphics
    ${OBS_SRC_DIR}/libobs/callback
)

# OBS linking - we'll use runtime loading instead of compile-time linking
# This avoids DLL loading issues at startup
# target_link_libraries(ClipVault PRIVATE ${OBS_BIN_DIR}/obs.dll)

# Windows libraries
target_link_libraries(ClipVault PRIVATE
    shlwapi
    shell32
    user32
)

# Static linking to avoid C++ runtime mismatch
set(CMAKE_EXE_LINKER_FLAGS "-static-libgcc -static-libstdc++")

# Windows defines
target_compile_definitions(ClipVault PRIVATE
    WIN32_LEAN_AND_MEAN
    NOMINMAX
    _CRT_SECURE_NO_WARNINGS
)

# Copy config files to bin
add_custom_command(TARGET ClipVault POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_SOURCE_DIR}/bin/config
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        ${CMAKE_SOURCE_DIR}/config/settings.json
        ${CMAKE_SOURCE_DIR}/bin/config/settings.json
    COMMENT "Copying config files"
)
