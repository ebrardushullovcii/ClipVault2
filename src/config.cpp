#include "config.h"
#include "logger.h"

#include <fstream>
#include <sstream>
#include <algorithm>

namespace clipvault {

// Simple JSON value extraction helpers
namespace {

std::string trim(const std::string& s) {
    size_t start = s.find_first_not_of(" \t\n\r");
    if (start == std::string::npos) return "";
    size_t end = s.find_last_not_of(" \t\n\r");
    return s.substr(start, end - start + 1);
}

std::string unescape_json_string(const std::string& s) {
    std::string result;
    result.reserve(s.size());
    for (size_t i = 0; i < s.size(); i++) {
        if (s[i] == '\\' && i + 1 < s.size()) {
            char next = s[i + 1];
            switch (next) {
                case '\\': result += '\\'; i++; break;
                case '"': result += '"'; i++; break;
                case 'n': result += '\n'; i++; break;
                case 'r': result += '\r'; i++; break;
                case 't': result += '\t'; i++; break;
                case '/': result += '/'; i++; break;
                default: result += s[i]; break;
            }
        } else {
            result += s[i];
        }
    }
    return result;
}

std::string extract_string(const std::string& json, const std::string& key) {
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return "";

    pos = json.find(':', pos);
    if (pos == std::string::npos) return "";

    pos = json.find('"', pos + 1);
    if (pos == std::string::npos) return "";

    // Find end quote, handling escaped quotes
    size_t end = pos + 1;
    while (end < json.size()) {
        if (json[end] == '"' && json[end - 1] != '\\') break;
        end++;
    }
    if (end >= json.size()) return "";

    return unescape_json_string(json.substr(pos + 1, end - pos - 1));
}

int extract_int(const std::string& json, const std::string& key, int default_val = 0) {
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return default_val;

    pos = json.find(':', pos);
    if (pos == std::string::npos) return default_val;

    pos++;
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;

    size_t end = pos;
    while (end < json.size() && (isdigit(json[end]) || json[end] == '-')) end++;

    if (end == pos) return default_val;

    try {
        return std::stoi(json.substr(pos, end - pos));
    } catch (...) {
        return default_val;
    }
}

bool extract_bool(const std::string& json, const std::string& key, bool default_val = false) {
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return default_val;

    pos = json.find(':', pos);
    if (pos == std::string::npos) return default_val;

    pos++;
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;

    if (json.substr(pos, 4) == "true") return true;
    if (json.substr(pos, 5) == "false") return false;

    return default_val;
}

std::string extract_object(const std::string& json, const std::string& key) {
    std::string search = "\"" + key + "\"";
    size_t pos = json.find(search);
    if (pos == std::string::npos) return "";

    pos = json.find('{', pos);
    if (pos == std::string::npos) return "";

    int depth = 1;
    size_t start = pos;
    pos++;

    while (pos < json.size() && depth > 0) {
        if (json[pos] == '{') depth++;
        else if (json[pos] == '}') depth--;
        pos++;
    }

    return json.substr(start, pos - start);
}

} // anonymous namespace

ConfigManager& ConfigManager::instance() {
    static ConfigManager instance;
    return instance;
}

bool ConfigManager::load(const std::string& filepath) {
    LOG_INFO("Loading config from: " + filepath);

    std::ifstream file(filepath);
    if (!file.is_open()) {
        LOG_WARNING("Config file not found, using defaults: " + filepath);
        return false;
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string json = buffer.str();

    // Parse root level
    std::string output_path = extract_string(json, "output_path");
    if (!output_path.empty()) {
        config_.output_path = output_path;
    }

    config_.buffer_seconds = extract_int(json, "buffer_seconds", config_.buffer_seconds);

    // Parse video section
    std::string video_json = extract_object(json, "video");
    if (!video_json.empty()) {
        config_.video.width = extract_int(video_json, "width", config_.video.width);
        config_.video.height = extract_int(video_json, "height", config_.video.height);
        config_.video.fps = extract_int(video_json, "fps", config_.video.fps);
        config_.video.quality = extract_int(video_json, "quality", config_.video.quality);
        config_.video.monitor = extract_int(video_json, "monitor", config_.video.monitor);
        std::string encoder = extract_string(video_json, "encoder");
        if (!encoder.empty()) config_.video.encoder = encoder;
    }

    // Parse audio section
    std::string audio_json = extract_object(json, "audio");
    if (!audio_json.empty()) {
        config_.audio.sample_rate = extract_int(audio_json, "sample_rate", config_.audio.sample_rate);
        config_.audio.bitrate = extract_int(audio_json, "bitrate", config_.audio.bitrate);
        config_.audio.system_audio_enabled = extract_bool(audio_json, "system_audio_enabled", config_.audio.system_audio_enabled);
        config_.audio.microphone_enabled = extract_bool(audio_json, "microphone_enabled", config_.audio.microphone_enabled);
    }

    // Parse hotkey section
    std::string hotkey_json = extract_object(json, "hotkey");
    if (!hotkey_json.empty()) {
        std::string save_clip = extract_string(hotkey_json, "save_clip");
        if (!save_clip.empty()) config_.hotkey.save_clip = save_clip;
    }

    // Parse UI section
    std::string ui_json = extract_object(json, "ui");
    if (!ui_json.empty()) {
        config_.ui.show_notifications = extract_bool(ui_json, "show_notifications", config_.ui.show_notifications);
        config_.ui.minimize_to_tray = extract_bool(ui_json, "minimize_to_tray", config_.ui.minimize_to_tray);
        config_.ui.start_with_windows = extract_bool(ui_json, "start_with_windows", config_.ui.start_with_windows);
    }

    LOG_INFO("Config loaded successfully");
    LOG_INFO("  output_path: " + config_.output_path);
    LOG_INFO("  buffer_seconds: " + std::to_string(config_.buffer_seconds));
    LOG_INFO("  video: " + std::to_string(config_.video.width) + "x" + std::to_string(config_.video.height) + "@" + std::to_string(config_.video.fps) + "fps");
    LOG_INFO("  encoder: " + config_.video.encoder);

    return true;
}

bool ConfigManager::save(const std::string& filepath) {
    LOG_INFO("Saving config to: " + filepath);

    std::ofstream file(filepath);
    if (!file.is_open()) {
        LOG_ERROR("Failed to open config file for writing: " + filepath);
        return false;
    }

    // Helper to escape strings for JSON
    auto escape_json = [](const std::string& str) -> std::string {
        std::string result;
        for (char c : str) {
            if (c == '\\' || c == '"') {
                result += '\\';
            }
            result += c;
        }
        return result;
    };

    file << "{\n";
    file << "    \"output_path\": \"" << escape_json(config_.output_path) << "\",\n";
    file << "    \"buffer_seconds\": " << config_.buffer_seconds << ",\n";
    file << "    \"video\": {\n";
    file << "        \"width\": " << config_.video.width << ",\n";
    file << "        \"height\": " << config_.video.height << ",\n";
    file << "        \"fps\": " << config_.video.fps << ",\n";
    file << "        \"encoder\": \"" << escape_json(config_.video.encoder) << "\",\n";
    file << "        \"quality\": " << config_.video.quality << ",\n";
    file << "        \"monitor\": " << config_.video.monitor << "\n";
    file << "    },\n";
    file << "    \"audio\": {\n";
    file << "        \"sample_rate\": " << config_.audio.sample_rate << ",\n";
    file << "        \"bitrate\": " << config_.audio.bitrate << ",\n";
    file << "        \"system_audio_enabled\": " << (config_.audio.system_audio_enabled ? "true" : "false") << ",\n";
    file << "        \"microphone_enabled\": " << (config_.audio.microphone_enabled ? "true" : "false") << "\n";
    file << "    },\n";
    file << "    \"hotkey\": {\n";
    file << "        \"save_clip\": \"" << escape_json(config_.hotkey.save_clip) << "\"\n";
    file << "    },\n";
    file << "    \"ui\": {\n";
    file << "        \"show_notifications\": " << (config_.ui.show_notifications ? "true" : "false") << ",\n";
    file << "        \"minimize_to_tray\": " << (config_.ui.minimize_to_tray ? "true" : "false") << ",\n";
    file << "        \"start_with_windows\": " << (config_.ui.start_with_windows ? "true" : "false") << "\n";
    file << "    }\n";
    file << "}\n";

    LOG_INFO("Config saved successfully");
    return true;
}

} // namespace clipvault
