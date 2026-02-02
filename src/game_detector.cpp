#include "game_detector.h"
#include "logger.h"
#include "config.h"

#include <windows.h>
#include <psapi.h>
#include <tlhelp32.h>
#include <fstream>
#include <algorithm>
#include <cctype>

// JSON parsing - using nlohmann/json if available, otherwise simple parser
// For now, we'll implement a simple JSON parser for the game database
#include <sstream>
#include <regex>

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
    LOG_INFO("[GAME_DB] ==========================================");
    LOG_INFO("[GAME_DB] Loading game database from: " + filepath);
    LOG_INFO("[GAME_DB] Current working directory check...");
    
    // Try multiple possible paths
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
    
    // Read entire file
    std::string content((std::istreambuf_iterator<char>(file)),
                        std::istreambuf_iterator<char>());
    file.close();
    
    // Simple JSON parsing for the games array
    // Look for "games": [ ... ] and extract game entries
    
    games_.clear();
    
    // Extract version
    size_t version_pos = content.find("\"version\"");
    if (version_pos != std::string::npos) {
        size_t colon_pos = content.find(":", version_pos);
        size_t quote_start = content.find("\"", colon_pos);
        size_t quote_end = content.find("\"", quote_start + 1);
        if (quote_start != std::string::npos && quote_end != std::string::npos) {
            version_ = content.substr(quote_start + 1, quote_end - quote_start - 1);
            LOG_INFO("[GAME_DB] Database version: " + version_);
        }
    }
    
    // Find games array
    size_t games_start = content.find("\"games\"");
    if (games_start == std::string::npos) {
        LOG_ERROR("[GAME_DB] Could not find 'games' array in database");
        return false;
    }
    
    // Find array start
    size_t array_start = content.find("[", games_start);
    if (array_start == std::string::npos) {
        LOG_ERROR("[GAME_DB] Could not find games array start");
        return false;
    }
    
    // Find array end (matching bracket)
    int bracket_count = 1;
    size_t array_end = array_start + 1;
    while (bracket_count > 0 && array_end < content.length()) {
        if (content[array_end] == '[') bracket_count++;
        else if (content[array_end] == ']') bracket_count--;
        array_end++;
    }
    
    std::string games_array = content.substr(array_start, array_end - array_start);
    
    // Parse individual game objects
    // Look for { ... } objects in the array
    size_t pos = 0;
    while ((pos = games_array.find("{", pos)) != std::string::npos) {
        size_t obj_start = pos;
        int obj_bracket_count = 1;
        size_t obj_end = obj_start + 1;
        
        while (obj_bracket_count > 0 && obj_end < games_array.length()) {
            if (games_array[obj_end] == '{') obj_bracket_count++;
            else if (games_array[obj_end] == '}') obj_bracket_count--;
            obj_end++;
        }
        
        if (obj_bracket_count == 0) {
            std::string game_obj = games_array.substr(obj_start, obj_end - obj_start);
            
            // Extract game name
            GameInfo game;
            size_t name_pos = game_obj.find("\"name\"");
            if (name_pos != std::string::npos) {
                size_t colon_pos = game_obj.find(":", name_pos);
                size_t quote_start = game_obj.find("\"", colon_pos);
                size_t quote_end = game_obj.find("\"", quote_start + 1);
                if (quote_start != std::string::npos && quote_end != std::string::npos) {
                    game.name = game_obj.substr(quote_start + 1, quote_end - quote_start - 1);
                }
            }
            
            // Extract process names (processNames array)
            size_t proc_pos = game_obj.find("\"processNames\"");
            if (proc_pos != std::string::npos) {
                size_t proc_array_start = game_obj.find("[", proc_pos);
                size_t proc_array_end = game_obj.find("]", proc_array_start);
                if (proc_array_start != std::string::npos && proc_array_end != std::string::npos) {
                    std::string proc_array = game_obj.substr(proc_array_start, proc_array_end - proc_array_start + 1);
                    
                    // Extract individual process names
                    size_t proc_name_pos = 0;
                    while ((proc_name_pos = proc_array.find("\"", proc_name_pos)) != std::string::npos) {
                        size_t proc_name_end = proc_array.find("\"", proc_name_pos + 1);
                        if (proc_name_end != std::string::npos) {
                            std::string proc_name = proc_array.substr(proc_name_pos + 1, proc_name_end - proc_name_pos - 1);
                            if (!proc_name.empty()) {
                                game.process_names.push_back(proc_name);
                            }
                            proc_name_pos = proc_name_end + 1;
                        } else {
                            break;
                        }
                    }
                }
            }
            
            // Extract twitch ID
            size_t twitch_pos = game_obj.find("\"twitchId\"");
            if (twitch_pos != std::string::npos) {
                size_t colon_pos = game_obj.find(":", twitch_pos);
                size_t quote_start = game_obj.find("\"", colon_pos);
                size_t quote_end = game_obj.find("\"", quote_start + 1);
                if (quote_start != std::string::npos && quote_end != std::string::npos) {
                    game.twitch_id = game_obj.substr(quote_start + 1, quote_end - quote_start - 1);
                }
            }
            
            // Add game if we have a name and at least one process name
            if (!game.name.empty() && !game.process_names.empty()) {
                games_.push_back(game);
            }
        }
        
        pos = obj_end;
    }
    
    loaded_ = !games_.empty();
    LOG_INFO("[GAME_DB] ==========================================");
    LOG_INFO("[GAME_DB] Parsing complete!");
    LOG_INFO("[GAME_DB] Total games loaded: " + std::to_string(games_.size()));
    
    // Log first 5 games as sample
    LOG_INFO("[GAME_DB] Sample of loaded games:");
    int count = 0;
    for (const auto& game : games_) {
        if (count < 5) {
            LOG_INFO("[GAME_DB]   - " + game.name + " (" + std::to_string(game.process_names.size()) + " process names)");
        }
        count++;
    }
    
    // Check if League of Legends is in the list
    bool has_lol = false;
    for (const auto& game : games_) {
        if (game.name == "League of Legends") {
            has_lol = true;
            LOG_INFO("[GAME_DB] League of Legends found in database:");
            for (const auto& proc : game.process_names) {
                LOG_INFO("[GAME_DB]   Process: " + proc);
            }
            break;
        }
    }
    if (!has_lol) {
        LOG_WARNING("[GAME_DB] League of Legends NOT found in database!");
    }
    
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

