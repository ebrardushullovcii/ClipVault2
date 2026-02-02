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

/**
 * @brief Map a numeric quality setting to encoder-specific parameters.
 *
 * @param quality Quality value from configuration (15 = highest quality, 30 = lowest quality).
 * @return QualityMapping Struct containing mapped values:
 *         - `cqp`: NVENC CQP/CQ value,
 *         - `crf`: x264 CRF value,
 *         - `nvenc_preset`: NVENC preset string,
 *         - `x264_preset`: x264 preset string.
 */
QualityMapping get_quality_mapping(int quality) {
    // quality comes from settings (15=ultra, 18=high, 23=medium, 30=low)
    if (quality <= 18) {
        // Ultra quality
        return {15, 18, "p7", "slow"};
    } else if (quality <= 21) {
        // High quality
        return {20, 21, "p5", "medium"};
    } else if (quality <= 25) {
        // Medium quality
        return {25, 23, "p3", "fast"};
    } else {
        // Low quality
        return {30, 28, "p1", "veryfast"};
    }
}

/**
 * @brief Provides access to the single global EncoderManager instance.
 *
 * The instance is created on first use and remains available for the lifetime of the program.
 *
 * @return EncoderManager& Reference to the shared EncoderManager singleton.
 */
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

/**
 * @brief Creates and configures the application's video encoder according to the current video configuration.
 *
 * Attempts to create the encoder specified by ConfigManager::instance().video().encoder:
 * - If set to "x264", creates a software x264 encoder with CRF and the mapped x264 preset.
 * - If set to "nvenc", attempts available NVENC variants in order using encoder-specific NVENC settings.
 * - If set to "auto" (default), tries NVENC variants first and falls back to x264 if all NVENC variants fail.
 *
 * On success the created encoder is stored in video_encoder_, encoder_name_ is set to the chosen encoder's display name,
 * and the encoder is connected to the video output. When an NVENC variant succeeds, current_nvenc_index_ is updated.
 * On failure last_error_ is set with a descriptive message.
 *
 * @returns `true` on success, `false` otherwise.
 */
