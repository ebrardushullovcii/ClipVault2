#include "game_detector.h"

#include <windows.h>
#include <psapi.h>
#include <tlhelp32.h>
#include <fstream>
#include <algorithm>
#include <cctype>

#include "json.hpp"

#include "config.h"
#include "logger.h"

namespace clipvault {

// ============================================================================
// GameInfo Implementation
// ============================================================================

bool GameInfo::matches_process(const std::string& process_name) const
{
    std::string lower_process = process_name;
    std::transform(lower_process.begin(), lower_process.end(), lower_process.begin(), ::tolower);
    
    for (const auto& pattern : process_names) {
        std::string lower_pattern = pattern;
        std::transform(lower_pattern.begin(), lower_pattern.end(), lower_pattern.begin(), ::tolower);
        
        // Check for exact match or if process name contains the pattern
        if (lower_process == lower_pattern || lower_process.find(lower_pattern) != std::string::npos) {
            return true;
        }
    }
    return false;
}

// ============================================================================
// GameDatabase Implementation
// ============================================================================

GameDatabase& GameDatabase::instance()
{
    static GameDatabase instance;
    return instance;
}

bool GameDatabase::load(const std::string& filepath)
{
    loaded_ = false;
    version_.clear();
    games_.clear();

    LOG_INFO("[GAME_DB] ==========================================");
    LOG_INFO("[GAME_DB] Loading game database from: " + filepath);
    LOG_INFO("[GAME_DB] Current working directory check...");

    std::vector<std::string> possible_paths = {
        filepath,
        "config/games_database.json",
        "./config/games_database.json",
        "../config/games_database.json",
        "bin/config/games_database.json",
        "./bin/config/games_database.json",
        "resources/bin/config/games_database.json",
        "./resources/bin/config/games_database.json"
    };

    std::ifstream file;
    std::string actual_path;

    for (const auto& path : possible_paths) {
        LOG_INFO("[GAME_DB] Trying path: " + path);
        file.open(path);
        if (file.is_open()) {
            actual_path = path;
            LOG_INFO("[GAME_DB] SUCCESS - Found database at: " + path);
            break;
        }
        file.clear();
    }

    if (!file.is_open()) {
        LOG_ERROR("[GAME_DB] CRITICAL: Failed to open game database file from any path");
        LOG_ERROR("[GAME_DB] Tried " + std::to_string(possible_paths.size()) + " different paths");
        return false;
    }

    std::string content((std::istreambuf_iterator<char>(file)),
                        std::istreambuf_iterator<char>());
    file.close();

    games_.clear();

    try {
        auto json = nlohmann::json::parse(content);

        if (json.contains("version") && json["version"].is_string()) {
            version_ = json["version"];
            LOG_INFO("[GAME_DB] Database version: " + version_);
        }

        if (json.contains("games") && json["games"].is_array()) {
            for (const auto& game_json : json["games"]) {
                GameInfo game;

                if (game_json.contains("name") && game_json["name"].is_string()) {
                    game.name = game_json["name"];
                }

                if (game_json.contains("processNames") && game_json["processNames"].is_array()) {
                    for (const auto& proc_name : game_json["processNames"]) {
                        if (proc_name.is_string() && !proc_name.get<std::string>().empty()) {
                            game.process_names.push_back(proc_name);
                        }
                    }
                }

                if (game_json.contains("twitchId") && game_json["twitchId"].is_string()) {
                    game.twitch_id = game_json["twitchId"];
                }

                if (!game.name.empty() && !game.process_names.empty()) {
                    games_.push_back(game);
                }
            }
        } else {
            LOG_ERROR("[GAME_DB] Could not find 'games' array in database");
            return false;
        }
    } catch (const nlohmann::json::parse_error& e) {
        LOG_ERROR("[GAME_DB] JSON parse error: " + std::string(e.what()));
        return false;
    } catch (const std::exception& e) {
        LOG_ERROR("[GAME_DB] Error parsing database: " + std::string(e.what()));
        return false;
    }

    loaded_ = !games_.empty();
    LOG_INFO("[GAME_DB] ==========================================");
    LOG_INFO("[GAME_DB] Parsing complete!");
    LOG_INFO("[GAME_DB] Total games loaded: " + std::to_string(games_.size()));

    LOG_INFO("[GAME_DB] Sample of loaded games:");
    int count = 0;
    for (const auto& game : games_) {
        if (count < 5) {
            LOG_INFO("[GAME_DB]   - " + game.name + " (" + std::to_string(game.process_names.size()) + " process names)");
        }
        count++;
    }

    LOG_INFO("[GAME_DB] Loaded " + std::to_string(games_.size()) + " games from database");
    LOG_INFO("[GAME_DB] ==========================================");

    return loaded_;
}

std::optional<GameInfo> GameDatabase::find_game_by_process(const std::string& process_name) const
{
    LOG_INFO("[GAME_DB] Looking for game matching process: " + process_name);
    LOG_INFO("[GAME_DB] Total games to check: " + std::to_string(games_.size()));
    
    for (const auto& game : games_) {
        LOG_INFO("[GAME_DB] Checking game: " + game.name);
        if (game.matches_process(process_name)) {
            LOG_INFO("[GAME_DB] MATCH FOUND: " + game.name);
            return game;
        }
    }
    
    LOG_INFO("[GAME_DB] No match found for process: " + process_name);
    return std::nullopt;
}

// ============================================================================
// GameDetector Implementation
// ============================================================================

GameDetector& GameDetector::instance()
{
    static GameDetector instance;
    return instance;
}

bool GameDetector::initialize()
{
    if (initialized_) {
        return true;
    }
    
    LOG_INFO("[GAME_DETECTOR] Initializing game detector...");
    
    // Load game database from config directory (relative to working directory)
    std::string db_path = "config/games_database.json";
    
    if (!GameDatabase::instance().load(db_path)) {
        LOG_WARNING("[GAME_DETECTOR] Failed to load game database, detection will be limited");
        // Don't fail - we can still detect games even without database
    }
    
    initialized_ = true;
    LOG_INFO("[GAME_DETECTOR] Initialization complete");
    return true;
}

std::string GameDetector::detect_game_from_foreground()
{
    LOG_INFO("[GAME_DETECTOR] ==========================================");
    LOG_INFO("[GAME_DETECTOR] Starting game detection from foreground window");
    LOG_INFO("[GAME_DETECTOR] Database loaded: " + std::string(GameDatabase::instance().is_loaded() ? "YES" : "NO"));

    HWND hwnd = get_foreground_window();
    if (!hwnd) {
        LOG_WARNING("[GAME_DETECTOR] No foreground window found!");
        return "";
    }

    char window_title[256] = {};
    GetWindowTextA(hwnd, window_title, sizeof(window_title));

    std::string process_name = get_process_name_from_window(hwnd);
    if (process_name.empty()) {
        LOG_WARNING("[GAME_DETECTOR] Could not get process name from foreground window");
        return "";
    }
    
    LOG_INFO("[GAME_DETECTOR] Foreground process: " + process_name);
    
    // Check if database is loaded
    if (!GameDatabase::instance().is_loaded()) {
        LOG_WARNING("[GAME_DETECTOR] Game database not loaded!");
        LOG_INFO("[GAME_DETECTOR] Database has " + std::to_string(GameDatabase::instance().games().size()) + " games");
    } else {
        LOG_INFO("[GAME_DETECTOR] Database loaded with " + std::to_string(GameDatabase::instance().games().size()) + " games");
        
        // Check if it's a known game
        auto game = GameDatabase::instance().find_game_by_process(process_name);
        if (game.has_value()) {
            LOG_INFO("[GAME_DETECTOR] MATCH FOUND! Game: " + game->name);
            return game->name;
        }
        
        LOG_INFO("[GAME_DETECTOR] Process not found in database, checking fullscreen...");
    }
    
    // Check if window is fullscreen - if so, it might be a game not in our database
    bool is_fullscreen = is_window_fullscreen(hwnd);
    LOG_INFO("[GAME_DETECTOR] Window is fullscreen: " + std::string(is_fullscreen ? "YES" : "NO"));
    
    if (is_fullscreen) {
        LOG_INFO("[GAME_DETECTOR] Fullscreen window detected (not in database): " + process_name);
        // Return the process name as the game name (sanitized)
        return process_name;
    }
    
    LOG_INFO("[GAME_DETECTOR] No game detected (process: " + process_name + ")");
    LOG_INFO("[GAME_DETECTOR] ==========================================");
    return "";
}

std::string GameDetector::get_process_name_from_window(HWND hwnd)
{
    if (!hwnd) {
        return "";
    }
    
    DWORD process_id = 0;
    GetWindowThreadProcessId(hwnd, &process_id);
    
    if (process_id == 0) {
        return "";
    }
    
    HANDLE h_process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, process_id);
    if (!h_process) {
        return "";
    }
    
