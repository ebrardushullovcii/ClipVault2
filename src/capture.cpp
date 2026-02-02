#include "capture.h"
#include "logger.h"
#include "config.h"
#include "obs_core.h"
#include <windows.h>

namespace clipvault {

CaptureManager& CaptureManager::instance()
{
    static CaptureManager instance;
    return instance;
}

CaptureManager::~CaptureManager()
{
    shutdown();
}

bool CaptureManager::initialize()
{
    if (initialized_) {
        LOG_WARNING("Capture already initialized");
        return true;
    }

    LOG_INFO("Initializing capture sources...");

    if (!create_video_source()) {
        return false;
    }

    if (!create_audio_sources()) {
        // Cleanup video source if audio fails
        if (video_source_) {
            obs_api::source_release(video_source_);
            video_source_ = nullptr;
        }
        return false;
    }

    initialized_ = true;
    LOG_INFO("Capture sources initialized successfully!");
    return true;
}

void CaptureManager::shutdown()
{
    if (!initialized_) {
        return;
    }

    LOG_INFO("Shutting down capture sources...");

    if (microphone_) {
        obs_api::source_release(microphone_);
        microphone_ = nullptr;
    }

    if (desktop_audio_) {
        obs_api::source_release(desktop_audio_);
        desktop_audio_ = nullptr;
    }

    // Release scene first (it holds a ref to video_source_)
    if (scene_) {
        obs_api::scene_release(scene_);
        scene_ = nullptr;
    }

    if (video_source_) {
        obs_api::source_release(video_source_);
        video_source_ = nullptr;
    }

    initialized_ = false;
    LOG_INFO("Capture sources shutdown complete");
}

bool CaptureManager::create_video_source()
{
    const char* capture_method_used = "none";
    
    // Get monitor index from config
    int monitor_index = ConfigManager::instance().video().monitor;
    LOG_INFO("  Using monitor index: " + std::to_string(monitor_index));
    
    // Try monitor_capture with DXGI method first (most reliable for background capture)
    obs_data_t* settings = obs_api::data_create();
    obs_api::data_set_int(settings, "monitor", monitor_index);
    obs_api::data_set_bool(settings, "capture_cursor", true);
    obs_api::data_set_int(settings, "method", 1);  // 1 = DXGI (more reliable than WGC for background)
    
    video_source_ = obs_api::source_create("monitor_capture", "monitor_capture", settings, nullptr);
    obs_api::data_release(settings);
    
    if (video_source_) {
        capture_method_used = "monitor_capture";
        LOG_INFO("  Using monitor_capture (DXGI method - most reliable)");
    } else {
        // Try monitor_capture with WGC method as fallback
        settings = obs_api::data_create();
        obs_api::data_set_int(settings, "monitor", monitor_index);
        obs_api::data_set_bool(settings, "capture_cursor", true);
        obs_api::data_set_int(settings, "method", 0);  // 0 = WGC
        
        video_source_ = obs_api::source_create("monitor_capture", "monitor_capture", settings, nullptr);
        obs_api::data_release(settings);
        
        if (video_source_) {
            capture_method_used = "monitor_capture";
            LOG_INFO("  Using monitor_capture (WGC method)");
        } else {
            obs_api::data_release(settings);
            
            // Fallback to window_capture
            settings = obs_api::data_create();
            
            HWND foreground = GetForegroundWindow();
            if (foreground) {
                char window_title[256];
                GetWindowTextA(foreground, window_title, sizeof(window_title));
                LOG_INFO("  Using window_capture: " + std::string(window_title));
                obs_api::data_set_string(settings, "window", window_title);
            } else {
                LOG_INFO("  Using window_capture (no foreground window)");
            }
            
            video_source_ = obs_api::source_create("window_capture", "window_capture", settings, nullptr);
            
            if (video_source_) {
                capture_method_used = "window_capture";
            }
        }
        
        obs_api::data_release(settings);
    }

    if (!video_source_) {
        last_error_ = "Failed to create any capture source";
        LOG_ERROR(last_error_);
        
        // Last resort - try game_capture
        settings = obs_api::data_create();
        obs_api::data_set_string(settings, "capture_mode", "any_fullscreen");
        obs_api::data_set_bool(settings, "capture_cursor", true);
        LOG_INFO("  Using game_capture (any_fullscreen mode - last resort)");
        
        video_source_ = obs_api::source_create("game_capture", "game_capture", settings, nullptr);
        obs_api::data_release(settings);
        
        if (video_source_) {
            capture_method_used = "game_capture";
        }
    }

    if (!video_source_) {
        last_error_ = "Failed to create any video capture source";
        LOG_ERROR(last_error_);
        return false;
    }

    // CRITICAL: Create a scene and add the video source to it
    // In OBS, sources must be in a scene to produce output frames
    LOG_INFO("  Creating scene for video rendering...");
    scene_ = obs_api::scene_create("capture_scene");
    if (!scene_) {
        last_error_ = "Failed to create scene";
        LOG_ERROR(last_error_);
        obs_api::source_release(video_source_);
        video_source_ = nullptr;
        return false;
    }
    
    // Add the video source to the scene
    obs_sceneitem_t* item = obs_api::scene_add(scene_, video_source_);
    if (!item) {
        LOG_WARNING("  Failed to add video source to scene (source may still work)");
    } else {
        LOG_INFO("  Video source added to scene");
    }
    
    // Set the scene's source as the main output (this is what produces frames)
    obs_source_t* scene_source = obs_api::scene_get_source(scene_);
    if (!scene_source) {
        last_error_ = "Failed to get scene source";
        LOG_ERROR(last_error_);
        obs_api::scene_release(scene_);
        scene_ = nullptr;
        obs_api::source_release(video_source_);
        video_source_ = nullptr;
        return false;
    }
    
    obs_api::set_output_source(0, scene_source);
    LOG_INFO("  Scene set as output source (this enables video rendering)");

    LOG_INFO("  Video capture source created: " + std::string(capture_method_used));
    return true;
}

bool CaptureManager::create_audio_sources()
{
    const auto& audio_cfg = ConfigManager::instance().audio();

    // Create desktop audio (system audio - what you hear)
    if (audio_cfg.system_audio_enabled) {
        LOG_INFO("  Creating desktop audio capture...");

        obs_data_t* settings = obs_api::data_create();
        // Use device_id from config, default to "default" if empty
        std::string device_id = audio_cfg.system_audio_device_id.empty() ? "default" : audio_cfg.system_audio_device_id;
        LOG_INFO("    Using device: " + device_id);
        obs_api::data_set_string(settings, "device_id", device_id.c_str());
        // use_device_timing is recommended for output capture
        obs_api::data_set_bool(settings, "use_device_timing", true);

        desktop_audio_ = obs_api::source_create("wasapi_output_capture", "desktop_audio", settings, nullptr);
        obs_api::data_release(settings);

        if (!desktop_audio_) {
            last_error_ = "Failed to create desktop audio source";
            LOG_ERROR(last_error_);
            return false;
        }

        // CRITICAL: Activate the source to start capturing
        obs_api::source_activate(desktop_audio_);
        LOG_INFO("    Desktop audio source activated");

        // CRITICAL: Connect to output channel 1 (desktop audio channel)
        obs_api::set_output_source(1, desktop_audio_);
        LOG_INFO("    Desktop audio connected to output channel 1");

        // Route desktop audio to mixer track 1 (bit 0 = 0x01)
        obs_api::source_set_audio_mixers(desktop_audio_, 1);
        LOG_INFO("    Desktop audio -> Track 1");
    }

    // Create microphone capture
    if (audio_cfg.microphone_enabled) {
        LOG_INFO("  Creating microphone capture...");

        obs_data_t* settings = obs_api::data_create();
        // Use device_id from config, default to "default" if empty
        std::string device_id = audio_cfg.microphone_device_id.empty() ? "default" : audio_cfg.microphone_device_id;
        LOG_INFO("    Using device: " + device_id);
        obs_api::data_set_string(settings, "device_id", device_id.c_str());

        microphone_ = obs_api::source_create("wasapi_input_capture", "microphone", settings, nullptr);
        obs_api::data_release(settings);

        if (!microphone_) {
            last_error_ = "Failed to create microphone source";
            LOG_ERROR(last_error_);
            return false;
        }

        // CRITICAL: Activate the source to start capturing
        obs_api::source_activate(microphone_);
        LOG_INFO("    Microphone source activated");

        // CRITICAL: Connect to output channel 2 (microphone channel)
        obs_api::set_output_source(2, microphone_);
        LOG_INFO("    Microphone connected to output channel 2");

        // Route microphone to mixer track 2 (bit 1 = 0x02)
        obs_api::source_set_audio_mixers(microphone_, 2);
        LOG_INFO("    Microphone -> Track 2");
    }

    return true;
}

obs_source_t* CaptureManager::get_scene_source() const
{
    if (scene_) {
        return obs_api::scene_get_source(scene_);
    }
    return nullptr;
}

bool CaptureManager::is_producing_frames() const
{
    if (!video_source_ || !scene_) {
        return false;
    }
    
    // Check if source is active
    bool source_active = obs_api::source_active(video_source_);
    bool scene_active = obs_api::source_active(obs_api::scene_get_source(scene_));
    
    LOG_INFO("[CAPTURE] Frame production check:");
    LOG_INFO("  Video source active: " + std::string(source_active ? "YES" : "NO"));
    LOG_INFO("  Scene source active: " + std::string(scene_active ? "YES" : "NO"));
    
    return source_active && scene_active;
}

} // namespace clipvault
