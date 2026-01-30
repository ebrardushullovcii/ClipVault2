#include "logger.h"
#include "config.h"
#include "tray.h"
#include "obs_core.h"
#include "capture.h"
#include "encoder.h"
#include "replay.h"
#include "hotkey.h"

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <string>

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

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow)
{
    (void)hPrevInstance;
    (void)lpCmdLine;
    (void)nCmdShow;

    // Get exe directory for relative paths
    std::string exe_dir = get_exe_directory();

    // Initialize logger
    std::string log_path = exe_dir + "\\clipvault.log";
    if (!clipvault::Logger::instance().initialize(log_path)) {
        MessageBoxA(nullptr, "Failed to initialize logger", "ClipVault Error", MB_OK | MB_ICONERROR);
        return 1;
    }

    LOG_INFO("===========================================");
    LOG_INFO("ClipVault v0.1.0 Starting");
    LOG_INFO("===========================================");
    LOG_INFO("Executable directory: " + exe_dir);
    LOG_INFO("Log file: " + log_path);

    // Load configuration
    std::string config_path = exe_dir + "\\config\\settings.json";
    clipvault::ConfigManager::instance().load(config_path);

    // Create output directory
    create_directory_recursive(clipvault::ConfigManager::instance().output_path());

    // Initialize OBS
    auto& obs = clipvault::OBSCore::instance();
    if (!obs.initialize(exe_dir)) {
        LOG_ERROR("Failed to initialize OBS: " + obs.last_error());
        MessageBoxA(nullptr, ("Failed to initialize OBS:\n" + obs.last_error()).c_str(),
                    "ClipVault Error", MB_OK | MB_ICONERROR);
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    // Initialize capture sources
    auto& capture = clipvault::CaptureManager::instance();
    if (!capture.initialize()) {
        LOG_ERROR("Failed to initialize capture: " + capture.last_error());
        MessageBoxA(nullptr, ("Failed to initialize capture:\n" + capture.last_error()).c_str(),
                    "ClipVault Error", MB_OK | MB_ICONERROR);
        obs.shutdown();
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    // Initialize encoders
    auto& encoder = clipvault::EncoderManager::instance();
    if (!encoder.initialize()) {
        LOG_ERROR("Failed to initialize encoders: " + encoder.last_error());
        MessageBoxA(nullptr, ("Failed to initialize encoders:\n" + encoder.last_error()).c_str(),
                    "ClipVault Error", MB_OK | MB_ICONERROR);
        capture.shutdown();
        obs.shutdown();
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    // Initialize and start replay buffer
    auto& replay = clipvault::ReplayManager::instance();
    if (!replay.initialize()) {
        LOG_ERROR("Failed to initialize replay buffer: " + replay.last_error());
        MessageBoxA(nullptr, ("Failed to initialize replay buffer:\n" + replay.last_error()).c_str(),
                    "ClipVault Error", MB_OK | MB_ICONERROR);
        encoder.shutdown();
        capture.shutdown();
        obs.shutdown();
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    // Start the replay buffer
    if (!replay.start()) {
        LOG_ERROR("Failed to start replay buffer: " + replay.last_error());
        MessageBoxA(nullptr, ("Failed to start replay buffer:\n" + replay.last_error()).c_str(),
                    "ClipVault Error", MB_OK | MB_ICONERROR);
        replay.shutdown();
        encoder.shutdown();
        capture.shutdown();
        obs.shutdown();
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    // Initialize system tray (also initializes hotkey manager with tray window handle)
    auto& tray = clipvault::SystemTray::instance();
    if (!tray.initialize(hInstance)) {
        LOG_ERROR("Failed to initialize system tray");
        MessageBoxA(nullptr, "Failed to initialize system tray", "ClipVault Error", MB_OK | MB_ICONERROR);
        clipvault::Logger::instance().shutdown();
        return 1;
    }

    // Set menu callback
    tray.set_menu_callback(on_menu_action);

    // Setup hotkey callback to trigger save
    auto& hotkey = clipvault::HotkeyManager::instance();
    hotkey.set_callback([&replay]() {
        LOG_INFO("Hotkey callback executing - triggering save...");
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
    int result = tray.run();

    // Cleanup
    LOG_INFO("Shutting down...");
    tray.shutdown();
    replay.shutdown();
    encoder.shutdown();
    capture.shutdown();
    obs.shutdown();

    LOG_INFO("===========================================");
    LOG_INFO("ClipVault shutdown complete");
    LOG_INFO("===========================================");

    clipvault::Logger::instance().shutdown();

    return result;
}
