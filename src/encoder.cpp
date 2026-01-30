#include "encoder.h"
#include "logger.h"
#include "config.h"
#include "obs_core.h"

namespace clipvault {

EncoderManager& EncoderManager::instance()
{
    static EncoderManager instance;
    return instance;
}

EncoderManager::~EncoderManager()
{
    shutdown();
}

bool EncoderManager::initialize()
{
    if (initialized_) {
        LOG_WARNING("Encoder already initialized");
        return true;
    }

    LOG_INFO("Initializing encoders...");

    if (!create_video_encoder()) {
        return false;
    }

    if (!create_audio_encoders()) {
        if (video_encoder_) {
            obs_api::encoder_release(video_encoder_);
            video_encoder_ = nullptr;
        }
        return false;
    }

    initialized_ = true;
    LOG_INFO("Encoders initialized successfully!");
    return true;
}

void EncoderManager::shutdown()
{
    if (!initialized_) {
        return;
    }

    LOG_INFO("Shutting down encoders...");

    if (audio_encoder_2_) {
        obs_api::encoder_release(audio_encoder_2_);
        audio_encoder_2_ = nullptr;
    }

    if (audio_encoder_1_) {
        obs_api::encoder_release(audio_encoder_1_);
        audio_encoder_1_ = nullptr;
    }

    if (video_encoder_) {
        obs_api::encoder_release(video_encoder_);
        video_encoder_ = nullptr;
    }

    initialized_ = false;
    LOG_INFO("Encoders shutdown complete");
}

bool EncoderManager::create_video_encoder()
{
    const auto& video_cfg = ConfigManager::instance().video();

    LOG_INFO("  Creating video encoder...");

    obs_data_t* settings = obs_api::data_create();

    // Configure encoder settings
    obs_api::data_set_string(settings, "rate_control", "CQP");
    obs_api::data_set_int(settings, "cqp", video_cfg.quality);

    // Try NVENC first (NVIDIA hardware encoding)
    LOG_INFO("    Trying NVENC (jim_nvenc)...");
    video_encoder_ = obs_api::video_encoder_create("jim_nvenc", "video_encoder", settings, nullptr);

    if (video_encoder_) {
        encoder_name_ = "NVENC (Hardware)";
        LOG_INFO("    NVENC encoder created successfully");
    } else {
        // Fallback to x264 (CPU encoding)
        LOG_INFO("    NVENC not available, trying x264...");
        obs_api::data_set_string(settings, "preset", "veryfast");
        video_encoder_ = obs_api::video_encoder_create("obs_x264", "video_encoder", settings, nullptr);

        if (video_encoder_) {
            encoder_name_ = "x264 (Software)";
            LOG_INFO("    x264 encoder created successfully");
        }
    }

    obs_api::data_release(settings);

    if (!video_encoder_) {
        last_error_ = "Failed to create video encoder (neither NVENC nor x264 available)";
        LOG_ERROR(last_error_);
        return false;
    }

    // Connect encoder to video output
    obs_api::encoder_set_video(video_encoder_, obs_api::get_video());
    LOG_INFO("    Video encoder: " + encoder_name_);

    return true;
}

bool EncoderManager::create_audio_encoders()
{
    const auto& audio_cfg = ConfigManager::instance().audio();

    LOG_INFO("  Creating audio encoders...");

    obs_data_t* settings = obs_api::data_create();
    obs_api::data_set_int(settings, "bitrate", audio_cfg.bitrate);

    // Track 1: Desktop audio (mixer index 0)
    LOG_INFO("    Creating AAC encoder for Track 1 (Desktop Audio)...");
    audio_encoder_1_ = obs_api::audio_encoder_create("ffmpeg_aac", "aac_track1", settings, 0, nullptr);

    if (!audio_encoder_1_) {
        obs_api::data_release(settings);
        last_error_ = "Failed to create audio encoder for track 1";
        LOG_ERROR(last_error_);
        return false;
    }
    obs_api::encoder_set_audio(audio_encoder_1_, obs_api::get_audio());
    LOG_INFO("      Track 1 AAC encoder created");

    // Track 2: Microphone (mixer index 1)
    LOG_INFO("    Creating AAC encoder for Track 2 (Microphone)...");
    audio_encoder_2_ = obs_api::audio_encoder_create("ffmpeg_aac", "aac_track2", settings, 1, nullptr);

    if (!audio_encoder_2_) {
        obs_api::data_release(settings);
        obs_api::encoder_release(audio_encoder_1_);
        audio_encoder_1_ = nullptr;
        last_error_ = "Failed to create audio encoder for track 2";
        LOG_ERROR(last_error_);
        return false;
    }
    obs_api::encoder_set_audio(audio_encoder_2_, obs_api::get_audio());
    LOG_INFO("      Track 2 AAC encoder created");

    obs_api::data_release(settings);

    LOG_INFO("    Audio encoders: AAC @ " + std::to_string(audio_cfg.bitrate) + "kbps");
    return true;
}

} // namespace clipvault