bool EncoderManager::create_video_encoder()
{
    const auto& video_cfg = ConfigManager::instance().video();

    LOG_INFO("  Creating video encoder...");
    LOG_INFO("    Encoder setting: " + video_cfg.encoder);
    LOG_INFO("    Quality setting (raw): " + std::to_string(video_cfg.quality));

    // Get quality mapping for encoder-specific settings
    QualityMapping quality = get_quality_mapping(video_cfg.quality);
    LOG_INFO("    Quality mapping - CQP/CRF: " + std::to_string(quality.cqp) + "/" + std::to_string(quality.crf));
    LOG_INFO("    NVENC preset: " + std::string(quality.nvenc_preset) + ", x264 preset: " + std::string(quality.x264_preset));

    bool encoder_created = false;

    // Check encoder preference
    if (video_cfg.encoder == "x264") {
        // User explicitly wants x264 - ONLY create x264, don't try NVENC
        LOG_INFO("    Encoder set to x264 only...");
        
        obs_data_t* settings = obs_api::data_create();
        obs_api::data_set_string(settings, "rate_control", "CRF");
        obs_api::data_set_int(settings, "crf", quality.crf);
        obs_api::data_set_string(settings, "preset", quality.x264_preset);
        
        video_encoder_ = obs_api::video_encoder_create("obs_x264", "video_encoder", settings, nullptr);
        obs_api::data_release(settings);

        if (video_encoder_) {
            encoder_name_ = "x264 (Software)";
            LOG_INFO("    SUCCESS: x264 encoder created with CRF=" + std::to_string(quality.crf) + ", preset=" + quality.x264_preset);
            encoder_created = true;
        } else {
            LOG_ERROR("    Failed to create x264 encoder");
            last_error_ = "Failed to create x264 encoder as requested";
            return false;
        }
    } else if (video_cfg.encoder == "nvenc") {
        // User explicitly wants NVENC - try NVENC variants, don't fall back to x264
        LOG_INFO("    Encoder set to NVENC only...");
        
        for (size_t i = 0; i < nvenc_count; ++i) {
            LOG_INFO("    Trying " + std::string(nvenc_ids[i]) + "...");
            
            obs_data_t* settings = create_nvenc_settings(nvenc_ids[i], quality);
            video_encoder_ = obs_api::video_encoder_create(nvenc_ids[i], "video_encoder", settings, nullptr);
            obs_api::data_release(settings);

            if (video_encoder_) {
                encoder_name_ = nvenc_names[i];
                current_nvenc_index_ = static_cast<int>(i);
                LOG_INFO("    SUCCESS: Using " + std::string(nvenc_ids[i]) + " with CQP=" + std::to_string(quality.cqp));
                encoder_created = true;
                break;
            } else {
                LOG_WARNING("    Failed to create " + std::string(nvenc_ids[i]));
            }
        }

        if (!encoder_created) {
            last_error_ = "Failed to create NVENC encoder as requested (all NVENC variants failed)";
            LOG_ERROR(last_error_);
            return false;
        }
    } else {
        // "auto" (default) - Try NVENC first, fall back to x264 if all fail
        LOG_INFO("    Encoder set to auto - trying NVENC first with x264 fallback...");
        
        for (size_t i = 0; i < nvenc_count; ++i) {
            LOG_INFO("    Trying " + std::string(nvenc_ids[i]) + "...");
            
            obs_data_t* settings = create_nvenc_settings(nvenc_ids[i], quality);
            video_encoder_ = obs_api::video_encoder_create(nvenc_ids[i], "video_encoder", settings, nullptr);
            obs_api::data_release(settings);

            if (video_encoder_) {
                encoder_name_ = nvenc_names[i];
                current_nvenc_index_ = static_cast<int>(i);
                LOG_INFO("    SUCCESS: Using " + std::string(nvenc_ids[i]) + " with CQP=" + std::to_string(quality.cqp));
                encoder_created = true;
                break;
            } else {
                LOG_WARNING("    Failed to create " + std::string(nvenc_ids[i]));
            }
        }

        // Fallback to x264 if no NVENC encoder worked
        if (!encoder_created) {
            LOG_INFO("    All NVENC variants failed, falling back to x264 (CPU encoding)...");
            
            obs_data_t* settings = obs_api::data_create();
            obs_api::data_set_string(settings, "rate_control", "CRF");
            obs_api::data_set_int(settings, "crf", quality.crf);
            obs_api::data_set_string(settings, "preset", quality.x264_preset);
            
            video_encoder_ = obs_api::video_encoder_create("obs_x264", "video_encoder", settings, nullptr);
            obs_api::data_release(settings);

            if (video_encoder_) {
                encoder_name_ = "x264 (Software)";
                LOG_INFO("    SUCCESS: x264 encoder created with CRF=" + std::to_string(quality.crf) + ", preset=" + quality.x264_preset);
                encoder_created = true;
            }
        }
    }

    if (!encoder_created || !video_encoder_) {
        last_error_ = "Failed to create video encoder (neither NVENC nor x264 available)";
        LOG_ERROR(last_error_);
        return false;
    }

    // Connect encoder to video output
    obs_api::encoder_set_video(video_encoder_, obs_api::get_video());
    LOG_INFO("    Video encoder: " + encoder_name_);

    return true;
}

/**
 * @brief Build OBS encoder settings tailored for a specific NVENC backend and quality mapping.
 *
 * Creates an obs_data_t containing rate-control and preset fields appropriate for the given
 * NVENC encoder implementation and the provided QualityMapping.
 *
 * @param encoder_id Null-terminated identifier of the NVENC backend (commonly "jim_nvenc",
 *                   "ffmpeg_nvenc", or legacy identifiers such as "h264_nvenc"). Values not
 *                   explicitly matched are treated as legacy NVENC.
 * @param quality QualityMapping providing encoder-specific parameters (e.g., `cqp`, `nvenc_preset`).
 * @return obs_data_t* A newly allocated settings object configured for the requested encoder.
 *         The caller takes ownership and is responsible for releasing it when no longer needed.
 */
