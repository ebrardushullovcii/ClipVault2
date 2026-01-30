#include "capture.h"
#include "logger.h"
#include "config.h"
#include "obs_core.h"

namespace clipvault {

CaptureManager& CaptureManager::instance()
{
    static CaptureManager instance;
    return instance;
}

CaptureManager::~CaptureManager()
{
    shutdown();
}

bool CaptureManager::initialize()
{
    if (initialized_) {
        LOG_WARNING("Capture already initialized");
        return true;
    }

    LOG_INFO("Initializing capture sources...");

    if (!create_video_source()) {
        return false;
    }

    if (!create_audio_sources()) {
        // Cleanup video source if audio fails
        if (video_source_) {
            obs_api::source_release(video_source_);
            video_source_ = nullptr;
        }
        return false;
    }

    initialized_ = true;
    LOG_INFO("Capture sources initialized successfully!");
    return true;
}

void CaptureManager::shutdown()
{
    if (!initialized_) {
        return;
    }

    LOG_INFO("Shutting down capture sources...");

    if (microphone_) {
        obs_api::source_release(microphone_);
        microphone_ = nullptr;
    }

    if (desktop_audio_) {
        obs_api::source_release(desktop_audio_);
        desktop_audio_ = nullptr;
    }

    if (video_source_) {
        obs_api::source_release(video_source_);
        video_source_ = nullptr;
    }

    initialized_ = false;
    LOG_INFO("Capture sources shutdown complete");
}

bool CaptureManager::create_video_source()
{
    LOG_INFO("  Creating monitor capture source...");

    // Create settings for monitor capture
    obs_data_t* settings = obs_api::data_create();
    obs_api::data_set_int(settings, "monitor", 0);  // Primary monitor
    obs_api::data_set_bool(settings, "capture_cursor", true);

    // Create the monitor capture source
    // "monitor_capture" is anti-cheat safe (doesn't hook games)
    video_source_ = obs_api::source_create("monitor_capture", "monitor_capture", settings, nullptr);
    obs_api::data_release(settings);

    if (!video_source_) {
        last_error_ = "Failed to create monitor capture source";
        LOG_ERROR(last_error_);
        return false;
    }

    // Add to the main output channel so it's rendered
    obs_api::set_output_source(0, video_source_);

    LOG_INFO("    Monitor capture source created");
    return true;
}

bool CaptureManager::create_audio_sources()
{
    const auto& audio_cfg = ConfigManager::instance().audio();

    // Create desktop audio (system audio - what you hear)
    if (audio_cfg.system_audio_enabled) {
        LOG_INFO("  Creating desktop audio capture...");

        obs_data_t* settings = obs_api::data_create();
        // Empty settings uses default device
        desktop_audio_ = obs_api::source_create("wasapi_output_capture", "desktop_audio", settings, nullptr);
        obs_api::data_release(settings);

        if (!desktop_audio_) {
            last_error_ = "Failed to create desktop audio source";
            LOG_ERROR(last_error_);
            return false;
        }

        // Route desktop audio to mixer track 1 (bit 0 = 0x01)
        obs_api::source_set_audio_mixers(desktop_audio_, 1);
        LOG_INFO("    Desktop audio -> Track 1");
    }

    // Create microphone capture
    if (audio_cfg.microphone_enabled) {
        LOG_INFO("  Creating microphone capture...");

        obs_data_t* settings = obs_api::data_create();
        // Empty settings uses default device
        microphone_ = obs_api::source_create("wasapi_input_capture", "microphone", settings, nullptr);
        obs_api::data_release(settings);

        if (!microphone_) {
            last_error_ = "Failed to create microphone source";
            LOG_ERROR(last_error_);
            return false;
        }

        // Route microphone to mixer track 2 (bit 1 = 0x02)
        obs_api::source_set_audio_mixers(microphone_, 2);
        LOG_INFO("    Microphone -> Track 2");
    }

    return true;
}

} // namespace clipvault
