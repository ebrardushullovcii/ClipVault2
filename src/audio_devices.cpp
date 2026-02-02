#include "audio_devices.h"
#include "logger.h"
#include <windows.h>
#include <mmsystem.h>
#include <mmdeviceapi.h>
#include <functiondiscoverykeys_devpkey.h>
#include <propsys.h>
#include <string>
#include <vector>
#include <map>

#pragma comment(lib, "winmm.lib")
#pragma comment(lib, "uuid.lib")

namespace clipvault {

static bool com_initialized = false;

/**
 * @brief Ensures COM is initialized for the current thread using the apartment-threaded model.
 *
 * Initializes COM once and records that initialization succeeded; subsequent calls are a no-op.
 * If COM was initialized with a different threading model (RPC_E_CHANGED_MODE), this function
 * still treats that state as initialized.
 */
void initialize_com() {
    if (!com_initialized) {
        HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        if (SUCCEEDED(hr) || hr == RPC_E_CHANGED_MODE) {
            com_initialized = true;
        }
    }
}

template<typename T>
class ComPtr {
public:
    /**
 * @brief Default-constructs the smart pointer.
 *
 * Initializes the internal COM interface pointer to nullptr.
 */
ComPtr() : ptr_(nullptr) {}
    /**
 * @brief Constructs a ComPtr that manages the given raw COM pointer.
 *
 * The provided pointer becomes owned by this ComPtr instance; the constructor
 * does not call `AddRef`. Passing `nullptr` is allowed.
 *
 * @param ptr Raw COM interface pointer to take ownership of.
 */
ComPtr(T* ptr) : ptr_(ptr) {}
    /**
 * @brief Releases the held COM interface, if any.
 *
 * Calls `Release()` on the managed interface pointer when the ComPtr is destroyed.
 */
~ComPtr() { if (ptr_) ptr_->Release(); }

    /**
 * @brief Accesses the underlying COM interface pointer.
 *
 * @return T* The stored interface pointer, or `nullptr` if no pointer is held.
 */
T* operator->() const { return ptr_; }
    /**
 * @brief Access the stored raw COM interface pointer.
 *
 * @return T* The raw pointer managed by this ComPtr, or `nullptr` if no pointer is held.
 */
T* get() const { return ptr_; }
    /**
 * @brief Get the address of the internal pointer for use with APIs that return a `T*` via an out-parameter.
 *
 * @return T** Address of the stored COM interface pointer.
 */
T** addressof() { return &ptr_; }
    /**
 * @brief Replaces the held COM pointer and releases the previously held interface.
 *
 * Transfers ownership of the provided raw COM pointer into this ComPtr: if an existing
 * interface pointer is held it is released, and the internal pointer is set to `ptr`.
 * The new pointer is stored as-is; this function does not call `AddRef` on `ptr`.
 *
 * @param ptr Raw COM interface pointer to take ownership of (may be nullptr).
 */
void reset(T* ptr) { if (ptr_) ptr_->Release(); ptr_ = ptr; }

private:
    T* ptr_;
};

/**
 * @brief Retrieve a friendly name for a WASAPI device from its property store.
 *
 * Attempts to read common friendly-name properties in priority order (PKEY_DeviceInterface_FriendlyName,
 * then PKEY_Device_FriendlyName) and returns the first non-empty value found. If the device's property
 * store cannot be opened or no suitable name is available, an empty string is returned.
 *
 * @param device IMMDevice pointer representing the audio endpoint to query.
 * @return std::wstring The device friendly name if found, or an empty string otherwise.
 */
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

/**
 * @brief Retrieve the device identifier string for a WASAPI IMMDevice.
 *
 * @param device Pointer to the IMMDevice to query.
 * @return std::wstring The device ID as a wide string, or an empty string if the ID could not be obtained.
 */
std::wstring get_device_id(IMMDevice* device) {
    LPWSTR wstrId = nullptr;
    if (SUCCEEDED(device->GetId(&wstrId))) {
        std::wstring result = wstrId;
        CoTaskMemFree(wstrId);
        return result;
    }
    return L"";
}

// Get device name using Windows Multimedia API (waveOut/waveIn)
/**
 * @brief Collects friendly names for legacy waveIn and waveOut audio devices.
 *
 * Queries the system's legacy Windows Multimedia APIs (waveOut/waveIn) for device
 * capabilities and records the device display names reported in WAVEOUTCAPSW/WAVEINCAPSW.szPname.
 * Keys use the form `waveout_<index>` for output devices and `wavein_<index>` for input devices,
 * where `<index>` is the device index passed to the respective wave API. Devices that fail to
 * report capabilities are omitted. These legacy names can be more descriptive than WASAPI names.
 *
 * @return std::map<std::wstring, std::wstring> Map from device key to device display name.
 */
std::map<std::wstring, std::wstring> get_wave_device_names() {
    std::map<std::wstring, std::wstring> device_names;

    // Get waveOut (output) devices
    UINT num_outputs = waveOutGetNumDevs();
    for (UINT i = 0; i < num_outputs; i++) {
        WAVEOUTCAPSW caps;
        if (waveOutGetDevCapsW(i, &caps, sizeof(caps)) == MMSYSERR_NOERROR) {
            // Store with index as key for now
            std::wstring key = L"waveout_" + std::to_wstring(i);
            device_names[key] = caps.szPname;
        }
    }

    // Get waveIn (input) devices
    UINT num_inputs = waveInGetNumDevs();
    for (UINT i = 0; i < num_inputs; i++) {
        WAVEINCAPSW caps;
        if (waveInGetDevCapsW(i, &caps, sizeof(caps)) == MMSYSERR_NOERROR) {
            std::wstring key = L"wavein_" + std::to_wstring(i);
            device_names[key] = caps.szPname;
        }
    }

    return device_names;
}

/**
 * @brief Enumerates audio endpoints for the given data flow and returns their metadata.
 *
 * Retrieves active audio endpoints (render or capture), collects each device's ID and friendly name,
 * marks the system default device, and synthesizes a numbered fallback name when a friendly name is unavailable.
 *
 * @param direction The data flow to enumerate: eRender for output devices or eCapture for input devices.
 * @return std::vector<AudioDeviceInfo> A list of AudioDeviceInfo entries containing the device UTF-8 ID, display name, and an is_default flag.
 */
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
    if (direction == eRender) {
        enumerator->GetDefaultAudioEndpoint(eRender, eConsole, defaultDevice.addressof());
    } else {
        enumerator->GetDefaultAudioEndpoint(eCapture, eConsole, defaultDevice.addressof());
    }

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

        AudioDeviceInfo info;
        info.id = "default";
        info.is_default = false;

        // Convert wide strings to UTF-8
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

/**
 * @brief Retrieves available audio output (render) devices.
 *
 * Enumerates system audio render endpoints and returns their metadata.
 *
 * @return std::vector<AudioDeviceInfo> A list of AudioDeviceInfo entries for output devices; each entry contains the device id, human-readable name, and an `is_default` flag for the system default output.
 */
std::vector<AudioDeviceInfo> get_output_devices() {
    return enumerate_devices(eRender);
}

/**
 * @brief Retrieves the available audio capture (input) devices.
 *
 * Enumerates system audio endpoints for capture direction and returns information
 * for each discovered device, including its identifier, display name, and whether
 * it is the system default.
 *
 * @return std::vector<AudioDeviceInfo> A list of AudioDeviceInfo entries for input devices.
 */
std::vector<AudioDeviceInfo> get_input_devices() {
    return enumerate_devices(eCapture);
}

} // namespace clipvault