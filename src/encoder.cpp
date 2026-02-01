#include "encoder.h"
#include "logger.h"
#include "config.h"
#include "obs_core.h"

#include <cstring>  // For strcmp

namespace clipvault {

// NVENC encoder IDs to try in order
// Multiple IDs for compatibility with different NVIDIA driver/GPU combinations
static const char* nvenc_ids[] = {
    "jim_nvenc",        // Modern NVENC via obs-nvenc.dll (OBS 28+, RTX 2000+)
    "ffmpeg_nvenc",     // FFmpeg-based NVENC (fallback)
    "h264_nvenc"        // Generic H.264 NVENC (legacy)
};

static const char* nvenc_names[] = {
    "NVENC H.264 (jim_nvenc)",
    "NVENC H.264 (ffmpeg)",
    "NVENC H.264 (legacy)"
};

static const size_t nvenc_count = sizeof(nvenc_ids) / sizeof(nvenc_ids[0]);

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
    LOG_INFO("    Quality setting (CQP/CRF): " + std::to_string(video_cfg.quality));

    // Try multiple NVENC encoder IDs in order of preference
    // This ensures hardware encoding works on various NVIDIA GPU generations
    bool nvenc_created = false;

    // Try each NVENC encoder ID
    for (size_t i = 0; i < nvenc_count; ++i) {
        LOG_INFO("    Trying " + std::string(nvenc_ids[i]) + "...");

        // Create fresh settings for each encoder attempt
        obs_data_t* settings = obs_api::data_create();
        
        // Configure encoder with settings appropriate for each encoder type
        const char* encoder_id = nvenc_ids[i];
        
        if (strcmp(encoder_id, "jim_nvenc") == 0) {
            // jim_nvenc (obs-nvenc.dll) - modern NVENC with new API
            // CRITICAL: jim_nvenc uses p1-p7 presets (not old "quality"/"performance" strings)
            // CRITICAL: multipass must be "disabled" for CQP mode (incompatible!)
            obs_api::data_set_string(settings, "rate_control", "CQP");
            obs_api::data_set_int(settings, "cqp", video_cfg.quality);
            obs_api::data_set_string(settings, "preset", "p5");  // p1=fastest, p5=quality, p7=best quality
            obs_api::data_set_string(settings, "tune", "hq");    // high quality
            obs_api::data_set_string(settings, "multipass", "disabled");  // REQUIRED for CQP!
            obs_api::data_set_int(settings, "bf", 2);            // B-frames for better compression
            obs_api::data_set_string(settings, "profile", "high");
        } else if (strcmp(encoder_id, "ffmpeg_nvenc") == 0) {
            // ffmpeg_nvenc (obs-ffmpeg.dll) - FFmpeg-based NVENC
            // Uses standard FFmpeg NVENC settings
            obs_api::data_set_string(settings, "rate_control", "CQ");  // FFmpeg uses CQ not CQP
            obs_api::data_set_int(settings, "cq", video_cfg.quality);
            obs_api::data_set_string(settings, "preset", "hq");  // hq, hp, or default
            obs_api::data_set_string(settings, "profile", "high");
            obs_api::data_set_int(settings, "bf", 2);
        } else {
            // h264_nvenc and other legacy encoders
            // Use basic settings that should work with most NVENC implementations
            obs_api::data_set_string(settings, "rate_control", "CQP");
            obs_api::data_set_int(settings, "cqp", video_cfg.quality);
            obs_api::data_set_string(settings, "preset", "hq");
            obs_api::data_set_string(settings, "profile", "high");
        }

        video_encoder_ = obs_api::video_encoder_create(nvenc_ids[i], "video_encoder", settings, nullptr);
        obs_api::data_release(settings);

        if (video_encoder_) {
            encoder_name_ = nvenc_names[i];
            current_nvenc_index_ = static_cast<int>(i);
            LOG_INFO("    SUCCESS: Using " + std::string(nvenc_ids[i]) + " with CQP=" + std::to_string(video_cfg.quality));
            nvenc_created = true;
            break;
        } else {
            LOG_WARNING("    Failed to create " + std::string(nvenc_ids[i]));
        }
    }

