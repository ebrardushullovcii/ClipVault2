#include "logger.h"
#include "config.h"
#include "tray.h"
#include "obs_core.h"
#include "capture.h"
#include "encoder.h"
#include "replay.h"
#include "hotkey.h"
#include "audio_devices.h"
#include "game_detector.h"

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <string>
#include <cstring>
#include <iostream>

// Command line flags
static bool g_background_mode = false;
static bool g_no_tray = false;
static HANDLE g_shutdown_event = nullptr;
static HANDLE g_single_instance_mutex = nullptr;

// Check for single instance
bool check_single_instance()
{
    // Try to create a named mutex
    g_single_instance_mutex = CreateMutexA(nullptr, TRUE, "ClipVaultSingleInstance");
    
    if (g_single_instance_mutex == nullptr) {
        // Failed to create mutex
        return false;
    }
    
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        // Another instance is already running
        CloseHandle(g_single_instance_mutex);
        g_single_instance_mutex = nullptr;
        return false;
    }
    
    return true;
}

void release_single_instance()
{
    if (g_single_instance_mutex) {
        ReleaseMutex(g_single_instance_mutex);
        CloseHandle(g_single_instance_mutex);
        g_single_instance_mutex = nullptr;
    }
}

// Parse command line arguments
void parse_arguments(LPSTR lpCmdLine)
{
    std::string cmdLine(lpCmdLine);
    
    if (cmdLine.find("--background") != std::string::npos ||
        cmdLine.find("--service") != std::string::npos) {
        g_background_mode = true;
        g_no_tray = true;
        LOG_INFO("Running in background/service mode");
    }
    
    if (cmdLine.find("--no-tray") != std::string::npos) {
        g_no_tray = true;
        LOG_INFO("Tray icon disabled");
    }
}


// Get the directory where the exe is located
std::string get_exe_directory()
{
    char path[MAX_PATH];
    GetModuleFileNameA(nullptr, path, MAX_PATH);

    std::string exe_path(path);
    size_t last_slash = exe_path.find_last_of("\\/");
    if (last_slash != std::string::npos) {
        return exe_path.substr(0, last_slash);
    }
    return ".";
}

// Create directory and all parent directories
bool create_directory_recursive(const std::string& path)
{
    // Use SHCreateDirectoryExA which creates parent dirs automatically
    int result = SHCreateDirectoryExA(nullptr, path.c_str(), nullptr);
    return result == ERROR_SUCCESS || result == ERROR_ALREADY_EXISTS;
}