obs_data_t* EncoderManager::create_nvenc_settings(const char* encoder_id, const QualityMapping& quality)
{
    obs_data_t* settings = obs_api::data_create();
    
    if (strcmp(encoder_id, "jim_nvenc") == 0) {
        // jim_nvenc (obs-nvenc.dll) - modern NVENC with new API
        // CRITICAL: jim_nvenc uses p1-p7 presets (not old "quality"/"performance" strings)
        // CRITICAL: multipass must be "disabled" for CQP mode (incompatible!)
        obs_api::data_set_string(settings, "rate_control", "CQP");
        obs_api::data_set_int(settings, "cqp", quality.cqp);
        obs_api::data_set_string(settings, "preset", quality.nvenc_preset);  // p1-p7
        obs_api::data_set_string(settings, "tune", "hq");    // high quality
        obs_api::data_set_string(settings, "multipass", "disabled");  // REQUIRED for CQP!
        obs_api::data_set_int(settings, "bf", 2);            // B-frames for better compression
        obs_api::data_set_string(settings, "profile", "high");
    } else if (strcmp(encoder_id, "ffmpeg_nvenc") == 0) {
        // ffmpeg_nvenc (obs-ffmpeg.dll) - FFmpeg-based NVENC
        // Uses standard FFmpeg NVENC settings
        obs_api::data_set_string(settings, "rate_control", "CQ");  // FFmpeg uses CQ not CQP
        obs_api::data_set_int(settings, "cq", quality.cqp);
        obs_api::data_set_string(settings, "preset", "hq");  // hq for all qualities
        obs_api::data_set_string(settings, "profile", "high");
        obs_api::data_set_int(settings, "bf", 2);
    } else {
        // h264_nvenc and other legacy encoders
        // Use basic settings that should work with most NVENC implementations
        obs_api::data_set_string(settings, "rate_control", "CQP");
        obs_api::data_set_int(settings, "cqp", quality.cqp);
        obs_api::data_set_string(settings, "preset", "hq");
        obs_api::data_set_string(settings, "profile", "high");
    }
    
    return settings;
}

/**
 * @brief Creates and configures AAC audio encoders for desktop and microphone tracks.
 *
 * Creates two AAC audio encoders using the configured audio bitrate: Track 1 for desktop audio (mixer index 0)
 * and Track 2 for microphone (mixer index 1), then binds each encoder to the global audio output.
 * On failure the function cleans up any partially created encoder, records a human-readable `last_error_`,
 * and releases temporary settings.
 *
 * @return true if both audio encoders are created and bound successfully, false otherwise.
 */
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

/**
 * @brief Switches the active video encoder to x264 using the configured quality mapping.
 *
 * Attempts to release the current hardware encoder and create an x264 software encoder configured
 * with the CRF and x264 preset derived from the current video quality setting. No action is taken
 * if the manager is not initialized, there is no active video encoder, or the active encoder is
 * already x264.
 *
 * @returns `true` if the switch to x264 succeeded and the manager is now using the x264 encoder, `false` otherwise.
 */
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

    // Create x264 encoder with quality mapping
    const auto& video_cfg = ConfigManager::instance().video();
    QualityMapping quality = get_quality_mapping(video_cfg.quality);
    
    obs_data_t* settings = obs_api::data_create();
    obs_api::data_set_string(settings, "rate_control", "CRF");
    obs_api::data_set_int(settings, "crf", quality.crf);
    obs_api::data_set_string(settings, "preset", quality.x264_preset);

    video_encoder_ = obs_api::video_encoder_create("obs_x264", "video_encoder", settings, nullptr);
    obs_api::data_release(settings);

    if (!video_encoder_) {
        last_error_ = "Failed to create x264 fallback encoder";
        LOG_ERROR(last_error_);
        return false;
    }

    obs_api::encoder_set_video(video_encoder_, obs_api::get_video());
    encoder_name_ = "x264 (Software - Fallback)";
    LOG_INFO("    Switched to x264 encoder with CRF=" + std::to_string(quality.crf) + ", preset=" + quality.x264_preset);

    return true;
}

/**
 * @brief Attempt to switch the active video encoder to the next available NVENC implementation.
 *
 * If successful, updates encoder_name_ and current_nvenc_index_, connects the new encoder to the video output,
 * and makes the new encoder the active video_encoder_. The function does nothing and returns `false` if the
 * manager is not initialized, there is no current video encoder, there are no remaining NVENC variants to try,
 * or if creating any remaining NVENC encoder fails.
 *
 * @return true if a different NVENC encoder was successfully created, bound to the video output, and activated; `false` otherwise.
 */
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
    QualityMapping quality = get_quality_mapping(video_cfg.quality);

    // Try each remaining NVENC encoder
    for (size_t i = next_index; i < nvenc_count; ++i) {
        LOG_INFO("    Trying " + std::string(nvenc_ids[i]) + "...");

        obs_data_t* settings = create_nvenc_settings(nvenc_ids[i], quality);
        video_encoder_ = obs_api::video_encoder_create(nvenc_ids[i], "video_encoder", settings, nullptr);
        obs_api::data_release(settings);

        if (video_encoder_) {
            encoder_name_ = nvenc_names[i];
            current_nvenc_index_ = static_cast<int>(i);
            obs_api::encoder_set_video(video_encoder_, obs_api::get_video());
            LOG_INFO("    SUCCESS: Switched to " + std::string(nvenc_ids[i]) + " with CQP=" + std::to_string(quality.cqp));
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