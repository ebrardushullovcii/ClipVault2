#pragma once

#include <string>
#include <cstdint>

// Forward declarations for OBS types
struct obs_data;
struct obs_source;
typedef struct obs_data obs_data_t;
typedef struct obs_source obs_source_t;

namespace clipvault {

// Forward declarations
struct obs_encoder;
struct video_t;
struct audio_t;
typedef struct obs_encoder obs_encoder_t;
typedef struct video_t video_t;
typedef struct audio_t audio_t;

// OBS API wrapper functions (runtime loaded)
namespace obs_api {
    // Data functions
    obs_data_t* data_create();
    void data_release(obs_data_t* data);
    void data_set_int(obs_data_t* data, const char* name, long long val);
    void data_set_bool(obs_data_t* data, const char* name, bool val);
    void data_set_string(obs_data_t* data, const char* name, const char* val);

    // Source functions
    obs_source_t* source_create(const char* id, const char* name, obs_data_t* settings, obs_data_t* hotkey_data);
    void source_release(obs_source_t* source);
    void source_set_audio_mixers(obs_source_t* source, uint32_t mixers);
    void set_output_source(uint32_t channel, obs_source_t* source);

    // Encoder functions
    obs_encoder_t* video_encoder_create(const char* id, const char* name, obs_data_t* settings, obs_data_t* hotkey_data);
    obs_encoder_t* audio_encoder_create(const char* id, const char* name, obs_data_t* settings, size_t mixer_idx, obs_data_t* hotkey_data);
    void encoder_release(obs_encoder_t* encoder);
    void encoder_set_video(obs_encoder_t* encoder, video_t* video);
    void encoder_set_audio(obs_encoder_t* encoder, audio_t* audio);
    video_t* get_video();
    audio_t* get_audio();
}

class OBSCore {
public:
    static OBSCore& instance();

    // Initialize OBS subsystem
    bool initialize(const std::string& exe_dir);

    // Shutdown OBS
    void shutdown();

    // Check if initialized
    bool is_initialized() const { return initialized_; }

    // Get last error message
    const std::string& last_error() const { return last_error_; }

private:
    OBSCore() = default;
    ~OBSCore();

    OBSCore(const OBSCore&) = delete;
    OBSCore& operator=(const OBSCore&) = delete;

    bool initialized_ = false;
    std::string last_error_;
};

} // namespace clipvault
