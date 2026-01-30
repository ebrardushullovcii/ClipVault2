#pragma once

#include <string>
#include <functional>

namespace clipvault {

class HotkeyManager {
public:
    static HotkeyManager& instance();
    
    // Initialize global hotkey (F9)
    // Returns true if hotkey registered successfully
    bool initialize(const std::string& key = "F9");
    void shutdown();
    
    // Check if hotkey is registered
    bool is_initialized() const { return initialized_; }
    
    // Callback when hotkey pressed
    using HotkeyCallback = std::function<void()>;
    void set_callback(HotkeyCallback callback) { callback_ = callback; }

private:
    HotkeyManager() = default;
    ~HotkeyManager();
    
    bool initialized_ = false;
    HotkeyCallback callback_;
    int hotkey_id_ = -1;
    
    // Windows message handler - called from tray.cpp message loop
    friend class SystemTray;
    bool handle_message(void* msg);  // Actually MSG*
};

} // namespace clipvault
