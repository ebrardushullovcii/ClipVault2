#include "obs_core.h"
#include "logger.h"
#include "config.h"

// Use the actual OBS headers to ensure struct compatibility
#include <obs.h>

#include <windows.h>

// OBS function signatures - we'll load these dynamically
typedef bool (*obs_startup_t)(const char *locale, const char *module_config_path, void *store);
typedef void (*obs_shutdown_t)(void);
typedef void (*obs_add_data_path_t)(const char *path);
typedef void (*obs_add_module_path_t)(const char *bin, const char *data);
typedef int (*obs_reset_video_t)(struct obs_video_info *ovi);
typedef bool (*obs_reset_audio_t)(const struct obs_audio_info *oai);
typedef void (*obs_load_all_modules_t)(void);
typedef void (*obs_post_load_modules_t)(void);

// Source/data functions
typedef obs_data_t* (*obs_data_create_t)(void);
typedef void (*obs_data_release_t)(obs_data_t *data);
typedef void (*obs_data_set_int_t)(obs_data_t *data, const char *name, long long val);
typedef void (*obs_data_set_bool_t)(obs_data_t *data, const char *name, bool val);
typedef void (*obs_data_set_string_t)(obs_data_t *data, const char *name, const char *val);
typedef obs_source_t* (*obs_source_create_t)(const char *id, const char *name, obs_data_t *settings, obs_data_t *hotkey_data);
typedef void (*obs_source_release_t)(obs_source_t *source);
typedef void (*obs_source_set_audio_mixers_t)(obs_source_t *source, uint32_t mixers);
typedef void (*obs_set_output_source_t)(uint32_t channel, obs_source_t *source);
typedef bool (*obs_source_active_t)(obs_source_t *source);
typedef void (*obs_source_activate_t)(obs_source_t *source);
typedef void (*obs_source_deactivate_t)(obs_source_t *source, uint32_t hint);

// Video render function (CRITICAL for frame production)
typedef void (*obs_render_main_texture_t)(void);

// Encoder functions
typedef obs_encoder_t* (*obs_video_encoder_create_t)(const char *id, const char *name, obs_data_t *settings, obs_data_t *hotkey_data);
typedef obs_encoder_t* (*obs_audio_encoder_create_t)(const char *id, const char *name, obs_data_t *settings, size_t mixer_idx, obs_data_t *hotkey_data);
typedef void (*obs_encoder_release_t)(obs_encoder_t *encoder);
typedef void (*obs_encoder_set_video_t)(obs_encoder_t *encoder, video_t *video);
typedef void (*obs_encoder_set_audio_t)(obs_encoder_t *encoder, audio_t *audio);
typedef video_t* (*obs_get_video_t)(void);
typedef audio_t* (*obs_get_audio_t)(void);

// Output functions
typedef obs_output_t* (*obs_output_create_t)(const char *id, const char *name, obs_data_t *settings, obs_data_t *hotkey_data);
typedef void (*obs_output_release_t)(obs_output_t *output);
typedef void (*obs_output_set_video_encoder_t)(obs_output_t *output, obs_encoder_t *encoder);
typedef void (*obs_output_set_audio_encoder_t)(obs_output_t *output, obs_encoder_t *encoder, size_t idx);
typedef bool (*obs_output_start_t)(obs_output_t *output);
typedef void (*obs_output_stop_t)(obs_output_t *output);
typedef bool (*obs_output_active_t)(obs_output_t *output);
typedef signal_handler_t* (*obs_output_get_signal_handler_t)(obs_output_t *output);
typedef void (*signal_handler_connect_t)(signal_handler_t *handler, const char *signal, void (*callback)(void*, calldata_t*), void *data);
typedef void (*obs_output_signal_t)(obs_output_t *output, const char *signal);
typedef const char* (*calldata_string_t)(calldata_t *data, const char *name);
typedef const char* (*obs_output_get_last_error_t)(obs_output_t *output);
typedef bool (*obs_output_can_begin_data_capture_t)(obs_output_t *output, uint32_t flags);
typedef void (*obs_output_set_mixers_t)(obs_output_t *output, uint32_t mixers);
typedef void (*obs_output_set_video_source_t)(obs_output_t *output, obs_source_t *source);

// Debug/diagnostic functions
typedef uint32_t (*obs_output_get_flags_t)(obs_output_t *output);
typedef const char* (*obs_encoder_get_id_t)(const obs_encoder_t *encoder);
typedef bool (*obs_encoder_active_t)(const obs_encoder_t *encoder);
typedef const char* (*obs_output_get_id_t)(const obs_output_t *output);
typedef const char* (*obs_output_get_name_t)(const obs_output_t *output);
typedef obs_encoder_t* (*obs_output_get_video_encoder_t)(const obs_output_t *output);
typedef obs_encoder_t* (*obs_output_get_audio_encoder_t)(const obs_output_t *output, size_t idx);
typedef const char* (*obs_data_get_json_t)(obs_data_t *data);

