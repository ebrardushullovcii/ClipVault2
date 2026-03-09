#pragma once

#include <string>
#include <functional>
#include <thread>
#include <atomic>
#include <condition_variable>
#include <mutex>
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

    // Set the current game for the next save operation (thread-safe)
    void set_current_game(const std::string& game_name) {
        std::lock_guard<std::mutex> lock(current_game_mutex_);
        current_game_ = game_name;
    }
    // Get the current game (thread-safe, returns a copy)
    std::string current_game() const {
        std::lock_guard<std::mutex> lock(current_game_mutex_);
        return current_game_;
    }

    // Check status
    bool is_initialized() const { return initialized_; }
    bool is_active() const;
    bool is_save_pending() const { return save_pending_.load(); }
    const std::string& last_error() const { return last_error_; }
    const std::string& last_saved_file() const { return last_saved_file_; }

    // Callback for when save completes
    using SaveCallback = std::function<void(const std::string& path, bool success)>;
    void set_save_callback(SaveCallback callback) { save_callback_ = callback; }

    // Debug: log pipeline statistics
    void log_pipeline_stats();

private:
    enum class LifecycleState {
        Inactive,
        Starting,
        Active,
        Stopping,
    };

    ReplayManager() = default;
    ~ReplayManager();

    ReplayManager(const ReplayManager&) = delete;
    ReplayManager& operator=(const ReplayManager&) = delete;

    obs_output_t* replay_output_ = nullptr;

    bool initialized_ = false;
    mutable std::mutex lifecycle_mutex_;
    std::condition_variable lifecycle_cv_;
    LifecycleState lifecycle_state_ = LifecycleState::Inactive;
    bool shutting_down_ = false;
    std::atomic<bool> save_pending_{false};
    std::string last_error_;
    std::string last_saved_file_;
    std::string current_game_;  // Game name for next save operation (protected by mutex)
    mutable std::mutex current_game_mutex_;
    SaveCallback save_callback_;

    // Render thread (for periodic health checks - OBS handles frame production)
    std::thread render_thread_;
    std::atomic<bool> render_thread_running_{false};

    // Performance metrics
    std::atomic<uint64_t> frame_count_{0};
    std::atomic<uint64_t> last_stats_time_{0};
    std::atomic<uint64_t> save_start_time_{0};
    std::atomic<uint64_t> save_start_tick_{0};

    // Start/stop render thread
    void start_render_thread();
    void stop_render_thread();
    void render_thread_loop();

    // Performance logging
    void log_performance_stats();

    // Lifecycle helpers
    LifecycleState lifecycle_state() const;
    void set_lifecycle_state(LifecycleState state);
    static const char* lifecycle_state_name(LifecycleState state);
    void clear_save_pending(const char* context);

    // Signal callbacks
    static void on_replay_saved(void* data, calldata_t* calldata);
    static void on_replay_stopped(void* data, calldata_t* calldata);
};

} // namespace clipvault
