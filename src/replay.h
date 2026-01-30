#pragma once

#include <string>
#include <functional>

namespace clipvault {

// Forward declarations for OBS types (defined in .cpp to avoid header deps)
struct obs_output_t;
struct obs_encoder_t;

class ReplayManager {
public:
    static ReplayManager& instance();
    
    // Initialize replay buffer with encoders from EncoderManager
    // Must be called AFTER EncoderManager::initialize()
    bool initialize(int buffer_seconds);
    void shutdown();
    
    // Trigger save to output_path
    // Returns immediately, actual save happens async
    // Listen for "saved" signal or check is_save_pending()
    bool save_clip();
    
    // Check if save is in progress
    bool is_save_pending() const;
    
    // Check if replay buffer is running
    bool is_running() const { return initialized_; }
    
    // Get last error message
    const std::string& last_error() const { return last_error_; }
    
    // Callback for when save completes
    using SaveCallback = std::function<void(const std::string& path)>;
    void set_save_callback(SaveCallback callback) { save_callback_ = callback; }

private:
    ReplayManager() = default;
    ~ReplayManager();
    
    // OBS objects - forward declared to avoid exposing OBS headers
    void* replay_output_ = nullptr;  // Actually obs_output_t*
    
    bool initialized_ = false;
    bool save_pending_ = false;
    std::string last_error_;
    SaveCallback save_callback_;
    
    // Signal handler callbacks
    static void on_replay_saved(void* data, void* cd);  // Actually calldata_t*
    static void on_replay_stopped(void* data, void* cd);
};

} // namespace clipvault
