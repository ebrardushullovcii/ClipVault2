#pragma once

#include <windows.h>
#include <shellapi.h>
#include <functional>
#include <string>

namespace clipvault {

class SystemTray {
public:
    static SystemTray& instance();

    bool initialize(HINSTANCE hInstance);
    void shutdown();

    // Run the message loop (blocks until quit)
    int run();

    // Request exit
    void quit();

    // Show a balloon notification
    void show_notification(const std::string& title, const std::string& message);

    // Set callback for menu actions
    using MenuCallback = std::function<void(int)>;
    void set_menu_callback(MenuCallback callback) { menu_callback_ = callback; }

    // Menu item IDs
    static constexpr int MENU_STATUS = 1;
    static constexpr int MENU_OPEN_FOLDER = 2;
    static constexpr int MENU_EXIT = 3;

private:
    SystemTray() = default;
    ~SystemTray();

    SystemTray(const SystemTray&) = delete;
    SystemTray& operator=(const SystemTray&) = delete;

    static LRESULT CALLBACK WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam);
    void handle_tray_message(WPARAM wParam, LPARAM lParam);
    void show_context_menu();

    HWND hwnd_ = nullptr;
    NOTIFYICONDATAA nid_ = {};
    HMENU menu_ = nullptr;
    bool initialized_ = false;
    bool running_ = false;
    MenuCallback menu_callback_;

    static constexpr UINT WM_TRAYICON = WM_USER + 1;
};

} // namespace clipvault
