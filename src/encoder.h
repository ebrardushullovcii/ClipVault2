#pragma once

#include <string>

struct obs_encoder;
typedef struct obs_encoder obs_encoder_t;

namespace clipvault {

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

private:
    EncoderManager() = default;
    ~EncoderManager();

    EncoderManager(const EncoderManager&) = delete;
    EncoderManager& operator=(const EncoderManager&) = delete;

    bool create_video_encoder();
    bool create_audio_encoders();

    obs_encoder_t* video_encoder_ = nullptr;
    obs_encoder_t* audio_encoder_1_ = nullptr;  // Track 1: Desktop audio
    obs_encoder_t* audio_encoder_2_ = nullptr;  // Track 2: Microphone

    bool initialized_ = false;
    std::string last_error_;
    std::string encoder_name_;
};

} // namespace clipvault
