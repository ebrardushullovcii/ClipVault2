#pragma once

#include <string>

/**
 * Holds video encoding and capture settings.
 *
 * Contains resolution, frame rate, encoder selection, quality level, and monitor index.
 */

/**
 * Holds audio capture and encoding settings.
 *
 * Includes sample rate, bitrate, enable flags for system audio and microphone, and device IDs
 * for system audio and microphone.
 */

/**
 * Holds hotkey mappings.
 *
 * Contains key bindings used by the application (e.g., save clip).
 */

/**
 * Holds user interface preferences.
 *
 * Controls notification visibility, tray minimization behavior, and startup with Windows.
 */

/**
 * Holds launcher and initialization preferences.
 *
 * Controls backend autostart, backend mode, single-instance enforcement, and UI path override.
 */

/**
 * Aggregates all application configuration sections and top-level settings.
 *
 * Contains output path, buffer duration, and nested video, audio, hotkey, UI, and launcher configs.
 */

/**
 * Manager for loading, saving, and accessing the global configuration.
 *
 * Provides a single globally accessible ConfigManager and convenience accessors for configuration sections.
 */

/**
 * Get the global ConfigManager singleton.
 *
 * @returns Reference to the global ConfigManager instance.
 */

/**
 * Load configuration from the specified file.
 *
 * @param filepath Path to the configuration file to load.
 * @returns `true` if the configuration was loaded successfully, `false` otherwise.
 */

/**
 * Save the current configuration to the specified file.
 *
 * @param filepath Path where the configuration will be written.
 * @returns `true` if the configuration was saved successfully, `false` otherwise.
 */
namespace clipvault {

struct VideoConfig {
    int width = 1920;
    int height = 1080;
    int fps = 60;
    std::string encoder = "auto";
    int quality = 20;
    int monitor = 0;
};

struct AudioConfig {
    int sample_rate = 48000;
    int bitrate = 160;
    bool system_audio_enabled = true;
    bool microphone_enabled = true;
    std::string system_audio_device_id = "default";
    std::string microphone_device_id = "default";
};

struct HotkeyConfig {
    std::string save_clip = "F9";
};

struct UIConfig {
    bool show_notifications = true;
    bool minimize_to_tray = true;
    bool start_with_windows = false;
};

struct LauncherConfig {
    bool autostart_backend = true;
    std::string backend_mode = "tray";
    bool single_instance = true;
    std::string ui_path = "";
};

struct Config {
    std::string output_path = "D:\\Clips\\ClipVault";
    int buffer_seconds = 120;
    VideoConfig video;
    AudioConfig audio;
    HotkeyConfig hotkey;
    UIConfig ui;
    LauncherConfig launcher;
};

class ConfigManager {
public:
    static ConfigManager& instance();

    bool load(const std::string& filepath);
    bool save(const std::string& filepath);

    const Config& get() const { return config_; }
    Config& get() { return config_; }

    // Convenience accessors
    const std::string& output_path() const { return config_.output_path; }
    int buffer_seconds() const { return config_.buffer_seconds; }
    const VideoConfig& video() const { return config_.video; }
    const AudioConfig& audio() const { return config_.audio; }
    const HotkeyConfig& hotkey() const { return config_.hotkey; }
    const UIConfig& ui() const { return config_.ui; }
    const LauncherConfig& launcher() const { return config_.launcher; }

private:
    ConfigManager() = default;
    Config config_;
};

} // namespace clipvault