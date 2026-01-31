#include "hotkey.h"
#include "logger.h"
#include "config.h"
#include <windows.h>
#include <atomic>
#include <thread>
#include <chrono>

namespace clipvault {

// Global hook handle and target key (needed for the low-level hook callback)
static HHOOK g_keyboard_hook = nullptr;
static int g_target_vk = 0;
static std::atomic<bool> g_f9_pressed{false};

// Low-level keyboard hook procedure
// This runs in a separate thread and can capture keys even in fullscreen games
LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam)
{
    if (nCode >= 0) {
        KBDLLHOOKSTRUCT* pKb = (KBDLLHOOKSTRUCT*)lParam;
        
        // Check if F9 is pressed (wParam == WM_KEYDOWN or WM_SYSKEYDOWN)
        if (pKb->vkCode == g_target_vk && (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN)) {
            // Only trigger if not already pressed (prevent repeats)
            if (!g_f9_pressed.load()) {
                g_f9_pressed.store(true);
                LOG_INFO("[HOOK] F9 pressed (low-level hook)");
                
                // Get the hotkey manager instance and trigger callback
                auto& manager = HotkeyManager::instance();
                if (manager.has_callback()) {
                    manager.trigger_callback();
                }
            }
        }
        else if (pKb->vkCode == g_target_vk && (wParam == WM_KEYUP || wParam == WM_SYSKEYUP)) {
            g_f9_pressed.store(false);
        }
    }
    
    // Pass the message to the next hook (don't block it)
    return CallNextHookEx(g_keyboard_hook, nCode, wParam, lParam);
}

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
    LOG_INFO("  Method: Low-level keyboard hook (for games)");

    int vk = 0;

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

    // Set the global target key
    g_target_vk = vk;
    g_f9_pressed.store(false);
    
    // Install low-level keyboard hook
    // WH_KEYBOARD_LL works even in fullscreen games because it's at the driver level
    g_keyboard_hook = SetWindowsHookEx(WH_KEYBOARD_LL, LowLevelKeyboardProc, GetModuleHandle(NULL), 0);
    
    if (!g_keyboard_hook) {
        DWORD error = GetLastError();
        LOG_ERROR("Failed to install low-level keyboard hook (error: " + std::to_string(error) + ")");
        g_target_vk = 0;
        return false;
    }

    LOG_INFO("  Low-level keyboard hook installed successfully");
    LOG_INFO("    Virtual key: 0x" + std::to_string(vk) + " (" + key + ")");
    LOG_INFO("    Hook handle: " + std::to_string(reinterpret_cast<uintptr_t>(g_keyboard_hook)));
    LOG_INFO("  NOTE: This hook works even in fullscreen/borderless games!");

    hwnd_ = hwnd;
    initialized_ = true;
    return true;
}

void HotkeyManager::shutdown()
{
    if (!initialized_) {
        return;
    }

    LOG_INFO("Shutting down hotkey manager...");

    if (g_keyboard_hook) {
        if (UnhookWindowsHookEx(g_keyboard_hook)) {
            LOG_INFO("  Keyboard hook uninstalled successfully");
        } else {
            LOG_WARNING("  Failed to uninstall keyboard hook");
        }
        g_keyboard_hook = nullptr;
    }

    g_target_vk = 0;
    g_f9_pressed.store(false);
    hwnd_ = nullptr;
    initialized_ = false;
}

bool HotkeyManager::handle_hotkey_message(WPARAM wParam)
{
    // With the low-level hook, we don't use WM_HOTKEY messages
    // The hook callback handles everything directly
    return false;
}

void HotkeyManager::trigger_callback()
{
    LOG_INFO("========================================");
    LOG_INFO("HOTKEY TRIGGERED! (low-level hook)");
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
}

} // namespace clipvault
