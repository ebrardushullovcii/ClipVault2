#include "tray.h"
#include "logger.h"

#include <shellapi.h>

namespace clipvault {

SystemTray& SystemTray::instance()
{
    static SystemTray instance;
    return instance;
}

SystemTray::~SystemTray()
{
    shutdown();
}

bool SystemTray::initialize(HINSTANCE hInstance)
{
    if (initialized_) {
        return true;
    }

    LOG_INFO("Initializing system tray...");

    // Register window class
    WNDCLASSEXA wc = {};
    wc.cbSize = sizeof(WNDCLASSEXA);
    wc.lpfnWndProc = WindowProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = "ClipVaultTrayClass";

    if (!RegisterClassExA(&wc)) {
        LOG_ERROR("Failed to register window class");
        return false;
    }

    // Create hidden message-only window
    hwnd_ = CreateWindowExA(
        0,
        "ClipVaultTrayClass",
        "ClipVault",
        0,
        0, 0, 0, 0,
        HWND_MESSAGE,  // Message-only window
        nullptr,
        hInstance,
        nullptr
    );

    if (!hwnd_) {
        LOG_ERROR("Failed to create window");
        return false;
    }

    // Store instance pointer for window proc
    SetWindowLongPtrA(hwnd_, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));

    // Setup tray icon
    nid_.cbSize = sizeof(NOTIFYICONDATAA);
    nid_.hWnd = hwnd_;
    nid_.uID = 1;
    nid_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    nid_.uCallbackMessage = WM_TRAYICON;
    nid_.hIcon = LoadIcon(nullptr, IDI_APPLICATION);  // Default icon for now
    strcpy_s(nid_.szTip, "ClipVault - Ready");

    if (!Shell_NotifyIconA(NIM_ADD, &nid_)) {
        LOG_ERROR("Failed to add tray icon");
        DestroyWindow(hwnd_);
        hwnd_ = nullptr;
        return false;
    }

    // Create context menu
    menu_ = CreatePopupMenu();
    AppendMenuA(menu_, MF_STRING | MF_GRAYED, MENU_STATUS, "ClipVault - Ready");
    AppendMenuA(menu_, MF_SEPARATOR, 0, nullptr);
    AppendMenuA(menu_, MF_STRING, MENU_OPEN_FOLDER, "Open Clips Folder");
    AppendMenuA(menu_, MF_SEPARATOR, 0, nullptr);
    AppendMenuA(menu_, MF_STRING, MENU_EXIT, "Exit");

    initialized_ = true;
    LOG_INFO("System tray initialized successfully");

    return true;
}

void SystemTray::shutdown()
{
    if (!initialized_) {
        return;
    }

    LOG_INFO("Shutting down system tray...");

    if (menu_) {
        DestroyMenu(menu_);
        menu_ = nullptr;
    }

    Shell_NotifyIconA(NIM_DELETE, &nid_);

    if (hwnd_) {
        DestroyWindow(hwnd_);
        hwnd_ = nullptr;
    }

    initialized_ = false;
}

int SystemTray::run()
{
    if (!initialized_) {
        LOG_ERROR("Tray not initialized, cannot run");
        return 1;
    }

    LOG_INFO("Entering message loop...");
    running_ = true;

    MSG msg;
    while (running_ && GetMessage(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    LOG_INFO("Message loop ended");
    return 0;
}

void SystemTray::quit()
{
    LOG_INFO("Quit requested");
    running_ = false;
    PostQuitMessage(0);
}

void SystemTray::show_notification(const std::string& title, const std::string& message)
{
    if (!initialized_) {
        return;
    }

    nid_.uFlags = NIF_INFO;
    strcpy_s(nid_.szInfoTitle, title.c_str());
    strcpy_s(nid_.szInfo, message.c_str());
    nid_.dwInfoFlags = NIIF_INFO;
    nid_.uTimeout = 3000;

    Shell_NotifyIconA(NIM_MODIFY, &nid_);

    // Reset flags
    nid_.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;

    LOG_INFO("Notification shown: " + title + " - " + message);
}

LRESULT CALLBACK SystemTray::WindowProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    SystemTray* self = reinterpret_cast<SystemTray*>(GetWindowLongPtrA(hwnd, GWLP_USERDATA));

    switch (msg) {
        case WM_TRAYICON:
            if (self) {
                self->handle_tray_message(wParam, lParam);
            }
            return 0;

        case WM_COMMAND:
            if (self && self->menu_callback_) {
                self->menu_callback_(LOWORD(wParam));
            }
            return 0;

        case WM_DESTROY:
            PostQuitMessage(0);
            return 0;
    }

    return DefWindowProcA(hwnd, msg, wParam, lParam);
}

void SystemTray::handle_tray_message(WPARAM wParam, LPARAM lParam)
{
    switch (lParam) {
        case WM_RBUTTONUP:
        case WM_CONTEXTMENU:
            show_context_menu();
            break;

        case WM_LBUTTONDBLCLK:
            // Double-click - could open settings or clips folder
            LOG_INFO("Tray icon double-clicked");
            if (menu_callback_) {
                menu_callback_(MENU_OPEN_FOLDER);
            }
            break;
    }
}

void SystemTray::show_context_menu()
{
    POINT pt;
    GetCursorPos(&pt);

    // Required to make menu disappear when clicking elsewhere
    SetForegroundWindow(hwnd_);

    TrackPopupMenu(
        menu_,
        TPM_RIGHTALIGN | TPM_BOTTOMALIGN | TPM_RIGHTBUTTON,
        pt.x, pt.y,
        0,
        hwnd_,
        nullptr
    );

    // Required for proper menu behavior
    PostMessage(hwnd_, WM_NULL, 0, 0);
}

} // namespace clipvault