// Helper function to enumerate all running processes
void log_all_running_processes()
{
    LOG_INFO("[GAME_DETECTOR] ==========================================");
    LOG_INFO("[GAME_DETECTOR] ENUMERATING ALL RUNNING PROCESSES:");
    
    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnapshot == INVALID_HANDLE_VALUE) {
        LOG_WARNING("[GAME_DETECTOR] Failed to create process snapshot");
        return;
    }
    
    PROCESSENTRY32 pe32;
    pe32.dwSize = sizeof(PROCESSENTRY32);
    
    if (!Process32First(hSnapshot, &pe32)) {
        CloseHandle(hSnapshot);
        LOG_WARNING("[GAME_DETECTOR] Failed to get first process");
        return;
    }
    
    int count = 0;
    do {
        // Check for League of Legends specifically
        bool is_lol = (strstr(pe32.szExeFile, "League") != nullptr || 
                       strstr(pe32.szExeFile, "Riot") != nullptr);
        std::string marker = is_lol ? " <-- League related!" : "";
        
        LOG_INFO("[GAME_DETECTOR]   [" + std::to_string(pe32.th32ProcessID) + "] " + 
                 std::string(pe32.szExeFile) + marker);
        count++;
        
        // Stop after 100 processes to avoid flooding logs
        if (count >= 100) {
            LOG_INFO("[GAME_DETECTOR]   ... and " + std::to_string(count) + " more processes (truncated)");
            break;
        }
    } while (Process32Next(hSnapshot, &pe32));
    
    CloseHandle(hSnapshot);
    LOG_INFO("[GAME_DETECTOR] Total processes logged: " + std::to_string(count));
    LOG_INFO("[GAME_DETECTOR] ==========================================");
}

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
    
    // Log ALL running processes to see what League process is actually named
    log_all_running_processes();
    
    HWND hwnd = get_foreground_window();
    if (!hwnd) {
        LOG_WARNING("[GAME_DETECTOR] No foreground window found!");
        return "";
    }
    
    // Get window title for debugging
    char window_title[256] = {};
    GetWindowTextA(hwnd, window_title, sizeof(window_title));
    LOG_INFO("[GAME_DETECTOR] Foreground window title: " + std::string(window_title));
    
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
        result = result.substr(0, exe_pos);
    }
    
    // Limit length to 50 characters
    if (result.length() > 50) {
        result = result.substr(0, 50);
    }
    
    return result;
}

} // namespace clipvault
