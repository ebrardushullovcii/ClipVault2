#pragma once

#include <string>
#include <cstdint>

// Forward declarations for OBS types (must be in global namespace)
struct obs_data;
struct obs_source;
struct obs_encoder;
struct obs_output;
struct obs_service;
struct video_output;
struct audio_output;
struct signal_handler;
struct calldata;
struct proc_handler;
struct obs_scene;
struct obs_scene_item;

typedef struct obs_data obs_data_t;
typedef struct obs_source obs_source_t;
typedef struct obs_encoder obs_encoder_t;
typedef struct obs_output obs_output_t;
typedef struct obs_service obs_service_t;
typedef struct video_output video_t;
typedef struct audio_output audio_t;
typedef struct signal_handler signal_handler_t;
typedef struct calldata calldata_t;
typedef struct proc_handler proc_handler_t;
typedef struct obs_scene obs_scene_t;
typedef struct obs_scene_item obs_sceneitem_t;

namespace clipvault {

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
    bool source_active(obs_source_t* source);
    void source_activate(obs_source_t* source);
    void source_deactivate(obs_source_t* source, uint32_t hint = 0);
    
    // Video render function (CRITICAL: must be called regularly to produce frames)
    void render_main_texture();

    // Encoder functions
    obs_encoder_t* video_encoder_create(const char* id, const char* name, obs_data_t* settings, obs_data_t* hotkey_data);
    obs_encoder_t* audio_encoder_create(const char* id, const char* name, obs_data_t* settings, size_t mixer_idx, obs_data_t* hotkey_data);
    void encoder_release(obs_encoder_t* encoder);
    void encoder_set_video(obs_encoder_t* encoder, video_t* video);
    void encoder_set_audio(obs_encoder_t* encoder, audio_t* audio);
    video_t* get_video();
    audio_t* get_audio();

    // Output functions (replay buffer)
    obs_output_t* output_create(const char* id, const char* name, obs_data_t* settings, obs_data_t* hotkey_data);
    void output_release(obs_output_t* output);
    void output_set_video_encoder(obs_output_t* output, obs_encoder_t* encoder);
    void output_set_audio_encoder(obs_output_t* output, obs_encoder_t* encoder, size_t idx);
    void output_set_mixers(obs_output_t* output, uint32_t mixers);
    void output_set_video_source(obs_output_t* output, obs_source_t* source);
    bool output_start(obs_output_t* output);
    void output_stop(obs_output_t* output);
    bool output_active(obs_output_t* output);
    signal_handler_t* output_get_signal_handler(obs_output_t* output);
    void signal_handler_connect(signal_handler_t* handler, const char* signal, void (*callback)(void*, calldata_t*), void* data);

    // Replay buffer specific
    void output_signal(obs_output_t* output, const char* signal);
    const char* calldata_string(calldata_t* data, const char* name);
    const char* output_get_last_error(obs_output_t* output);
    const char* output_get_last_replay(obs_output_t* output);
    
    // Procedure handler (for replay buffer save)
    proc_handler_t* output_get_proc_handler(obs_output_t* output);
    void calldata_init(calldata_t* data);
    void calldata_free(calldata_t* data);
    bool proc_handler_call(proc_handler_t* handler, const char* name, calldata_t* data);

    // Diagnostic functions
    bool output_can_begin_data_capture(obs_output_t* output, uint32_t flags);
    uint32_t output_get_flags(obs_output_t* output);
    const char* encoder_get_id(obs_encoder_t* encoder);
    bool encoder_active(obs_encoder_t* encoder);
    const char* output_get_id(obs_output_t* output);
    const char* output_get_name(obs_output_t* output);
    obs_encoder_t* output_get_video_encoder(obs_output_t* output);
    obs_encoder_t* output_get_audio_encoder(obs_output_t* output, size_t idx);
    const char* data_get_json(obs_data_t* data);

    // Debug helper - logs detailed output state
    void debug_log_output_state(obs_output_t* output, const char* label);
    void debug_log_encoder_state(obs_encoder_t* encoder, const char* label);

    // Scene functions (needed for video rendering pipeline)
    obs_scene_t* scene_create(const char* name);
    void scene_release(obs_scene_t* scene);
    obs_source_t* scene_get_source(const obs_scene_t* scene);
    obs_sceneitem_t* scene_add(obs_scene_t* scene, obs_source_t* source);
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
