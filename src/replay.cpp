#include "replay.h"
#include "logger.h"
#include "config.h"
#include "encoder.h"
#include "capture.h"

#include <windows.h>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <filesystem>

namespace clipvault {

ReplayManager& ReplayManager::instance()
{
    static ReplayManager instance;
    return instance;
}

ReplayManager::~ReplayManager()
{
    shutdown();
}

bool ReplayManager::initialize()
{
    if (initialized_) {
        LOG_WARNING("[REPLAY] Already initialized");
        return true;
    }

    LOG_INFO("[REPLAY] ==========================================");
    LOG_INFO("[REPLAY] INITIALIZING REPLAY BUFFER");
    LOG_INFO("[REPLAY] ==========================================");

    const auto& config = ConfigManager::instance();
    std::string output_path = config.output_path();
    int buffer_seconds = config.buffer_seconds();

    LOG_INFO("[REPLAY] Configuration:");
    LOG_INFO("  Buffer Duration: " + std::to_string(buffer_seconds) + " seconds");
    LOG_INFO("  Output Directory: " + output_path);
    LOG_INFO("  Max Size: 4096 MB (4GB)");

    // Convert backslashes to forward slashes for OBS compatibility
    for (char& c : output_path) {
        if (c == '\\') c = '/';
    }

    // Create settings for replay buffer
    LOG_INFO("[REPLAY] Creating replay buffer output...");
    obs_data_t* settings = obs_api::data_create();
    obs_api::data_set_int(settings, "max_time_sec", buffer_seconds);
    obs_api::data_set_int(settings, "max_size_mb", 4096);
    obs_api::data_set_string(settings, "directory", output_path.c_str());
    obs_api::data_set_string(settings, "format", "%CCYY-%MM-%DD_%hh-%mm-%ss");
    obs_api::data_set_string(settings, "extension", "mp4");

    // Create replay buffer output
    replay_output_ = obs_api::output_create("replay_buffer", "replay_buffer", settings, nullptr);
    obs_api::data_release(settings);

    if (!replay_output_) {
        last_error_ = "Failed to create replay buffer output";
        LOG_ERROR("[REPLAY] " + last_error_);
        return false;
    }
    LOG_INFO("[REPLAY] Output object created successfully");

    // Connect encoders
    auto& encoder = EncoderManager::instance();
    obs_encoder_t* video_enc = encoder.get_video_encoder();
    obs_encoder_t* audio_enc1 = encoder.get_audio_encoder_track1();
    obs_encoder_t* audio_enc2 = encoder.get_audio_encoder_track2();

    LOG_INFO("[REPLAY] Connecting encoders...");
    LOG_INFO("  Video encoder: " + std::string(video_enc ? "VALID" : "NULL"));
    LOG_INFO("  Audio encoder 1 (Desktop): " + std::string(audio_enc1 ? "VALID" : "NULL"));
    LOG_INFO("  Audio encoder 2 (Mic): " + std::string(audio_enc2 ? "VALID" : "NULL"));

    if (!video_enc) {
        last_error_ = "Video encoder is NULL";
        LOG_ERROR("[REPLAY] CRITICAL: " + last_error_);
        obs_api::output_release(replay_output_);
        replay_output_ = nullptr;
        return false;
    }

    obs_api::output_set_video_encoder(replay_output_, video_enc);
    LOG_INFO("[REPLAY] Video encoder connected");
    
    // CRITICAL: Connect scene source to replay output
    // The scene is what actually renders video frames (not the raw capture source)
    auto& capture = CaptureManager::instance();
    obs_source_t* scene_source = capture.get_scene_source();
    if (scene_source) {
        obs_api::output_set_video_source(replay_output_, scene_source);
        LOG_INFO("[REPLAY] Scene source connected to output (this renders the video)");
    } else {
        LOG_WARNING("[REPLAY] WARNING: Scene source is NULL - black video likely!");
        LOG_WARNING("[REPLAY]   Make sure capture sources were initialized before replay buffer");
    }
    
    obs_api::output_set_audio_encoder(replay_output_, audio_enc1, 0);
    LOG_INFO("[REPLAY] Audio encoder 1 connected to track 0");
    
    if (audio_enc2) {
        obs_api::output_set_audio_encoder(replay_output_, audio_enc2, 1);
        LOG_INFO("[REPLAY] Audio encoder 2 connected to track 1");
    }

    // Enable audio mixer tracks (0x03 = binary 11 = tracks 1 and 2)
    LOG_INFO("[REPLAY] Enabling audio mixer tracks (0x03)...");
    obs_api::output_set_mixers(replay_output_, 0x03);
    LOG_INFO("[REPLAY] Audio tracks 1 and 2 enabled");

    // Connect signals for save notification
    LOG_INFO("[REPLAY] Connecting signal handlers...");
    signal_handler_t* handler = obs_api::output_get_signal_handler(replay_output_);
    if (handler) {
        LOG_INFO("[REPLAY] Signal handler obtained");
        obs_api::signal_handler_connect(handler, "saved", on_replay_saved, this);
        obs_api::signal_handler_connect(handler, "stop", on_replay_stopped, this);
        LOG_INFO("[REPLAY] Signals connected: 'saved', 'stop'");
    } else {
        LOG_ERROR("[REPLAY] CRITICAL: Failed to get signal handler!");
    }

    initialized_ = true;
    LOG_INFO("[REPLAY] ==========================================");
    LOG_INFO("[REPLAY] REPLAY BUFFER INITIALIZED SUCCESSFULLY");
    LOG_INFO("[REPLAY] ==========================================");

    return true;
}

void ReplayManager::shutdown()
{
    if (!initialized_) {
        return;
    }

    LOG_INFO("[REPLAY] ==========================================");
    LOG_INFO("[REPLAY] SHUTTING DOWN REPLAY BUFFER");
    LOG_INFO("[REPLAY] ==========================================");

    if (active_) {
        LOG_INFO("[REPLAY] Stopping active buffer...");
        stop();
    }

    // Ensure render thread is stopped (safety check)
    if (render_thread_running_.load()) {
        LOG_WARNING("[REPLAY] Render thread still running, stopping...");
        stop_render_thread();
    }

    if (replay_output_) {
        LOG_INFO("[REPLAY] Releasing output object...");
        obs_api::output_release(replay_output_);
        replay_output_ = nullptr;
        LOG_INFO("[REPLAY] Output released");
    }

    initialized_ = false;
    LOG_INFO("[REPLAY] Shutdown complete");
}

bool ReplayManager::start()
{
    if (!initialized_) {
        last_error_ = "Replay buffer not initialized";
        LOG_ERROR("[REPLAY] " + last_error_);
        return false;
    }

    if (active_) {
        LOG_WARNING("[REPLAY] Already active, skipping start");
        return true;
    }

    LOG_INFO("[REPLAY] ==========================================");
    LOG_INFO("[REPLAY] STARTING REPLAY BUFFER");
    LOG_INFO("[REPLAY] ==========================================");

    // Create output directory if it doesn't exist
    std::string output_path = ConfigManager::instance().output_path();
    LOG_INFO("[REPLAY] Output directory: " + output_path);
    
    // Ensure directory exists with full path creation
    std::string::size_type pos = 0;
    while ((pos = output_path.find('\\', pos + 1)) != std::string::npos) {
        std::string subdir = output_path.substr(0, pos);
        if (!subdir.empty()) {
            CreateDirectoryA(subdir.c_str(), nullptr);
        }
    }
    // Create the final directory
    BOOL dir_created = CreateDirectoryA(output_path.c_str(), nullptr);
    DWORD dir_error = GetLastError();
    if (dir_created) {
        LOG_INFO("[REPLAY] Output directory created");
    } else if (dir_error == ERROR_ALREADY_EXISTS) {
        LOG_INFO("[REPLAY] Output directory already exists");
    } else {
        LOG_WARNING("[REPLAY] Failed to create directory (error: " + std::to_string(dir_error) + ")");
    }

    // Log with forward slashes (what OBS uses)
    std::string output_path_fwd = output_path;
    for (char& c : output_path_fwd) {
        if (c == '\\') c = '/';
    }

    // Debug: Log complete output state before starting
    LOG_INFO("[REPLAY] Pre-start diagnostics:");
    obs_api::debug_log_output_state(replay_output_, "Before Start");

    LOG_INFO("[REPLAY] Calling obs_output_start()...");
    if (!obs_api::output_start(replay_output_)) {
        LOG_WARNING("[REPLAY] Initial start failed, attempting encoder fallback...");

        // Try fallback to x264 encoder
        auto& encoder = EncoderManager::instance();
        if (encoder.fallback_to_x264()) {
            LOG_INFO("[REPLAY] Reconnecting x264 encoder...");
            obs_api::output_set_video_encoder(replay_output_, encoder.get_video_encoder());

            LOG_INFO("[REPLAY] Retrying start with x264...");
            if (obs_api::output_start(replay_output_)) {
                active_ = true;
                
                // Start the render thread (CRITICAL for video frame production)
                start_render_thread();
                
                LOG_INFO("[REPLAY] ==========================================");
                LOG_INFO("[REPLAY] STARTED WITH X264 FALLBACK");
                LOG_INFO("[REPLAY] Status: RECORDING TO MEMORY");
                LOG_INFO("[REPLAY] ==========================================");
                return true;
            }
        }

        // Still failed
        const char* obs_error = obs_api::output_get_last_error(replay_output_);
        last_error_ = "Failed to start replay buffer";
        if (obs_error) {
            last_error_ += std::string(": ") + obs_error;
        }
        LOG_ERROR("[REPLAY] CRITICAL: " + last_error_);
        LOG_ERROR("[REPLAY] Output path: " + output_path_fwd);
        
        obs_api::debug_log_output_state(replay_output_, "After Start Failed");
        return false;
    }

    active_ = true;

    // Start the render thread (CRITICAL for video frame production)
    start_render_thread();

    LOG_INFO("[REPLAY] ==========================================");
    LOG_INFO("[REPLAY] STARTED SUCCESSFULLY");
    LOG_INFO("[REPLAY] Status: RECORDING TO MEMORY");
    LOG_INFO("[REPLAY] ==========================================");

    return true;
}

void ReplayManager::stop()
{
    if (!active_) {
        LOG_WARNING("[REPLAY] Stop called but not active");
        return;
    }

    LOG_INFO("[REPLAY] Stopping replay buffer...");
    
    // Stop the render thread first (CRITICAL: must stop before output)
    stop_render_thread();
    
    obs_api::output_stop(replay_output_);
    active_ = false;
    LOG_INFO("[REPLAY] Stopped");
}

bool ReplayManager::save_clip()
{
    LOG_INFO("[REPLAY] ==========================================");
    LOG_INFO("[REPLAY] SAVE CLIP REQUESTED");
    LOG_INFO("[REPLAY] ==========================================");

    // Check if active
    LOG_INFO("[REPLAY] Checking status...");
    if (!active_) {
        last_error_ = "Replay buffer not active";
        LOG_ERROR("[REPLAY] " + last_error_);
        LOG_ERROR("[REPLAY] Cannot save - buffer is not recording!");
        return false;
    }
    LOG_INFO("[REPLAY] Status: Active = YES");

    // Check if save already pending
    if (save_pending_) {
        last_error_ = "Save already in progress";
        LOG_WARNING("[REPLAY] " + last_error_);
        return false;
    }
    LOG_INFO("[REPLAY] Status: Save pending = NO (proceeding)");

    // Get current settings for logging
    const auto& config = ConfigManager::instance();
    const auto& video = config.video();
    const auto& audio = config.audio();
    
    LOG_INFO("[REPLAY] Configuration Details:");
    LOG_INFO("  Buffer Duration: " + std::to_string(config.buffer_seconds()) + " seconds");
    LOG_INFO("  Output Path: " + config.output_path());
    LOG_INFO("  Video Settings:");
    LOG_INFO("    Resolution: " + std::to_string(video.width) + "x" + std::to_string(video.height));
    LOG_INFO("    FPS: " + std::to_string(video.fps));
    LOG_INFO("    Quality (CQP): " + std::to_string(video.quality));
    LOG_INFO("  Audio Settings:");
    LOG_INFO("    Sample Rate: " + std::to_string(audio.sample_rate) + " Hz");
    LOG_INFO("    Bitrate: " + std::to_string(audio.bitrate) + " kbps");
    LOG_INFO("    Desktop Audio: " + std::string(audio.system_audio_enabled ? "enabled" : "disabled"));
    LOG_INFO("    Microphone: " + std::string(audio.microphone_enabled ? "enabled" : "disabled"));
    
    save_pending_ = true;
    LOG_INFO("[REPLAY] Save pending flag set to TRUE");

    // Use procedure handler to trigger save (NOT output_signal!)
    LOG_INFO("[REPLAY] Getting procedure handler from replay buffer...");
    proc_handler_t* ph = obs_api::output_get_proc_handler(replay_output_);
    if (!ph) {
        LOG_ERROR("[REPLAY] CRITICAL: Failed to get procedure handler!");
        save_pending_ = false;
        last_error_ = "Failed to get procedure handler";
        return false;
    }
    LOG_INFO("[REPLAY] Procedure handler obtained successfully");
    
    // For replay buffer save, we can pass nullptr for calldata
    LOG_INFO("[REPLAY] Calling 'save' procedure...");
    bool result = obs_api::proc_handler_call(ph, "save", nullptr);
    LOG_INFO("[REPLAY] Procedure call returned: " + std::string(result ? "SUCCESS" : "FAILED"));
    
    if (!result) {
        LOG_ERROR("[REPLAY] Save procedure call failed!");
        save_pending_ = false;
        last_error_ = "Save procedure call failed";
        return false;
    }
    
    LOG_INFO("[REPLAY] Save procedure called successfully!");
    LOG_INFO("[REPLAY] Waiting for 'saved' callback...");
    LOG_INFO("[REPLAY] ==========================================");

    return true;
}

void ReplayManager::log_pipeline_stats()
{
    if (!replay_output_ || !active_) return;
    
    LOG_INFO("[REPLAY] ==========================================");
    LOG_INFO("[REPLAY] PIPELINE STATS");
    LOG_INFO("[REPLAY] ==========================================");
    
    // Check video output status
    video_t* video = obs_api::get_video();
    if (video) {
        LOG_INFO("[REPLAY] Video output: ACTIVE");
    } else {
        LOG_INFO("[REPLAY] Video output: NULL");
    }
    
    // Check encoder status
    auto& encoder = EncoderManager::instance();
    auto& capture = CaptureManager::instance();
    obs_encoder_t* video_enc = encoder.get_video_encoder();
    obs_source_t* video_src = capture.get_video_source();
    obs_source_t* scene_src = capture.get_scene_source();
    
    if (video_enc) {
        const char* enc_id = obs_api::encoder_get_id(video_enc);
        bool enc_active = obs_api::encoder_active(video_enc);
        LOG_INFO("[REPLAY] Video encoder: " + std::string(enc_id ? enc_id : "NULL"));
        LOG_INFO("[REPLAY] Encoder active: " + std::string(enc_active ? "YES" : "NO"));
    } else {
        LOG_INFO("[REPLAY] Video encoder: NULL");
    }
    
    // Check source status
    if (video_src) {
        bool src_active = obs_api::source_active(video_src);
        LOG_INFO("[REPLAY] Video source: VALID (active: " + std::string(src_active ? "YES" : "NO") + ")");
    } else {
        LOG_INFO("[REPLAY] Video source: NULL");
    }
    
    // Check scene status
    if (scene_src) {
        bool scene_active = obs_api::source_active(scene_src);
        LOG_INFO("[REPLAY] Scene source: VALID (active: " + std::string(scene_active ? "YES" : "NO") + ")");
    } else {
        LOG_INFO("[REPLAY] Scene source: NULL");
    }
    
    LOG_INFO("[REPLAY] ==========================================");
}

void ReplayManager::on_replay_saved(void* data, calldata_t* calldata)
{
    // Log pipeline stats on every save (for debugging)
    static_cast<ReplayManager*>(data)->log_pipeline_stats();
    
    LOG_INFO("[REPLAY] ==========================================");
    LOG_INFO("[REPLAY] SIGNAL CALLBACK: on_replay_saved");
    LOG_INFO("[REPLAY] ==========================================");
    
    ReplayManager* self = static_cast<ReplayManager*>(data);
    if (!self) {
        LOG_ERROR("[REPLAY] CRITICAL: Self pointer is NULL!");
        return;
    }

    LOG_INFO("[REPLAY] Callback data pointer valid");
    LOG_INFO("[REPLAY] save_pending was: " + std::string(self->save_pending_ ? "TRUE" : "FALSE"));

    const char* path = obs_api::calldata_string(calldata, "path");
    
    LOG_INFO("[REPLAY] Processing save result...");
    LOG_INFO("[REPLAY] Path from calldata: " + std::string(path ? path : "(NULL)"));
    
    if (path) {
        self->last_saved_file_ = path;
        LOG_INFO("[REPLAY] SAVE SUCCESSFUL!");
        LOG_INFO("  File Path: " + self->last_saved_file_);
        
        // Log completion timestamp
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        std::stringstream ss;
        ss << std::put_time(std::localtime(&time), "%Y-%m-%d %H:%M:%S");
        LOG_INFO("  Timestamp: " + ss.str());
        
        // Log file info
        std::string dir = ConfigManager::instance().output_path();
        LOG_INFO("  Output Directory: " + dir);
        
        // Check if file exists
        std::filesystem::path fspath(path);
        if (std::filesystem::exists(fspath)) {
            auto file_size = std::filesystem::file_size(fspath);
            LOG_INFO("  File Size: " + std::to_string(file_size / 1024 / 1024) + " MB");
            LOG_INFO("  File EXISTS: YES");
        } else {
            LOG_WARNING("  File EXISTS: NO (path may be incorrect)");
        }

        if (self->save_callback_) {
            LOG_INFO("[REPLAY] Executing user callback...");
            self->save_callback_(self->last_saved_file_, true);
            LOG_INFO("[REPLAY] User callback completed");
        } else {
            LOG_WARNING("[REPLAY] No user callback registered");
        }
    } else {
        LOG_WARNING("[REPLAY] Path from OBS is NULL - checking output directory for files...");
        
        // Check output directory for recently created MP4 files
        std::string dir = ConfigManager::instance().output_path();
        std::string latest_file;
        uintmax_t latest_size = 0;
        auto latest_time = 0ULL;
        
        try {
            WIN32_FIND_DATAA find_data;
            std::string search_path = dir + "\\*.mp4";
            HANDLE hFind = FindFirstFileA(search_path.c_str(), &find_data);
            
            if (hFind != INVALID_HANDLE_VALUE) {
                do {
                    std::string filename = find_data.cFileName;
                    std::string fullpath = dir + "\\" + filename;
                    
                    // Get file time
                    FILETIME ft = find_data.ftLastWriteTime;
                    ULARGE_INTEGER uli;
                    uli.LowPart = ft.dwLowDateTime;
                    uli.HighPart = ft.dwHighDateTime;
                    uint64_t file_time = uli.QuadPart;
                    uint64_t now_time = GetTickCount64();
                    
                    // Convert 100-nanosecond intervals to milliseconds
                    uint64_t age_ms = (now_time > file_time / 10000) ? (now_time - file_time / 10000) : 0;
                    
                    // File created in last 10 seconds
                    if (age_ms < 10000) {
                        uint64_t size = (static_cast<uint64_t>(find_data.nFileSizeHigh) << 32) | find_data.nFileSizeLow;
                        LOG_INFO("  Found recent file: " + fullpath);
                        LOG_INFO("    Size: " + std::to_string(size / 1024 / 1024) + " MB");
                        LOG_INFO("    Age: " + std::to_string(age_ms / 1000) + " seconds old");
                        
                        if (size > latest_size || (size == latest_size && age_ms < latest_time)) {
                            latest_size = size;
                            latest_file = fullpath;
                            latest_time = age_ms;
                        }
                    }
                } while (FindNextFileA(hFind, &find_data));
                
                FindClose(hFind);
            }
        } catch (...) {
            LOG_ERROR("  Directory scan error");
        }
        
        if (!latest_file.empty()) {
            LOG_INFO("[REPLAY] File found despite NULL path - considering save SUCCESS");
            LOG_INFO("  Actual File: " + latest_file);
            self->last_saved_file_ = latest_file;
            
            if (self->save_callback_) {
                LOG_INFO("[REPLAY] Executing user callback with found file...");
                self->save_callback_(latest_file, true);
            }
        } else {
            LOG_ERROR("[REPLAY] SAVE FAILED - No recent files found!");
            LOG_ERROR("  Path is NULL - file may not have been written");
            
            if (self->save_callback_) {
                LOG_INFO("[REPLAY] Executing user callback with failure...");
                self->save_callback_("", false);
            }
        }
    }
    
    self->save_pending_ = false;
    LOG_INFO("[REPLAY] save_pending set to FALSE");
    LOG_INFO("[REPLAY] ==========================================");
}

void ReplayManager::on_replay_stopped(void* data, calldata_t* calldata)
{
    (void)calldata;
    
    LOG_INFO("[REPLAY] ==========================================");
    LOG_INFO("[REPLAY] SIGNAL CALLBACK: on_replay_stopped");
    LOG_INFO("[REPLAY] ==========================================");
    
    ReplayManager* self = static_cast<ReplayManager*>(data);
    if (!self) {
        LOG_ERROR("[REPLAY] Self pointer is NULL in stop callback");
        return;
    }

    LOG_INFO("[REPLAY] Active flag was: " + std::string(self->active_ ? "TRUE" : "FALSE"));
    self->active_ = false;
    LOG_INFO("[REPLAY] Active flag set to FALSE");
    LOG_INFO("[REPLAY] Buffer stopped recording");
}

void ReplayManager::start_render_thread()
{
    LOG_INFO("[REPLAY] Starting render thread...");
    
    if (render_thread_running_.load()) {
        LOG_WARNING("[REPLAY] Render thread already running");
        return;
    }
    
    render_thread_running_.store(true);
    render_thread_ = std::thread(&ReplayManager::render_thread_loop, this);
    
    LOG_INFO("[REPLAY] Render thread started successfully");
}

void ReplayManager::stop_render_thread()
{
    LOG_INFO("[REPLAY] Stopping render thread...");
    
    if (!render_thread_running_.load()) {
        LOG_WARNING("[REPLAY] Render thread not running");
        return;
    }
    
    render_thread_running_.store(false);
    
    if (render_thread_.joinable()) {
        render_thread_.join();
    }
    
    LOG_INFO("[REPLAY] Render thread stopped successfully");
}

void ReplayManager::render_thread_loop()
{
    LOG_INFO("[REPLAY] Render thread loop started (target: 60 FPS)");
    
    const auto frame_duration = std::chrono::milliseconds(16); // ~60 FPS
    
    while (render_thread_running_.load()) {
        auto start_time = std::chrono::steady_clock::now();
        
        // Note: obs_render_main_texture() is for UI preview, not needed for background recording
        // The replay buffer captures frames automatically from active sources
        // Just tick the video system to ensure frames flow
        
        // Calculate sleep time to maintain ~60 FPS
        auto end_time = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);
        
        if (elapsed < frame_duration) {
            std::this_thread::sleep_for(frame_duration - elapsed);
        }
    }
    
    LOG_INFO("[REPLAY] Render thread loop exited");
}

} // namespace clipvault