// Handle menu selections from tray
void on_menu_action(int menu_id)
{
    switch (menu_id) {
        case clipvault::SystemTray::MENU_OPEN_FOLDER: {
            const std::string& clips_path = clipvault::ConfigManager::instance().output_path();

            // Create clips folder if it doesn't exist
            create_directory_recursive(clips_path);

            LOG_INFO("Opening clips folder: " + clips_path);
            ShellExecuteA(nullptr, "open", clips_path.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
            break;
        }

        case clipvault::SystemTray::MENU_EXIT:
            LOG_INFO("Exit requested from menu");
            clipvault::SystemTray::instance().quit();
            break;
    }
}

// Background mode message loop
int run_background_mode()
{
    LOG_INFO("Running in background mode - no tray, hotkey active");
    
    // Create event for shutdown signaling
    g_shutdown_event = CreateEventA(nullptr, TRUE, FALSE, "ClipVaultShutdown");
    
    MSG msg;
    bool running = true;
    
    while (running) {
        // Check for shutdown event (from parent process)
        if (WaitForSingleObject(g_shutdown_event, 0) == WAIT_OBJECT_0) {
            LOG_INFO("Shutdown event received");
            running = false;
            break;
        }
        
        // Process Windows messages (needed for hotkey)
        while (PeekMessageA(&msg, nullptr, 0, 0, PM_REMOVE)) {
            if (msg.message == WM_QUIT) {
                running = false;
                break;
            }
            TranslateMessage(&msg);
            DispatchMessageA(&msg);
        }
        
        // Sleep to prevent busy-waiting
        Sleep(100);
    }
    
    if (g_shutdown_event) {
        CloseHandle(g_shutdown_event);
        g_shutdown_event = nullptr;
    }
    
    return 0;
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow)
{
    (void)hPrevInstance;
    (void)nCmdShow;

    // Get exe directory for relative paths
    std::string exe_dir = get_exe_directory();

    // Initialize logger
    std::string log_path = exe_dir + "\\clipvault.log";
    if (!clipvault::Logger::instance().initialize(log_path)) {
        MessageBoxA(nullptr, "Failed to initialize logger", "ClipVault Error", MB_OK | MB_ICONERROR);
        return 1;
    }

    // Parse command line arguments
    parse_arguments(lpCmdLine);

    // Handle --list-audio-devices flag (used by UI to enumerate devices)
    std::string cmdLineStr(lpCmdLine);
    if (cmdLineStr.find("--list-audio-devices") != std::string::npos) {
        auto output_devices = clipvault::get_output_devices();
        auto input_devices = clipvault::get_input_devices();

        std::cout << "[";

        bool first = true;
        for (const auto& dev : output_devices) {
            if (!first) std::cout << ",";
            first = false;
            std::cout << "{\"id\":\"" << clipvault::escape_json_string(dev.id) << "\",\"name\":\"" << clipvault::escape_json_string(dev.name) << "\",\"type\":\"output\",\"is_default\":" << (dev.is_default ? "true" : "false") << "}";
        }

        for (const auto& dev : input_devices) {
            if (!first) std::cout << ",";
            first = false;
            std::cout << "{\"id\":\"" << clipvault::escape_json_string(dev.id) << "\",\"name\":\"" << clipvault::escape_json_string(dev.name) << "\",\"type\":\"input\",\"is_default\":" << (dev.is_default ? "true" : "false") << "}";
        }

        std::cout << "]";
        return 0;
    }

    // Check single instance (prevent multiple backends)
    if (!check_single_instance()) {
        LOG_INFO("Another instance of ClipVault is already running. Exiting.");
        clipvault::Logger::instance().shutdown();
        return 0;
    }
    LOG_INFO("Single instance lock acquired");

    LOG_INFO("===========================================");
    LOG_INFO("ClipVault v0.1.0 Starting");
    LOG_INFO("===========================================");
    LOG_INFO("Executable directory: " + exe_dir);
    LOG_INFO("Log file: " + log_path);
    LOG_INFO("Background mode: " + std::string(g_background_mode ? "yes" : "no"));
    LOG_INFO("No tray: " + std::string(g_no_tray ? "yes" : "no"));

    // Load configuration from standard AppData location
    // This ensures both backend and UI use the same config file
    char appdata_path[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathA(nullptr, CSIDL_APPDATA, nullptr, 0, appdata_path))) {
        std::string config_dir = std::string(appdata_path) + "\\ClipVault";
        std::string config_path = config_dir + "\\settings.json";
        
        // Create config directory if it doesn't exist
        CreateDirectoryA(config_dir.c_str(), nullptr);
        
        bool config_loaded = clipvault::ConfigManager::instance().load(config_path);
        
        if (config_loaded) {
            LOG_INFO("Configuration loaded from: " + config_path);
        } else {
            LOG_WARNING("No config found at: " + config_path + ", using defaults");
            // Save default config for next time
            clipvault::ConfigManager::instance().save(config_path);
            LOG_INFO("Default config saved to: " + config_path);
        }
    } else {
        LOG_ERROR("Failed to get AppData path, using default configuration");
    }

    // Create output directory
    create_directory_recursive(clipvault::ConfigManager::instance().output_path());

    // Initialize OBS
    auto& obs = clipvault::OBSCore::instance();
    if (!obs.initialize(exe_dir)) {
        LOG_ERROR("Failed to initialize OBS: " + obs.last_error());
        if (!g_background_mode) {
            MessageBoxA(nullptr, ("Failed to initialize OBS:\n" + obs.last_error()).c_str(),
                        "ClipVault Error", MB_OK | MB_ICONERROR);
        }
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    // Initialize capture sources
    auto& capture = clipvault::CaptureManager::instance();
    if (!capture.initialize()) {
        LOG_ERROR("Failed to initialize capture: " + capture.last_error());
        if (!g_background_mode) {
            MessageBoxA(nullptr, ("Failed to initialize capture:\n" + capture.last_error()).c_str(),
                        "ClipVault Error", MB_OK | MB_ICONERROR);
        }
        obs.shutdown();
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    // Initialize encoders
    auto& encoder = clipvault::EncoderManager::instance();
    if (!encoder.initialize()) {
        LOG_ERROR("Failed to initialize encoders: " + encoder.last_error());
        if (!g_background_mode) {
            MessageBoxA(nullptr, ("Failed to initialize encoders:\n" + encoder.last_error()).c_str(),
                        "ClipVault Error", MB_OK | MB_ICONERROR);
        }
        capture.shutdown();
        obs.shutdown();
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    // Initialize and start replay buffer
    auto& replay = clipvault::ReplayManager::instance();
    if (!replay.initialize()) {
        LOG_ERROR("Failed to initialize replay buffer: " + replay.last_error());
        if (!g_background_mode) {
            MessageBoxA(nullptr, ("Failed to initialize replay buffer:\n" + replay.last_error()).c_str(),
                        "ClipVault Error", MB_OK | MB_ICONERROR);
        }
        encoder.shutdown();
        capture.shutdown();
        obs.shutdown();
        clipvault::Logger::instance().shutdown();
        return 1;
    }
    
    // Initialize game detector (loads game database)
    auto& game_detector = clipvault::GameDetector::instance();
    if (!game_detector.initialize()) {
        LOG_WARNING("Failed to initialize game detector - game detection will be limited");
    } else {
        LOG_INFO("Game detector initialized successfully");
    }

    // Start the replay buffer
    if (!replay.start()) {
        LOG_ERROR("Failed to start replay buffer: " + replay.last_error());
        if (!g_background_mode) {
            MessageBoxA(nullptr, ("Failed to start replay buffer:\n" + replay.last_error()).c_str(),
                        "ClipVault Error", MB_OK | MB_ICONERROR);
        }
        replay.shutdown();
        encoder.shutdown();
        capture.shutdown();
        obs.shutdown();
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    int result = 0;

    if (!g_no_tray && !g_background_mode) {
        // Initialize system tray (also initializes hotkey manager with tray window handle)
        auto& tray = clipvault::SystemTray::instance();
        if (!tray.initialize(hInstance)) {
            LOG_ERROR("Failed to initialize system tray");
            if (!g_background_mode) {
                MessageBoxA(nullptr, "Failed to initialize system tray", "ClipVault Error", MB_OK | MB_ICONERROR);
            }
            clipvault::Logger::instance().shutdown();
            return 1;
        }

        // Set menu callback
        tray.set_menu_callback(on_menu_action);

        // Set callback to open UI when "Open" is clicked or tray icon is clicked
        const auto& launcher_config = clipvault::ConfigManager::instance().launcher();
        if (!launcher_config.ui_path.empty()) {
            tray.set_open_ui_callback([ui_path = launcher_config.ui_path]() {
                LOG_INFO("Opening UI: " + ui_path);
                ShellExecuteA(nullptr, "open", ui_path.c_str(), nullptr, nullptr, SW_SHOW);
            });
        } else {
            // Try to find UI relative to backend
            // Backend is at: resources/bin/ClipVault.exe
            // UI is at: ClipVault.exe (same level as resources/)
            std::string ui_exe = exe_dir + "\\..\\..\\ClipVault.exe";
            LOG_INFO("Looking for UI at: " + ui_exe);
            tray.set_open_ui_callback([ui_exe]() {
                LOG_INFO("Opening UI: " + ui_exe);
                ShellExecuteA(nullptr, "open", ui_exe.c_str(), nullptr, nullptr, SW_SHOW);
            });
        }

        // Setup hotkey callback to trigger save
        auto& hotkey = clipvault::HotkeyManager::instance();
        hotkey.set_callback([&replay]() {
            LOG_INFO("Hotkey callback executing - triggering save...");
            
            // Detect game from foreground window
            std::string detected_game = clipvault::GameDetector::instance().detect_game_from_foreground();
            if (!detected_game.empty()) {
                LOG_INFO("Game detected: " + detected_game);
            } else {
                LOG_INFO("No game detected in foreground window");
            }
            
            // Set game for this save operation
            replay.set_current_game(detected_game);
            
            if (!replay.save_clip()) {
                LOG_ERROR("Failed to save clip: " + replay.last_error());
            }
        });
        LOG_INFO("Hotkey registered - ready to save clips");

        // Set callback for when clip is saved
        replay.set_save_callback([](const std::string& path, bool success) {
            if (success) {
                clipvault::SystemTray::instance().show_notification("Clip Saved", "Saved to: " + path);
            } else {
                clipvault::SystemTray::instance().show_notification("Save Failed", "Could not save clip");
            }
        });

        // Show startup notification
        tray.show_notification("ClipVault", "Running in system tray. Right-click for options.");

        LOG_INFO("ClipVault is now running in the system tray");
        LOG_INFO("Right-click the tray icon for options");

        // Run message loop (blocks until quit)
        result = tray.run();

        // Cleanup tray
        tray.shutdown();
    } else {
        // No-tray mode (background/service) - still need hotkeys
        auto& hotkey = clipvault::HotkeyManager::instance();
        const auto& hotkey_config = clipvault::ConfigManager::instance().hotkey();
        if (!hotkey.initialize(hotkey_config.save_clip, nullptr)) {
            LOG_ERROR("Failed to initialize hotkey manager in background mode");
        } else {
            hotkey.set_callback([&replay]() {
                LOG_INFO("Hotkey callback executing - triggering save...");
                
                // Detect game from foreground window
                std::string detected_game = clipvault::GameDetector::instance().detect_game_from_foreground();
                if (!detected_game.empty()) {
                    LOG_INFO("Game detected: " + detected_game);
                } else {
                    LOG_INFO("No game detected in foreground window");
                }
                
                // Set game for this save operation
                replay.set_current_game(detected_game);
                
                if (!replay.save_clip()) {
                    LOG_ERROR("Failed to save clip: " + replay.last_error());
                }
            });
            LOG_INFO("Hotkey registered in background mode");
        }

        // Set callback for when clip is saved (log only, no UI)
        replay.set_save_callback([](const std::string& path, bool success) {
            if (success) {
                LOG_INFO("Clip saved to: " + path);
            } else {
                LOG_ERROR("Failed to save clip");
            }
        });

        LOG_INFO("ClipVault backend running in background mode");
        
        // Run background message loop
        result = run_background_mode();
        
        // Cleanup hotkey
        hotkey.shutdown();
    }

    // Cleanup
    LOG_INFO("Shutting down...");
    replay.shutdown();
    encoder.shutdown();
    capture.shutdown();
    obs.shutdown();

    LOG_INFO("===========================================");
    LOG_INFO("ClipVault shutdown complete");
    LOG_INFO("===========================================");

    // Release single instance lock
    release_single_instance();

    clipvault::Logger::instance().shutdown();

    return result;
}