    char process_name[MAX_PATH] = {};
    DWORD size = MAX_PATH;
    
    if (QueryFullProcessImageNameA(h_process, 0, process_name, &size)) {
        CloseHandle(h_process);
        
        // Extract just the filename from the full path
        std::string full_path(process_name);
        size_t last_slash = full_path.find_last_of("\\/");
        if (last_slash != std::string::npos) {
            return full_path.substr(last_slash + 1);
        }
        return full_path;
    }
    
    CloseHandle(h_process);
    return "";
}

bool GameDetector::is_window_fullscreen(HWND hwnd)
{
    if (!hwnd) {
        return false;
    }
    
    // Check if window is visible
    if (!IsWindowVisible(hwnd)) {
        return false;
    }
    
    // Get window style
    LONG style = GetWindowLong(hwnd, GWL_STYLE);
    LONG ex_style = GetWindowLong(hwnd, GWL_EXSTYLE);
    
    // Check if it's a fullscreen/borderless window
    // Fullscreen windows typically have WS_POPUP style and no WS_CAPTION
    bool has_caption = (style & WS_CAPTION) != 0;
    bool is_popup = (style & WS_POPUP) != 0;
    
    // Get window rect
    RECT window_rect;
    GetWindowRect(hwnd, &window_rect);
    
    // Get monitor info
    HMONITOR h_monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    MONITORINFO monitor_info = {};
    monitor_info.cbSize = sizeof(MONITORINFO);
    
    if (GetMonitorInfo(h_monitor, &monitor_info)) {
        RECT monitor_rect = monitor_info.rcMonitor;
        
        // Check if window covers the entire monitor
        bool covers_monitor = (
            window_rect.left == monitor_rect.left &&
            window_rect.top == monitor_rect.top &&
            window_rect.right == monitor_rect.right &&
            window_rect.bottom == monitor_rect.bottom
        );
        
        if (covers_monitor && !has_caption) {
            return true;
        }
    }
    
    // Alternative check: window is maximized and has no border
    if (IsZoomed(hwnd) && is_popup && !has_caption) {
        return true;
    }
    
    return false;
}

HWND GameDetector::get_foreground_window()
{
    return GetForegroundWindow();
}

bool GameDetector::is_known_game(const std::string& process_name) const
{
    if (!GameDatabase::instance().is_loaded()) {
        return false;
    }
    
    return GameDatabase::instance().find_game_by_process(process_name).has_value();
}

std::string GameDetector::sanitize_for_filename(const std::string& game_name)
{
    std::string result = game_name;
    
    // Replace spaces with underscores
    std::replace(result.begin(), result.end(), ' ', '_');
    
    // Remove or replace characters not allowed in filenames
    std::string invalid_chars = "<>:\"/\\|?*";
    for (char& c : result) {
        if (invalid_chars.find(c) != std::string::npos) {
            c = '_';
        }
    }
    // Remove .exe extension if present
    size_t exe_pos = result.find(".exe");
    if (exe_pos != std::string::npos) {
        result.resize(exe_pos);
    }

    // Limit length to 50 characters
    if (result.length() > 50) {
        result.resize(50);
    }

    return result;
}

} // namespace clipvault
