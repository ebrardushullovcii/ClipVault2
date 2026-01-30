#include "hotkey.h"
#include "logger.h"
#include "config.h"
#include <windows.h>

namespace clipvault {

HotkeyManager& HotkeyManager::instance()
{
    static HotkeyManager instance;
    return instance;
}

HotkeyManager::~HotkeyManager()
{
    if (initialized_) {
        shutdown();
    }
}

bool HotkeyManager::initialize(const std::string& key, HWND hwnd)
{
    if (initialized_) {
        LOG_WARNING("Hotkey already initialized");
        return true;
    }

    LOG_INFO("Initializing hotkey manager...");
    LOG_INFO("  Hotkey: " + key);

    int vk = 0;
    int modifiers = 0;

    if (key == "F9") {
        vk = VK_F9;
    } else if (key == "F10") {
        vk = VK_F10;
    } else if (key == "F8") {
        vk = VK_F8;
    } else {
        LOG_ERROR("Unsupported hotkey: " + key);
        return false;
    }

    hotkey_id_ = 1;
    hwnd_ = hwnd;
    
    // Register global hotkey with provided window handle
    if (!RegisterHotKey(hwnd_, hotkey_id_, modifiers, vk)) {
        DWORD error = GetLastError();
        LOG_ERROR("Failed to register hotkey " + key + " (error: " + std::to_string(error) + ")");
        hotkey_id_ = -1;
        hwnd_ = nullptr;
        return false;
    }

    LOG_INFO("  Hotkey registered successfully");
    LOG_INFO("    Virtual key: 0x" + std::to_string(vk));
    LOG_INFO("    Hotkey ID: " + std::to_string(hotkey_id_));

    initialized_ = true;
    return true;
}

void HotkeyManager::shutdown()
{
    if (!initialized_ || hotkey_id_ == -1) {
        return;
    }

    LOG_INFO("Shutting down hotkey manager...");

    if (hwnd_ && UnregisterHotKey(hwnd_, hotkey_id_)) {
        LOG_INFO("  Hotkey unregistered successfully");
    } else {
        LOG_WARNING("  Failed to unregister hotkey");
    }

    hotkey_id_ = -1;
    hwnd_ = nullptr;
    initialized_ = false;
}

bool HotkeyManager::handle_hotkey_message(WPARAM wParam)
{
    int id = static_cast<int>(wParam);
    
    if (id == hotkey_id_) {
        LOG_INFO("========================================");
        LOG_INFO("HOTKEY TRIGGERED! (" + std::to_string(id) + ")");
        LOG_INFO("========================================");
        LOG_INFO("  Timestamp: " + std::to_string(GetTickCount64()) + "ms");
        LOG_INFO("  Action: Save clip");
        
        if (callback_) {
            LOG_INFO("  Executing callback...");
            callback_();
            LOG_INFO("  Callback completed");
        } else {
            LOG_WARNING("  No callback registered!");
        }
        
        LOG_INFO("========================================");
        return true;
    }
    
    return false;
}

} // namespace clipvault
