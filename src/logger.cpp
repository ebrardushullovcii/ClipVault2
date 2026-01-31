#include "logger.h"

#include <iostream>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <filesystem>

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

    filename_ = filename;
    
    // If existing log is too large, rotate it before starting fresh
    if (std::filesystem::exists(filename_) && 
        std::filesystem::file_size(filename_) > MAX_LOG_SIZE) {
        rotate_if_needed();
    }

    file_.open(filename_, std::ios::out | std::ios::trunc);
    if (!file_.is_open()) {
        std::cerr << "Failed to open log file: " << filename_ << std::endl;
        return false;
    }

    initialized_ = true;
    return true;
}

std::string Logger::get_rotated_filename(int index) const
{
    if (index == 0) {
        return filename_;
    }
    return filename_ + "." + std::to_string(index);
}

void Logger::rotate_if_needed()
{
    // Close current file
    if (file_.is_open()) {
        file_.close();
    }
    
    // Rotate existing backups: clipvault.log.2 -> clipvault.log.3, clipvault.log.1 -> clipvault.log.2
    for (int i = MAX_BACKUP_FILES - 1; i > 0; --i) {
        std::string old_name = get_rotated_filename(i);
        std::string new_name = get_rotated_filename(i + 1);
        
        if (std::filesystem::exists(old_name)) {
            if (std::filesystem::exists(new_name)) {
                std::filesystem::remove(new_name);
            }
            std::filesystem::rename(old_name, new_name);
        }
    }
    
    // Move current log to .1
    if (std::filesystem::exists(filename_)) {
        std::string backup_name = get_rotated_filename(1);
        if (std::filesystem::exists(backup_name)) {
            std::filesystem::remove(backup_name);
        }
        std::filesystem::rename(filename_, backup_name);
    }
    
    // Reopen new log file
    file_.open(filename_, std::ios::out | std::ios::trunc);
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

    // Check if log rotation is needed (check every ~100 writes to avoid overhead)
    static int write_count = 0;
    if (++write_count % 100 == 0 && file_.is_open()) {
        file_.flush();
        if (std::filesystem::file_size(filename_) > MAX_LOG_SIZE) {
            rotate_if_needed();
        }
    }

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
