#pragma once

#include <string>
#include <functional>
#include <thread>
#include <atomic>
#include "obs_core.h"

// Forward declaration
struct obs_output;
typedef struct obs_output obs_output_t;

namespace clipvault {

class ReplayManager {
public:
    static ReplayManager& instance();

    // Initialize replay buffer
    bool initialize();
    void shutdown();

    // Start/stop the replay buffer
    bool start();
    void stop();

    // Save the current buffer to file
    bool save_clip();

    // Check status
    bool is_initialized() const { return initialized_; }
    bool is_active() const { return active_; }
    bool is_save_pending() const { return save_pending_; }
    const std::string& last_error() const { return last_error_; }
    const std::string& last_saved_file() const { return last_saved_file_; }

    // Callback for when save completes
    using SaveCallback = std::function<void(const std::string& path, bool success)>;
    void set_save_callback(SaveCallback callback) { save_callback_ = callback; }
    
    // Debug: log pipeline statistics
    void log_pipeline_stats();

private:
    ReplayManager() = default;
    ~ReplayManager();

    ReplayManager(const ReplayManager&) = delete;
    ReplayManager& operator=(const ReplayManager&) = delete;

    obs_output_t* replay_output_ = nullptr;

    bool initialized_ = false;
    bool active_ = false;
    bool save_pending_ = false;
    std::string last_error_;
    std::string last_saved_file_;
    SaveCallback save_callback_;

    // Render thread (for periodic health checks - OBS handles frame production)
    std::thread render_thread_;
    std::atomic<bool> render_thread_running_{false};

    // Performance metrics
    std::atomic<uint64_t> frame_count_{0};
    std::atomic<uint64_t> last_stats_time_{0};
    std::atomic<uint64_t> save_start_time_{0};

    // Start/stop render thread
    void start_render_thread();
    void stop_render_thread();
    void render_thread_loop();

    // Performance logging
    void log_performance_stats();

    // Signal callbacks
    static void on_replay_saved(void* data, calldata_t* calldata);
    static void on_replay_stopped(void* data, calldata_t* calldata);
};

} // namespace clipvault
