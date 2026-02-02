#include "audio_devices.h"
#include "logger.h"
#include <windows.h>
#include <mmdeviceapi.h>
#include <functiondiscoverykeys_devpkey.h>
#include <propsys.h>
#include <string>
#include <vector>

#pragma comment(lib, "uuid.lib")

namespace clipvault {

// RAII helper for COM initialization per-thread
class ComInitializer {
public:
    ComInitializer() {
        HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        // Only track that we need to uninitialize if CoInitializeEx actually succeeded
        // RPC_E_CHANGED_MODE means it failed (different apartment model already set)
        needs_uninit_ = SUCCEEDED(hr);
        initialized_ = needs_uninit_ || hr == RPC_E_CHANGED_MODE;
    }
    ~ComInitializer() {
        if (needs_uninit_) {
            CoUninitialize();
        }
    }
    bool is_initialized() const { return initialized_; }
private:
    bool initialized_ = false;
    bool needs_uninit_ = false;
};

// Ensure each thread initializes COM before using audio devices
void initialize_com() {
    thread_local ComInitializer com_init;
    if (!com_init.is_initialized()) {
        LOG_ERROR("Failed to initialize COM for current thread");
    }
}

template<typename T>
class ComPtr {
public:
    ComPtr() : ptr_(nullptr) {}
    ComPtr(T* ptr) : ptr_(ptr) {}
    ~ComPtr() { if (ptr_) ptr_->Release(); }

    // Delete copy operations to prevent double-Release
    ComPtr(const ComPtr&) = delete;
    ComPtr& operator=(const ComPtr&) = delete;

    // Move semantics
    ComPtr(ComPtr&& other) noexcept : ptr_(other.ptr_) {
        other.ptr_ = nullptr;
    }
    ComPtr& operator=(ComPtr&& other) noexcept {
        if (this != &other) {
            if (ptr_) ptr_->Release();
            ptr_ = other.ptr_;
            other.ptr_ = nullptr;
        }
        return *this;
    }

    T* operator->() const { return ptr_; }
    T* get() const { return ptr_; }
    T** addressof() { return &ptr_; }
    void reset(T* ptr) { if (ptr_) ptr_->Release(); ptr_ = ptr; }

private:
    T* ptr_;
};

// Get device name from WASAPI property store using multiple property keys
std::wstring get_wasapi_device_name(IMMDevice* device) {
    IPropertyStore* props = nullptr;
    std::wstring name;

    if (FAILED(device->OpenPropertyStore(STGM_READ, &props))) {
        return name;
    }

    PROPVARIANT varName;
    PropVariantInit(&varName);

    // Try multiple property keys in order of preference
    // 1. PKEY_DeviceInterface_FriendlyName - usually the best name
    if (SUCCEEDED(props->GetValue(PKEY_DeviceInterface_FriendlyName, &varName))) {
        if (varName.vt == VT_LPWSTR && varName.pwszVal && wcslen(varName.pwszVal) > 0) {
            name = varName.pwszVal;
        }
    }

    // 2. PKEY_Device_FriendlyName - fallback
    if (name.empty()) {
        PropVariantClear(&varName);
        PropVariantInit(&varName);
        if (SUCCEEDED(props->GetValue(PKEY_Device_FriendlyName, &varName))) {
            if (varName.vt == VT_LPWSTR && varName.pwszVal && wcslen(varName.pwszVal) > 0) {
                name = varName.pwszVal;
            }
        }
    }



    PropVariantClear(&varName);
    props->Release();

    return name;
}

// Get device ID from IMMDevice
std::wstring get_device_id(IMMDevice* device) {
    LPWSTR wstrId = nullptr;
    if (SUCCEEDED(device->GetId(&wstrId))) {
        std::wstring result = wstrId;
        CoTaskMemFree(wstrId);
        return result;
    }
    return L"";
}

std::vector<AudioDeviceInfo> enumerate_devices(EDataFlow direction) {
    initialize_com();

    std::vector<AudioDeviceInfo> devices;

    ComPtr<IMMDeviceEnumerator> enumerator;
    if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
        __uuidof(IMMDeviceEnumerator), (void**)enumerator.addressof()))) {
        LOG_ERROR("Failed to create MMDeviceEnumerator");
        return devices;
    }

    ComPtr<IMMDeviceCollection> collection;
    if (FAILED(enumerator->EnumAudioEndpoints(direction, DEVICE_STATE_ACTIVE, collection.addressof()))) {
        LOG_ERROR("Failed to enumerate audio endpoints");
        return devices;
    }

    UINT count = 0;
    if (FAILED(collection->GetCount(&count))) {
        return devices;
    }

    // Get default device
    ComPtr<IMMDevice> defaultDevice;
    enumerator->GetDefaultAudioEndpoint(direction, eConsole, defaultDevice.addressof());

    std::wstring defaultId;
    if (defaultDevice.get() != nullptr) {
        defaultId = get_device_id(defaultDevice.get());
    }

    // Enumerate devices
    for (UINT i = 0; i < count; i++) {
        ComPtr<IMMDevice> device;
        if (FAILED(collection->Item(i, device.addressof()))) {
            continue;
        }

        std::wstring wstrId = get_device_id(device.get());
        std::wstring wstrName = get_wasapi_device_name(device.get());

        // Skip devices without IDs to avoid "default" placeholder issues
        if (wstrId.empty()) {
            LOG_ERROR("Audio device missing ID; skipping entry");
            continue;
        }

        AudioDeviceInfo info;
        info.is_default = false;

        // Convert wide strings to UTF-8 (only populate if conversion succeeds)
        if (!wstrId.empty()) {
            int size_needed = WideCharToMultiByte(CP_UTF8, 0, wstrId.c_str(), (int)wstrId.size(), nullptr, 0, nullptr, nullptr);
            if (size_needed > 0) {
                info.id.resize(size_needed);
                WideCharToMultiByte(CP_UTF8, 0, wstrId.c_str(), (int)wstrId.size(),
                    &info.id[0], size_needed, nullptr, nullptr);
            }
        }

        if (!wstrName.empty()) {
            int size_needed = WideCharToMultiByte(CP_UTF8, 0, wstrName.c_str(), (int)wstrName.size(), nullptr, 0, nullptr, nullptr);
            if (size_needed > 0) {
                info.name.resize(size_needed);
                WideCharToMultiByte(CP_UTF8, 0, wstrName.c_str(), (int)wstrName.size(),
                    &info.name[0], size_needed, nullptr, nullptr);
            }
        } else {
            // Fallback: generate a numbered device name
            char fallback_name[128];
            if (direction == eRender) {
                snprintf(fallback_name, sizeof(fallback_name), "Output Device %u", i + 1);
            } else {
                snprintf(fallback_name, sizeof(fallback_name), "Input Device %u", i + 1);
            }
            info.name = fallback_name;
        }

        info.is_default = (wstrId == defaultId);

        if (!info.id.empty() && !info.name.empty()) {
            devices.push_back(info);
        }
    }

    return devices;
}

std::vector<AudioDeviceInfo> get_output_devices() {
    return enumerate_devices(eRender);
}

std::vector<AudioDeviceInfo> get_input_devices() {
    return enumerate_devices(eCapture);
}

} // namespace clipvault
