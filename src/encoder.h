#pragma once

#include <string>
#include "obs_core.h"  // For obs_encoder_t and obs_data_t

/**
 * Create NVENC encoder settings based on an encoder identifier and a quality mapping.
 *
 * Builds and returns an obs_data_t configured for NVENC using the given encoder_id and
 * QualityMapping values (CQP, preset, etc.). The returned obs_data_t contains encoder
 * options appropriate for the selected NVENC encoder and quality profile.
 *
 * @param encoder_id Identifier of the NVENC encoder to target (e.g., plugin/encoder id string).
 * @param quality QualityMapping that specifies CQP/CRF values and preset names to apply.
 * @returns Configured obs_data_t pointer for NVENC settings, or `nullptr` on failure.
 */
namespace clipvault {

// Quality preset mappings
struct QualityMapping {
    int cqp;      // NVENC CQP value (lower = better quality, 15-51)
    int crf;      // x264 CRF value (lower = better quality, 0-51)
    const char* nvenc_preset;  // p1-p7 for jim_nvenc
    const char* x264_preset;   // preset name for x264
};

class EncoderManager {
public:
    static EncoderManager& instance();

    bool initialize();
    void shutdown();

    bool is_initialized() const { return initialized_; }
    const std::string& last_error() const { return last_error_; }

    // Get encoders for output setup
    obs_encoder_t* get_video_encoder() const { return video_encoder_; }
    obs_encoder_t* get_audio_encoder_track1() const { return audio_encoder_1_; }
    obs_encoder_t* get_audio_encoder_track2() const { return audio_encoder_2_; }

    // Get encoder name (for logging)
    const std::string& encoder_name() const { return encoder_name_; }

    // Fallback to x264 if NVENC fails (returns true if switched)
    bool fallback_to_x264();

    // Try the next NVENC encoder when current one fails at runtime
    // Returns true if successfully switched to a different NVENC encoder
    bool try_next_nvenc_encoder();

    // Check if current encoder is NVENC (not x264)
    bool is_using_nvenc() const;

private:
    EncoderManager() = default;
    ~EncoderManager();

    EncoderManager(const EncoderManager&) = delete;
    EncoderManager& operator=(const EncoderManager&) = delete;

    bool create_video_encoder();
    bool create_audio_encoders();
    bool create_specific_encoder(const char* encoder_id, const char* encoder_name);
    obs_data_t* create_nvenc_settings(const char* encoder_id, const QualityMapping& quality);

    obs_encoder_t* video_encoder_ = nullptr;
    obs_encoder_t* audio_encoder_1_ = nullptr;  // Track 1: Desktop audio
    obs_encoder_t* audio_encoder_2_ = nullptr;  // Track 2: Microphone

    bool initialized_ = false;
    std::string last_error_;
    std::string encoder_name_;
    int current_nvenc_index_ = -1;  // Tracks which NVENC encoder we're using
};

} // namespace clipvault