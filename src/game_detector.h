#pragma once

#include <windows.h>
#include <string>
#include <vector>
#include <optional>

namespace clipvault {

// Game information structure
struct GameInfo {
    std::string name;
    std::vector<std::string> process_names;
    std::string twitch_id;
    
    bool matches_process(const std::string& process_name) const;
};

// Game database manager
class GameDatabase {
public:
    static GameDatabase& instance();
    
    // Load game database from JSON file
    bool load(const std::string& filepath);
    
    // Find game by process name
    std::optional<GameInfo> find_game_by_process(const std::string& process_name) const;
    
    // Get all games
    const std::vector<GameInfo>& games() const { return games_; }
    
    // Check if database is loaded
    bool is_loaded() const { return loaded_; }
    
private:
    GameDatabase() = default;
    ~GameDatabase() = default;
    GameDatabase(const GameDatabase&) = delete;
    GameDatabase& operator=(const GameDatabase&) = delete;
    
    std::vector<GameInfo> games_;
    bool loaded_ = false;
    std::string version_;
};

// Game detection functionality
class GameDetector {
public:
    static GameDetector& instance();
    
    // Initialize the detector (loads game database)
    bool initialize();
    
    // Detect game from foreground window
    // Returns the game name if detected, empty string otherwise
    std::string detect_game_from_foreground();
    
    // Get process name from window handle
    static std::string get_process_name_from_window(HWND hwnd);
    
    // Check if window is fullscreen
    static bool is_window_fullscreen(HWND hwnd);
    
    // Get foreground window handle
    static HWND get_foreground_window();
    
    // Check if a process name matches any known game
    bool is_known_game(const std::string& process_name) const;
    
    // Sanitize game name for use in filename (remove spaces, special chars)
    static std::string sanitize_for_filename(const std::string& game_name);
    
private:
    GameDetector() = default;
    ~GameDetector() = default;
    GameDetector(const GameDetector&) = delete;
    GameDetector& operator=(const GameDetector&) = delete;
    
    bool initialized_ = false;
};

} // namespace clipvault