    // Fallback to x264 if no NVENC encoder worked
    if (!nvenc_created) {
        LOG_INFO("    All NVENC variants failed, falling back to x264 (CPU encoding)...");
        obs_data_t* settings = obs_api::data_create();
        obs_api::data_set_string(settings, "rate_control", "CRF");
        obs_api::data_set_int(settings, "crf", video_cfg.quality);
        obs_api::data_set_string(settings, "preset", "veryfast");
        video_encoder_ = obs_api::video_encoder_create("obs_x264", "video_encoder", settings, nullptr);
        obs_api::data_release(settings);

        if (video_encoder_) {
            encoder_name_ = "x264 (Software)";
            LOG_INFO("    x264 encoder created successfully with CRF=" + std::to_string(video_cfg.quality));
        }
    }

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

bool EncoderManager::fallback_to_x264()
{
    if (!initialized_ || !video_encoder_) {
        return false;
    }

    // Check if already using x264
    if (encoder_name_.find("x264") != std::string::npos) {
        LOG_INFO("  Already using x264, no fallback needed");
        return false;
    }

    LOG_INFO("  Switching video encoder from NVENC/ffmpeg_nvenc to x264...");

    // Release the current video encoder
    obs_api::encoder_release(video_encoder_);
    video_encoder_ = nullptr;

    // Create x264 encoder
    const auto& video_cfg = ConfigManager::instance().video();
    obs_data_t* settings = obs_api::data_create();
    // x264 uses CRF instead of CQP
    obs_api::data_set_string(settings, "rate_control", "CRF");
    obs_api::data_set_int(settings, "crf", video_cfg.quality);
    obs_api::data_set_string(settings, "preset", "veryfast");

    video_encoder_ = obs_api::video_encoder_create("obs_x264", "video_encoder", settings, nullptr);
    obs_api::data_release(settings);

    if (!video_encoder_) {
        last_error_ = "Failed to create x264 fallback encoder";
        LOG_ERROR(last_error_);
        return false;
    }

    obs_api::encoder_set_video(video_encoder_, obs_api::get_video());
    encoder_name_ = "x264 (Software - Fallback)";
    LOG_INFO("    Switched to x264 encoder with CRF=" + std::to_string(video_cfg.quality));

    return true;
}

bool EncoderManager::try_next_nvenc_encoder()
{
    if (!initialized_ || !video_encoder_) {
        return false;
    }

    // Check if we've exhausted all NVENC options
    if (current_nvenc_index_ < 0 || static_cast<size_t>(current_nvenc_index_) >= nvenc_count - 1) {
        LOG_INFO("  No more NVENC encoders to try");
        return false;
    }

    // Try the next NVENC encoder
    size_t next_index = static_cast<size_t>(current_nvenc_index_) + 1;
    LOG_INFO("  Current NVENC encoder failed at runtime, trying next: " + std::string(nvenc_ids[next_index]));

    // Release current encoder
    obs_api::encoder_release(video_encoder_);
    video_encoder_ = nullptr;

    const auto& video_cfg = ConfigManager::instance().video();

    // Try each remaining NVENC encoder
    for (size_t i = next_index; i < nvenc_count; ++i) {
        LOG_INFO("    Trying " + std::string(nvenc_ids[i]) + "...");

        obs_data_t* settings = obs_api::data_create();
        
        // Configure encoder with settings appropriate for each encoder type
        const char* encoder_id = nvenc_ids[i];
        
        if (strcmp(encoder_id, "jim_nvenc") == 0) {
            // jim_nvenc (obs-nvenc.dll) - modern NVENC with new API
            obs_api::data_set_string(settings, "rate_control", "CQP");
            obs_api::data_set_int(settings, "cqp", video_cfg.quality);
            obs_api::data_set_string(settings, "preset", "p5");
            obs_api::data_set_string(settings, "tune", "hq");
            obs_api::data_set_string(settings, "multipass", "disabled");
            obs_api::data_set_int(settings, "bf", 2);
            obs_api::data_set_string(settings, "profile", "high");
        } else if (strcmp(encoder_id, "ffmpeg_nvenc") == 0) {
            // ffmpeg_nvenc (obs-ffmpeg.dll) - FFmpeg-based NVENC
            obs_api::data_set_string(settings, "rate_control", "CQ");
            obs_api::data_set_int(settings, "cq", video_cfg.quality);
            obs_api::data_set_string(settings, "preset", "hq");
            obs_api::data_set_string(settings, "profile", "high");
            obs_api::data_set_int(settings, "bf", 2);
        } else {
            // h264_nvenc and other legacy encoders
            obs_api::data_set_string(settings, "rate_control", "CQP");
            obs_api::data_set_int(settings, "cqp", video_cfg.quality);
            obs_api::data_set_string(settings, "preset", "hq");
            obs_api::data_set_string(settings, "profile", "high");
        }

        video_encoder_ = obs_api::video_encoder_create(nvenc_ids[i], "video_encoder", settings, nullptr);
        obs_api::data_release(settings);

        if (video_encoder_) {
            encoder_name_ = nvenc_names[i];
            current_nvenc_index_ = static_cast<int>(i);
            obs_api::encoder_set_video(video_encoder_, obs_api::get_video());
            LOG_INFO("    SUCCESS: Switched to " + std::string(nvenc_ids[i]) + " with CQP=" + std::to_string(video_cfg.quality));
            return true;
        } else {
            LOG_WARNING("    Failed to create " + std::string(nvenc_ids[i]));
        }
    }

    LOG_INFO("  All NVENC encoders exhausted");
    return false;
}

bool EncoderManager::is_using_nvenc() const
{
    return encoder_name_.find("NVENC") != std::string::npos;
}

} // namespace clipvault
