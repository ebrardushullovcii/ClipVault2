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

// Encoder functions
typedef obs_encoder_t* (*obs_video_encoder_create_t)(const char *id, const char *name, obs_data_t *settings, obs_data_t *hotkey_data);
typedef obs_encoder_t* (*obs_audio_encoder_create_t)(const char *id, const char *name, obs_data_t *settings, size_t mixer_idx, obs_data_t *hotkey_data);
typedef void (*obs_encoder_release_t)(obs_encoder_t *encoder);
typedef void (*obs_encoder_set_video_t)(obs_encoder_t *encoder, video_t *video);
typedef void (*obs_encoder_set_audio_t)(obs_encoder_t *encoder, audio_t *audio);
typedef video_t* (*obs_get_video_t)(void);
typedef audio_t* (*obs_get_audio_t)(void);

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

// Encoder function pointers
static obs_video_encoder_create_t g_obs_video_encoder_create = nullptr;
static obs_audio_encoder_create_t g_obs_audio_encoder_create = nullptr;
static obs_encoder_release_t g_obs_encoder_release = nullptr;
static obs_encoder_set_video_t g_obs_encoder_set_video = nullptr;
static obs_encoder_set_audio_t g_obs_encoder_set_audio = nullptr;
static obs_get_video_t g_obs_get_video = nullptr;
static obs_get_audio_t g_obs_get_audio = nullptr;

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

    // Step 4: Reset video
    LOG_INFO("  Step 4: obs_reset_video()");
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

    // Step 5: Reset audio
    LOG_INFO("  Step 5: obs_reset_audio()");
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

    // Step 6: Load modules (plugins)
    LOG_INFO("  Step 6: Loading modules");
    g_obs_load_all_modules();
    g_obs_post_load_modules();
    LOG_INFO("    Modules loaded");

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

} // namespace obs_api

} // namespace clipvault
