#pragma once

#include <string>

// Forward declarations for OBS types
struct obs_source;
typedef struct obs_source obs_source_t;

namespace clipvault {

class CaptureManager {
public:
    static CaptureManager& instance();

    // Initialize capture sources
    bool initialize();

    // Shutdown and release sources
    void shutdown();

    // Check if initialized
    bool is_initialized() const { return initialized_; }

    // Get sources (for encoder/output setup)
    obs_source_t* get_video_source() const { return video_source_; }
    obs_source_t* get_desktop_audio() const { return desktop_audio_; }
    obs_source_t* get_microphone() const { return microphone_; }

    // Get last error
    const std::string& last_error() const { return last_error_; }

private:
    CaptureManager() = default;
    ~CaptureManager();

    CaptureManager(const CaptureManager&) = delete;
    CaptureManager& operator=(const CaptureManager&) = delete;

    bool create_video_source();
    bool create_audio_sources();

    obs_source_t* video_source_ = nullptr;
    obs_source_t* desktop_audio_ = nullptr;
    obs_source_t* microphone_ = nullptr;

    bool initialized_ = false;
    std::string last_error_;
};

} // namespace clipvault