// Procedure handler functions (for replay buffer save)
typedef proc_handler_t* (*obs_output_get_proc_handler_t)(obs_output_t *output);
typedef void (*calldata_init_t)(calldata_t *data);
typedef void (*calldata_free_t)(calldata_t *data);
typedef bool (*proc_handler_call_t)(proc_handler_t *handler, const char *name, calldata_t *data);

// Scene functions (needed for video rendering pipeline)
typedef obs_scene_t* (*obs_scene_create_t)(const char *name);
typedef void (*obs_scene_release_t)(obs_scene_t *scene);
typedef obs_source_t* (*obs_scene_get_source_t)(const obs_scene_t *scene);
typedef obs_sceneitem_t* (*obs_scene_add_t)(obs_scene_t *scene, obs_source_t *source);

namespace clipvault {

// OBS function pointers
static HMODULE g_obs_module = nullptr;
static obs_startup_t g_obs_startup = nullptr;
static obs_shutdown_t g_obs_shutdown = nullptr;
static obs_add_data_path_t g_obs_add_data_path = nullptr;
static obs_add_module_path_t g_obs_add_module_path = nullptr;
static obs_reset_video_t g_obs_reset_video = nullptr;
static obs_reset_audio_t g_obs_reset_audio = nullptr;
static obs_load_all_modules_t g_obs_load_all_modules = nullptr;
static obs_post_load_modules_t g_obs_post_load_modules = nullptr;

// Source/data function pointers
static obs_data_create_t g_obs_data_create = nullptr;
static obs_data_release_t g_obs_data_release = nullptr;
static obs_data_set_int_t g_obs_data_set_int = nullptr;
static obs_data_set_bool_t g_obs_data_set_bool = nullptr;
static obs_data_set_string_t g_obs_data_set_string = nullptr;
static obs_source_create_t g_obs_source_create = nullptr;
static obs_source_release_t g_obs_source_release = nullptr;
static obs_source_set_audio_mixers_t g_obs_source_set_audio_mixers = nullptr;
static obs_set_output_source_t g_obs_set_output_source = nullptr;
static obs_source_active_t g_obs_source_active = nullptr;
static obs_source_activate_t g_obs_source_activate = nullptr;
static obs_source_deactivate_t g_obs_source_deactivate = nullptr;

// Video render function pointer (CRITICAL for frame production)
static obs_render_main_texture_t g_obs_render_main_texture = nullptr;

// Encoder function pointers
static obs_video_encoder_create_t g_obs_video_encoder_create = nullptr;
static obs_audio_encoder_create_t g_obs_audio_encoder_create = nullptr;
static obs_encoder_release_t g_obs_encoder_release = nullptr;
static obs_encoder_set_video_t g_obs_encoder_set_video = nullptr;
static obs_encoder_set_audio_t g_obs_encoder_set_audio = nullptr;
static obs_get_video_t g_obs_get_video = nullptr;
static obs_get_audio_t g_obs_get_audio = nullptr;

// Output function pointers
static obs_output_create_t g_obs_output_create = nullptr;
static obs_output_release_t g_obs_output_release = nullptr;
static obs_output_set_video_encoder_t g_obs_output_set_video_encoder = nullptr;
static obs_output_set_audio_encoder_t g_obs_output_set_audio_encoder = nullptr;
static obs_output_start_t g_obs_output_start = nullptr;
static obs_output_stop_t g_obs_output_stop = nullptr;
static obs_output_active_t g_obs_output_active = nullptr;
static obs_output_get_signal_handler_t g_obs_output_get_signal_handler = nullptr;
static signal_handler_connect_t g_signal_handler_connect = nullptr;
static obs_output_signal_t g_obs_output_signal = nullptr;
static calldata_string_t g_calldata_string = nullptr;
static obs_output_get_last_error_t g_obs_output_get_last_error = nullptr;
static obs_output_can_begin_data_capture_t g_obs_output_can_begin_data_capture = nullptr;
static obs_output_set_mixers_t g_obs_output_set_mixers = nullptr;
static obs_output_set_video_source_t g_obs_output_set_video_source = nullptr;

// Debug function pointers
static obs_output_get_flags_t g_obs_output_get_flags = nullptr;
static obs_encoder_get_id_t g_obs_encoder_get_id = nullptr;
static obs_encoder_active_t g_obs_encoder_active = nullptr;
static obs_output_get_id_t g_obs_output_get_id = nullptr;
static obs_output_get_name_t g_obs_output_get_name = nullptr;
static obs_output_get_video_encoder_t g_obs_output_get_video_encoder = nullptr;
static obs_output_get_audio_encoder_t g_obs_output_get_audio_encoder = nullptr;
static obs_data_get_json_t g_obs_data_get_json = nullptr;

// Procedure handler function pointers
static obs_output_get_proc_handler_t g_obs_output_get_proc_handler = nullptr;
static calldata_init_t g_calldata_init = nullptr;
static calldata_free_t g_calldata_free = nullptr;
static proc_handler_call_t g_proc_handler_call = nullptr;

// Scene function pointers
static obs_scene_create_t g_obs_scene_create = nullptr;
static obs_scene_release_t g_obs_scene_release = nullptr;
static obs_scene_get_source_t g_obs_scene_get_source = nullptr;
static obs_scene_add_t g_obs_scene_add = nullptr;

OBSCore& OBSCore::instance()
{
    static OBSCore instance;
    return instance;
}

OBSCore::~OBSCore()
{
    shutdown();
}

static bool load_obs_functions()
{
    if (!g_obs_module) {
        LOG_ERROR("OBS module not loaded");
        return false;
    }

    // Core functions
    g_obs_startup = (obs_startup_t)GetProcAddress(g_obs_module, "obs_startup");
    g_obs_shutdown = (obs_shutdown_t)GetProcAddress(g_obs_module, "obs_shutdown");
    g_obs_add_data_path = (obs_add_data_path_t)GetProcAddress(g_obs_module, "obs_add_data_path");
    g_obs_add_module_path = (obs_add_module_path_t)GetProcAddress(g_obs_module, "obs_add_module_path");
    g_obs_reset_video = (obs_reset_video_t)GetProcAddress(g_obs_module, "obs_reset_video");
    g_obs_reset_audio = (obs_reset_audio_t)GetProcAddress(g_obs_module, "obs_reset_audio");
    g_obs_load_all_modules = (obs_load_all_modules_t)GetProcAddress(g_obs_module, "obs_load_all_modules");
    g_obs_post_load_modules = (obs_post_load_modules_t)GetProcAddress(g_obs_module, "obs_post_load_modules");

    // Source/data functions
    g_obs_data_create = (obs_data_create_t)GetProcAddress(g_obs_module, "obs_data_create");
    g_obs_data_release = (obs_data_release_t)GetProcAddress(g_obs_module, "obs_data_release");
    g_obs_data_set_int = (obs_data_set_int_t)GetProcAddress(g_obs_module, "obs_data_set_int");
    g_obs_data_set_bool = (obs_data_set_bool_t)GetProcAddress(g_obs_module, "obs_data_set_bool");
    g_obs_data_set_string = (obs_data_set_string_t)GetProcAddress(g_obs_module, "obs_data_set_string");
    g_obs_source_create = (obs_source_create_t)GetProcAddress(g_obs_module, "obs_source_create");
    g_obs_source_release = (obs_source_release_t)GetProcAddress(g_obs_module, "obs_source_release");
    g_obs_source_set_audio_mixers = (obs_source_set_audio_mixers_t)GetProcAddress(g_obs_module, "obs_source_set_audio_mixers");
    g_obs_set_output_source = (obs_set_output_source_t)GetProcAddress(g_obs_module, "obs_set_output_source");
    g_obs_source_active = (obs_source_active_t)GetProcAddress(g_obs_module, "obs_source_active");
    g_obs_source_activate = (obs_source_activate_t)GetProcAddress(g_obs_module, "obs_source_activate");
    g_obs_source_deactivate = (obs_source_deactivate_t)GetProcAddress(g_obs_module, "obs_source_deactivate");
    
    // CRITICAL: Load video render function (needed to produce frames)
    g_obs_render_main_texture = (obs_render_main_texture_t)GetProcAddress(g_obs_module, "obs_render_main_texture");
    if (!g_obs_render_main_texture) {
        LOG_WARNING("Failed to load obs_render_main_texture - video may be black");
    } else {
        LOG_INFO("obs_render_main_texture loaded successfully - frame rendering available");
    }

    if (!g_obs_startup || !g_obs_shutdown || !g_obs_add_data_path ||
        !g_obs_add_module_path || !g_obs_reset_video || !g_obs_reset_audio ||
        !g_obs_load_all_modules || !g_obs_post_load_modules) {
        LOG_ERROR("Failed to load core OBS functions");
        return false;
    }

    if (!g_obs_data_create || !g_obs_data_release || !g_obs_source_create ||
        !g_obs_source_release || !g_obs_set_output_source) {
        LOG_ERROR("Failed to load source/data OBS functions");
        return false;
    }

    // Encoder functions
    g_obs_video_encoder_create = (obs_video_encoder_create_t)GetProcAddress(g_obs_module, "obs_video_encoder_create");
    g_obs_audio_encoder_create = (obs_audio_encoder_create_t)GetProcAddress(g_obs_module, "obs_audio_encoder_create");
    g_obs_encoder_release = (obs_encoder_release_t)GetProcAddress(g_obs_module, "obs_encoder_release");
    g_obs_encoder_set_video = (obs_encoder_set_video_t)GetProcAddress(g_obs_module, "obs_encoder_set_video");
    g_obs_encoder_set_audio = (obs_encoder_set_audio_t)GetProcAddress(g_obs_module, "obs_encoder_set_audio");
    g_obs_get_video = (obs_get_video_t)GetProcAddress(g_obs_module, "obs_get_video");
    g_obs_get_audio = (obs_get_audio_t)GetProcAddress(g_obs_module, "obs_get_audio");

    if (!g_obs_video_encoder_create || !g_obs_audio_encoder_create ||
        !g_obs_encoder_release || !g_obs_get_video || !g_obs_get_audio) {
        LOG_ERROR("Failed to load encoder OBS functions");
        return false;
    }

    // Output functions
    g_obs_output_create = (obs_output_create_t)GetProcAddress(g_obs_module, "obs_output_create");
    g_obs_output_release = (obs_output_release_t)GetProcAddress(g_obs_module, "obs_output_release");
    g_obs_output_set_video_encoder = (obs_output_set_video_encoder_t)GetProcAddress(g_obs_module, "obs_output_set_video_encoder");
    g_obs_output_set_audio_encoder = (obs_output_set_audio_encoder_t)GetProcAddress(g_obs_module, "obs_output_set_audio_encoder");
    g_obs_output_start = (obs_output_start_t)GetProcAddress(g_obs_module, "obs_output_start");
    g_obs_output_stop = (obs_output_stop_t)GetProcAddress(g_obs_module, "obs_output_stop");
    g_obs_output_active = (obs_output_active_t)GetProcAddress(g_obs_module, "obs_output_active");
    g_obs_output_get_signal_handler = (obs_output_get_signal_handler_t)GetProcAddress(g_obs_module, "obs_output_get_signal_handler");
    g_signal_handler_connect = (signal_handler_connect_t)GetProcAddress(g_obs_module, "signal_handler_connect");
    g_obs_output_signal = (obs_output_signal_t)GetProcAddress(g_obs_module, "obs_output_signal");
    g_calldata_string = (calldata_string_t)GetProcAddress(g_obs_module, "calldata_string");
    g_obs_output_get_last_error = (obs_output_get_last_error_t)GetProcAddress(g_obs_module, "obs_output_get_last_error");
g_obs_output_can_begin_data_capture = (obs_output_can_begin_data_capture_t)GetProcAddress(g_obs_module, "obs_output_can_begin_data_capture");
    g_obs_output_set_mixers = (obs_output_set_mixers_t)GetProcAddress(g_obs_module, "obs_output_set_mixers");
    g_obs_output_set_video_source = (obs_output_set_video_source_t)GetProcAddress(g_obs_module, "obs_output_set_video_source");

// Debug functions (optional - don't fail if not found)
    g_obs_output_get_flags = (obs_output_get_flags_t)GetProcAddress(g_obs_module, "obs_output_get_flags");
    g_obs_encoder_get_id = (obs_encoder_get_id_t)GetProcAddress(g_obs_module, "obs_encoder_get_id");
    g_obs_encoder_active = (obs_encoder_active_t)GetProcAddress(g_obs_module, "obs_encoder_active");
    g_obs_output_get_id = (obs_output_get_id_t)GetProcAddress(g_obs_module, "obs_output_get_id");
    g_obs_output_get_name = (obs_output_get_name_t)GetProcAddress(g_obs_module, "obs_output_get_name");
    g_obs_output_get_video_encoder = (obs_output_get_video_encoder_t)GetProcAddress(g_obs_module, "obs_output_get_video_encoder");
    g_obs_output_get_audio_encoder = (obs_output_get_audio_encoder_t)GetProcAddress(g_obs_module, "obs_output_get_audio_encoder");
    g_obs_data_get_json = (obs_data_get_json_t)GetProcAddress(g_obs_module, "obs_data_get_json");

    // Procedure handler functions (for replay buffer save)
    g_obs_output_get_proc_handler = (obs_output_get_proc_handler_t)GetProcAddress(g_obs_module, "obs_output_get_proc_handler");
    g_calldata_init = (calldata_init_t)GetProcAddress(g_obs_module, "calldata_init");
    g_calldata_free = (calldata_free_t)GetProcAddress(g_obs_module, "calldata_free");
    g_proc_handler_call = (proc_handler_call_t)GetProcAddress(g_obs_module, "proc_handler_call");

    // Scene functions (needed for video rendering pipeline)
    g_obs_scene_create = (obs_scene_create_t)GetProcAddress(g_obs_module, "obs_scene_create");
    g_obs_scene_release = (obs_scene_release_t)GetProcAddress(g_obs_module, "obs_scene_release");
    g_obs_scene_get_source = (obs_scene_get_source_t)GetProcAddress(g_obs_module, "obs_scene_get_source");
    g_obs_scene_add = (obs_scene_add_t)GetProcAddress(g_obs_module, "obs_scene_add");

    if (!g_obs_output_create || !g_obs_output_release || !g_obs_output_start ||
        !g_obs_output_stop || !g_obs_output_active) {
        LOG_ERROR("Failed to load output OBS functions");
        return false;
    }

    // Scene functions are critical - fail if not found
    if (!g_obs_scene_create || !g_obs_scene_release || !g_obs_scene_get_source || !g_obs_scene_add) {
        LOG_ERROR("Failed to load scene OBS functions");
        return false;
    }

    return true;
}

bool OBSCore::initialize(const std::string& exe_dir)
{
    if (initialized_) {
        LOG_WARNING("OBS already initialized");
        return true;
    }

    LOG_INFO("Initializing OBS...");

    // Step 0: Load obs.dll dynamically
    LOG_INFO("  Step 0: Loading obs.dll");
    std::string obs_dll_path = exe_dir + "\\obs.dll";
    LOG_INFO("    Path: " + obs_dll_path);

    g_obs_module = LoadLibraryA(obs_dll_path.c_str());
    if (!g_obs_module) {
        DWORD error = GetLastError();
        last_error_ = "Failed to load obs.dll (error code: " + std::to_string(error) + ")";
        LOG_ERROR(last_error_);
        return false;
    }
    LOG_INFO("    obs.dll loaded successfully");

    if (!load_obs_functions()) {
        last_error_ = "Failed to load OBS function pointers";
        LOG_ERROR(last_error_);
        FreeLibrary(g_obs_module);
        g_obs_module = nullptr;
        return false;
    }
    LOG_INFO("    OBS functions loaded");

    // Step 1: Start OBS
    LOG_INFO("  Step 1: obs_startup()");
    if (!g_obs_startup("en-US", nullptr, nullptr)) {
        last_error_ = "obs_startup() failed";
        LOG_ERROR(last_error_);
        FreeLibrary(g_obs_module);
        g_obs_module = nullptr;
        return false;
    }

    // Step 2: Add data paths (MUST have trailing slash!)
    LOG_INFO("  Step 2: Adding data paths");
    // Convert backslashes to forward slashes for OBS compatibility
    std::string exe_dir_fwd = exe_dir;
    for (char& c : exe_dir_fwd) {
        if (c == '\\') c = '/';
    }

    std::string libobs_data = exe_dir_fwd + "/data/libobs/";
    LOG_INFO("    libobs data: " + libobs_data);
    g_obs_add_data_path(libobs_data.c_str());

    // Also add the bin directory itself for finding graphics modules
    std::string bin_data = exe_dir_fwd + "/";
    LOG_INFO("    bin data: " + bin_data);
    g_obs_add_data_path(bin_data.c_str());

    // Step 3: Add module paths (plugins)
    LOG_INFO("  Step 3: Adding module paths");
    std::string plugin_bin = exe_dir_fwd + "/obs-plugins/64bit";
    std::string plugin_data = exe_dir_fwd + "/data/obs-plugins";
    LOG_INFO("    plugin bin: " + plugin_bin);
    LOG_INFO("    plugin data: " + plugin_data);
    g_obs_add_module_path(plugin_bin.c_str(), plugin_data.c_str());

    // Also add bin directory as module path for graphics modules
    g_obs_add_module_path(exe_dir_fwd.c_str(), exe_dir_fwd.c_str());

    // Step 4: Load modules FIRST (CRITICAL: must load before video/audio reset)
    // Otherwise monitor_capture will have black screen
    // See: https://github.com/obsproject/obs-studio/discussions/12367
    LOG_INFO("  Step 4: Loading modules (must be before video/audio init)");
    g_obs_load_all_modules();
    g_obs_post_load_modules();
    LOG_INFO("    Modules loaded");

    // Step 5: Reset video (AFTER modules are loaded!)
    LOG_INFO("  Step 5: obs_reset_video()");
    const auto& video_cfg = ConfigManager::instance().video();

    obs_video_info ovi = {};
    ovi.graphics_module = "libobs-d3d11";  // CRITICAL for Windows!
    ovi.fps_num = video_cfg.fps;
    ovi.fps_den = 1;
    ovi.base_width = video_cfg.width;
    ovi.base_height = video_cfg.height;
    ovi.output_width = video_cfg.width;
    ovi.output_height = video_cfg.height;
    ovi.output_format = VIDEO_FORMAT_NV12;  // From obs headers
    ovi.adapter = 0;
    ovi.gpu_conversion = true;
    ovi.colorspace = VIDEO_CS_709;          // From obs headers
    ovi.range = VIDEO_RANGE_PARTIAL;        // From obs headers
    ovi.scale_type = OBS_SCALE_BICUBIC;     // From obs headers

    int video_result = g_obs_reset_video(&ovi);
    if (video_result != OBS_VIDEO_SUCCESS) {
        const char* error_msg = "Unknown error";
        switch (video_result) {
            case -1: error_msg = "Video not supported (check graphics_module)"; break;
            case -2: error_msg = "Invalid video parameters"; break;
            case -3: error_msg = "Video already active"; break;
            case -4: error_msg = "libobs-d3d11.dll not found"; break;
            case -5: error_msg = "Video init failed (check data paths)"; break;
        }
        last_error_ = std::string("obs_reset_video() failed: ") + error_msg + " (code: " + std::to_string(video_result) + ")";
        LOG_ERROR(last_error_);
        g_obs_shutdown();
        FreeLibrary(g_obs_module);
        g_obs_module = nullptr;
        return false;
    }
    LOG_INFO("    Video initialized: " + std::to_string(video_cfg.width) + "x" +
             std::to_string(video_cfg.height) + "@" + std::to_string(video_cfg.fps) + "fps");

    // Step 6: Reset audio (AFTER modules are loaded!)
    LOG_INFO("  Step 6: obs_reset_audio()");
    const auto& audio_cfg = ConfigManager::instance().audio();

    obs_audio_info oai = {};
    oai.samples_per_sec = audio_cfg.sample_rate;
    oai.speakers = SPEAKERS_STEREO;  // From obs headers

    if (!g_obs_reset_audio(&oai)) {
        last_error_ = "obs_reset_audio() failed";
        LOG_ERROR(last_error_);
        g_obs_shutdown();
        FreeLibrary(g_obs_module);
        g_obs_module = nullptr;
        return false;
    }
    LOG_INFO("    Audio initialized: " + std::to_string(audio_cfg.sample_rate) + "Hz stereo");

    initialized_ = true;
    LOG_INFO("OBS initialized successfully!");

    return true;
}

void OBSCore::shutdown()
{
    if (!initialized_) {
        return;
    }

    LOG_INFO("Shutting down OBS...");

    if (g_obs_shutdown) {
        g_obs_shutdown();
    }

    if (g_obs_module) {
        FreeLibrary(g_obs_module);
        g_obs_module = nullptr;
    }

    // Clear function pointers
    g_obs_startup = nullptr;
    g_obs_shutdown = nullptr;
    g_obs_add_data_path = nullptr;
    g_obs_add_module_path = nullptr;
    g_obs_reset_video = nullptr;
    g_obs_reset_audio = nullptr;
    g_obs_load_all_modules = nullptr;
    g_obs_post_load_modules = nullptr;

    initialized_ = false;
    LOG_INFO("OBS shutdown complete");
}

// OBS API wrapper implementations
namespace obs_api {

obs_data_t* data_create()
{
    return g_obs_data_create ? g_obs_data_create() : nullptr;
}

void data_release(obs_data_t* data)
{
    if (g_obs_data_release && data) g_obs_data_release(data);
}

void data_set_int(obs_data_t* data, const char* name, long long val)
{
    if (g_obs_data_set_int && data) g_obs_data_set_int(data, name, val);
}

void data_set_bool(obs_data_t* data, const char* name, bool val)
{
    if (g_obs_data_set_bool && data) g_obs_data_set_bool(data, name, val);
}

void data_set_string(obs_data_t* data, const char* name, const char* val)
{
    if (g_obs_data_set_string && data) g_obs_data_set_string(data, name, val);
}

obs_source_t* source_create(const char* id, const char* name, obs_data_t* settings, obs_data_t* hotkey_data)
{
    return g_obs_source_create ? g_obs_source_create(id, name, settings, hotkey_data) : nullptr;
}

void source_release(obs_source_t* source)
{
    if (g_obs_source_release && source) g_obs_source_release(source);
}

void source_set_audio_mixers(obs_source_t* source, uint32_t mixers)
{
    if (g_obs_source_set_audio_mixers && source) g_obs_source_set_audio_mixers(source, mixers);
}

void set_output_source(uint32_t channel, obs_source_t* source)
{
    if (g_obs_set_output_source) g_obs_set_output_source(channel, source);
}

bool source_active(obs_source_t* source)
{
    return g_obs_source_active && source ? g_obs_source_active(source) : false;
}

void source_activate(obs_source_t* source)
{
    if (g_obs_source_activate && source) g_obs_source_activate(source);
}

void source_deactivate(obs_source_t* source, uint32_t hint)
{
    if (g_obs_source_deactivate && source) g_obs_source_deactivate(source, hint);
}

void render_main_texture()
{
    if (g_obs_render_main_texture) g_obs_render_main_texture();
}

// Encoder functions
obs_encoder_t* video_encoder_create(const char* id, const char* name, obs_data_t* settings, obs_data_t* hotkey_data)
{
    return g_obs_video_encoder_create ? g_obs_video_encoder_create(id, name, settings, hotkey_data) : nullptr;
}

obs_encoder_t* audio_encoder_create(const char* id, const char* name, obs_data_t* settings, size_t mixer_idx, obs_data_t* hotkey_data)
{
    return g_obs_audio_encoder_create ? g_obs_audio_encoder_create(id, name, settings, mixer_idx, hotkey_data) : nullptr;
}

void encoder_release(obs_encoder_t* encoder)
{
    if (g_obs_encoder_release && encoder) g_obs_encoder_release(encoder);
}

void encoder_set_video(obs_encoder_t* encoder, video_t* video)
{
    if (g_obs_encoder_set_video && encoder) g_obs_encoder_set_video(encoder, video);
}

void encoder_set_audio(obs_encoder_t* encoder, audio_t* audio)
{
    if (g_obs_encoder_set_audio && encoder) g_obs_encoder_set_audio(encoder, audio);
}

video_t* get_video()
{
    return g_obs_get_video ? g_obs_get_video() : nullptr;
}

audio_t* get_audio()
{
    return g_obs_get_audio ? g_obs_get_audio() : nullptr;
}

// Output functions
obs_output_t* output_create(const char* id, const char* name, obs_data_t* settings, obs_data_t* hotkey_data)
{
    return g_obs_output_create ? g_obs_output_create(id, name, settings, hotkey_data) : nullptr;
}

void output_release(obs_output_t* output)
{
    if (g_obs_output_release && output) g_obs_output_release(output);
}

void output_set_video_encoder(obs_output_t* output, obs_encoder_t* encoder)
{
    if (g_obs_output_set_video_encoder && output) g_obs_output_set_video_encoder(output, encoder);
}

void output_set_audio_encoder(obs_output_t* output, obs_encoder_t* encoder, size_t idx)
{
    if (g_obs_output_set_audio_encoder && output) g_obs_output_set_audio_encoder(output, encoder, idx);
}

void output_set_mixers(obs_output_t* output, uint32_t mixers)
{
    if (g_obs_output_set_mixers && output) g_obs_output_set_mixers(output, mixers);
}

void output_set_video_source(obs_output_t* output, obs_source_t* source)
{
    if (g_obs_output_set_video_source && output) g_obs_output_set_video_source(output, source);
}

bool output_start(obs_output_t* output)
{
    return g_obs_output_start && output ? g_obs_output_start(output) : false;
}

void output_stop(obs_output_t* output)
{
    if (g_obs_output_stop && output) g_obs_output_stop(output);
}

bool output_active(obs_output_t* output)
{
    return g_obs_output_active && output ? g_obs_output_active(output) : false;
}

signal_handler_t* output_get_signal_handler(obs_output_t* output)
{
    return g_obs_output_get_signal_handler && output ? g_obs_output_get_signal_handler(output) : nullptr;
}

void signal_handler_connect(signal_handler_t* handler, const char* signal, void (*callback)(void*, calldata_t*), void* data)
{
    if (g_signal_handler_connect && handler) g_signal_handler_connect(handler, signal, callback, data);
}

void output_signal(obs_output_t* output, const char* signal)
{
    if (g_obs_output_signal && output) g_obs_output_signal(output, signal);
}

const char* calldata_string(calldata_t* data, const char* name)
{
    return g_calldata_string && data ? g_calldata_string(data, name) : nullptr;
}

const char* output_get_last_error(obs_output_t* output)
{
    return g_obs_output_get_last_error && output ? g_obs_output_get_last_error(output) : nullptr;
}

bool output_can_begin_data_capture(obs_output_t* output, uint32_t flags)
{
    return g_obs_output_can_begin_data_capture && output ? g_obs_output_can_begin_data_capture(output, flags) : false;
}

uint32_t output_get_flags(obs_output_t* output)
{
    return g_obs_output_get_flags && output ? g_obs_output_get_flags(output) : 0;
}

const char* encoder_get_id(obs_encoder_t* encoder)
{
    return g_obs_encoder_get_id && encoder ? g_obs_encoder_get_id(encoder) : nullptr;
}

bool encoder_active(obs_encoder_t* encoder)
{
    return g_obs_encoder_active && encoder ? g_obs_encoder_active(encoder) : false;
}

const char* output_get_id(obs_output_t* output)
{
    return g_obs_output_get_id && output ? g_obs_output_get_id(output) : nullptr;
}

const char* output_get_name(obs_output_t* output)
{
    return g_obs_output_get_name && output ? g_obs_output_get_name(output) : nullptr;
}

obs_encoder_t* output_get_video_encoder(obs_output_t* output)
{
    return g_obs_output_get_video_encoder && output ? g_obs_output_get_video_encoder(output) : nullptr;
}

obs_encoder_t* output_get_audio_encoder(obs_output_t* output, size_t idx)
{
    return g_obs_output_get_audio_encoder && output ? g_obs_output_get_audio_encoder(output, idx) : nullptr;
}

const char* data_get_json(obs_data_t* data)
{
    return g_obs_data_get_json && data ? g_obs_data_get_json(data) : nullptr;
}

// Debug helper implementations
void debug_log_output_state(obs_output_t* output, const char* label)
{
    if (!output) {
        LOG_INFO(std::string("[DEBUG ") + label + "] Output is NULL");
        return;
    }

    const char* id = output_get_id(output);
    const char* name = output_get_name(output);
    uint32_t flags = output_get_flags(output);
    bool active = output_active(output);
    bool can_capture = output_can_begin_data_capture(output, 0);
    const char* last_error = output_get_last_error(output);

    obs_encoder_t* video_enc = output_get_video_encoder(output);
    obs_encoder_t* audio_enc0 = output_get_audio_encoder(output, 0);
    obs_encoder_t* audio_enc1 = output_get_audio_encoder(output, 1);

    LOG_INFO(std::string("[DEBUG ") + label + "] Output State:");
    LOG_INFO(std::string("  ID: ") + (id ? id : "null"));
    LOG_INFO(std::string("  Name: ") + (name ? name : "null"));
    LOG_INFO(std::string("  Flags: 0x") + std::to_string(flags));
    LOG_INFO(std::string("  Active: ") + (active ? "yes" : "no"));
    LOG_INFO(std::string("  Can capture: ") + (can_capture ? "yes" : "no"));
    LOG_INFO(std::string("  Last error: ") + (last_error ? last_error : "none"));
    LOG_INFO(std::string("  Video encoder: ") + (video_enc ? "connected" : "NULL"));
    LOG_INFO(std::string("  Audio encoder 0: ") + (audio_enc0 ? "connected" : "NULL"));
    LOG_INFO(std::string("  Audio encoder 1: ") + (audio_enc1 ? "connected" : "NULL"));

    if (video_enc) {
        const char* venc_id = encoder_get_id(video_enc);
        bool venc_active = encoder_active(video_enc);
        LOG_INFO(std::string("    Video encoder ID: ") + (venc_id ? venc_id : "null"));
        LOG_INFO(std::string("    Video encoder active: ") + (venc_active ? "yes" : "no"));
    }
    if (audio_enc0) {
        const char* aenc_id = encoder_get_id(audio_enc0);
        bool aenc_active = encoder_active(audio_enc0);
        LOG_INFO(std::string("    Audio0 encoder ID: ") + (aenc_id ? aenc_id : "null"));
        LOG_INFO(std::string("    Audio0 encoder active: ") + (aenc_active ? "yes" : "no"));
    }
}

void debug_log_encoder_state(obs_encoder_t* encoder, const char* label)
{
    if (!encoder) {
        LOG_INFO(std::string("[DEBUG ") + label + "] Encoder is NULL");
        return;
    }

    const char* id = encoder_get_id(encoder);
    bool active = encoder_active(encoder);

    LOG_INFO(std::string("[DEBUG ") + label + "] Encoder State:");
    LOG_INFO(std::string("  ID: ") + (id ? id : "null"));
    LOG_INFO(std::string("  Active: ") + (active ? "yes" : "no"));
}

// Procedure handler functions (for replay buffer save)
proc_handler_t* output_get_proc_handler(obs_output_t* output)
{
    return g_obs_output_get_proc_handler && output ? g_obs_output_get_proc_handler(output) : nullptr;
}

void calldata_init(calldata_t* data)
{
    if (g_calldata_init && data) g_calldata_init(data);
}

void calldata_free(calldata_t* data)
{
    if (g_calldata_free && data) g_calldata_free(data);
}

bool proc_handler_call(proc_handler_t* handler, const char* name, calldata_t* data)
{
    return g_proc_handler_call && handler ? g_proc_handler_call(handler, name, data) : false;
}

// Scene functions (needed for video rendering pipeline)
obs_scene_t* scene_create(const char* name)
{
    return g_obs_scene_create ? g_obs_scene_create(name) : nullptr;
}

void scene_release(obs_scene_t* scene)
{
    if (g_obs_scene_release && scene) g_obs_scene_release(scene);
}

obs_source_t* scene_get_source(const obs_scene_t* scene)
{
    return g_obs_scene_get_source && scene ? g_obs_scene_get_source(scene) : nullptr;
}

obs_sceneitem_t* scene_add(obs_scene_t* scene, obs_source_t* source)
{
    return g_obs_scene_add && scene && source ? g_obs_scene_add(scene, source) : nullptr;
}

} // namespace obs_api

} // namespace clipvault
