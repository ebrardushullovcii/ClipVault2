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

    std::ofstream file_;
    std::mutex mutex_;
    LogLevel min_level_ = LogLevel::Info;
    bool console_output_ = true;
    bool initialized_ = false;
};

} // namespace clipvault

// Convenience macros
#define LOG_DEBUG(msg) clipvault::Logger::instance().log(clipvault::LogLevel::Debug, __FILE__, __LINE__, msg)
#define LOG_INFO(msg) clipvault::Logger::instance().log(clipvault::LogLevel::Info, __FILE__, __LINE__, msg)
#define LOG_WARNING(msg) clipvault::Logger::instance().log(clipvault::LogLevel::Warning, __FILE__, __LINE__, msg)
#define LOG_ERROR(msg) clipvault::Logger::instance().log(clipvault::LogLevel::Error, __FILE__, __LINE__, msg)
