#pragma once

#include <string>
#include <functional>

// Forward declare Windows types
#ifndef _WINDEF_
typedef unsigned long long WPARAM;
typedef long long LPARAM;
struct HWND__;
typedef HWND__* HWND;
#endif

namespace clipvault {

class HotkeyManager {
public:
    static HotkeyManager& instance();
    
    // Initialize global hotkey (F9)
    // hwnd: window handle to receive hotkey messages
    // Returns true if hotkey registered successfully
    bool initialize(const std::string& key, HWND hwnd);
    void shutdown();
    
    // Check if hotkey is registered
    bool is_initialized() const { return initialized_; }
    
    // Callback when hotkey pressed
    using HotkeyCallback = std::function<void()>;
    void set_callback(HotkeyCallback callback) { callback_ = callback; }
    
    // Windows message handler - called from tray.cpp WindowProc
    bool handle_hotkey_message(WPARAM wParam);
    
    // Get the hotkey ID for comparison
    int get_hotkey_id() const { return hotkey_id_; }

private:
    HotkeyManager() = default;
    ~HotkeyManager();
    
    bool initialized_ = false;
    HotkeyCallback callback_;
    int hotkey_id_ = -1;
    HWND hwnd_ = nullptr;
};

} // namespace clipvault
