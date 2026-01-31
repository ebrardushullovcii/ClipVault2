#pragma once

#include <string>
#include <fstream>
#include <mutex>

namespace clipvault {

enum class LogLevel {
    Debug,
    Info,
    Warning,
    Error
};

class Logger {
public:
    static Logger& instance();

    bool initialize(const std::string& filename);
    void shutdown();

    void log(LogLevel level, const char* file, int line, const std::string& message);

    void set_level(LogLevel level) { min_level_ = level; }
    void set_console_output(bool enabled) { console_output_ = enabled; }

private:
    Logger() = default;
    ~Logger();

    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

    void rotate_if_needed();
    std::string get_rotated_filename(int index) const;

    std::ofstream file_;
    std::mutex mutex_;
    std::string filename_;
    LogLevel min_level_ = LogLevel::Info;
    bool console_output_ = true;
    bool initialized_ = false;
    
    // Log rotation: 10 MB max size, keep 3 backups
    static constexpr size_t MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
    static constexpr int MAX_BACKUP_FILES = 3;
};

} // namespace clipvault

// Convenience macros
#define LOG_DEBUG(msg) clipvault::Logger::instance().log(clipvault::LogLevel::Debug, __FILE__, __LINE__, msg)
#define LOG_INFO(msg) clipvault::Logger::instance().log(clipvault::LogLevel::Info, __FILE__, __LINE__, msg)
#define LOG_WARNING(msg) clipvault::Logger::instance().log(clipvault::LogLevel::Warning, __FILE__, __LINE__, msg)
#define LOG_ERROR(msg) clipvault::Logger::instance().log(clipvault::LogLevel::Error, __FILE__, __LINE__, msg)
