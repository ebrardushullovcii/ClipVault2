#include "logger.h"

#include <iostream>
#include <chrono>
#include <iomanip>
#include <sstream>

namespace clipvault {

Logger& Logger::instance()
{
    static Logger instance;
    return instance;
}

Logger::~Logger()
{
    shutdown();
}

bool Logger::initialize(const std::string& filename)
{
    std::lock_guard<std::mutex> lock(mutex_);

    if (initialized_) {
        return true;
    }

    file_.open(filename, std::ios::out | std::ios::trunc);
    if (!file_.is_open()) {
        std::cerr << "Failed to open log file: " << filename << std::endl;
        return false;
    }

    initialized_ = true;
    return true;
}

void Logger::shutdown()
{
    std::lock_guard<std::mutex> lock(mutex_);

    if (file_.is_open()) {
        file_.close();
    }
    initialized_ = false;
}

void Logger::log(LogLevel level, const char* file, int line, const std::string& message)
{
    if (level < min_level_) {
        return;
    }

    std::lock_guard<std::mutex> lock(mutex_);

    // Get timestamp
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;

    std::tm tm_buf;
    localtime_s(&tm_buf, &time);

    // Level string
    const char* level_str = "???";
    switch (level) {
        case LogLevel::Debug:   level_str = "DEBUG"; break;
        case LogLevel::Info:    level_str = "INFO"; break;
        case LogLevel::Warning: level_str = "WARN"; break;
        case LogLevel::Error:   level_str = "ERROR"; break;
    }

    // Format message
    std::ostringstream ss;
    ss << std::put_time(&tm_buf, "%Y-%m-%d %H:%M:%S")
       << "." << std::setfill('0') << std::setw(3) << ms.count()
       << " [" << level_str << "] "
       << message;

    std::string formatted = ss.str();

    // Write to file
    if (file_.is_open()) {
        file_ << formatted << std::endl;
        file_.flush();
    }

    // Write to console
    if (console_output_) {
        std::cout << formatted << std::endl;
    }
}

} // namespace clipvault
