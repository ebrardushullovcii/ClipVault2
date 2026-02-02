#pragma once

#include <string>
#include <vector>
#include <windows.h>
#include <mmdeviceapi.h>

/**
 * Information about an audio device.
 *
 * Contains the device identifier, a human-readable name, and whether the device
 * is the default for its data flow category.
 */
 
/**
 * @var std::string AudioDeviceInfo::id
 * Device identifier suitable for selecting the device in APIs.
 */

/**
 * @var std::string AudioDeviceInfo::name
 * Human-readable device name.
 */

/**
 * @var bool AudioDeviceInfo::is_default
 * `true` if this device is the system default for its data flow, `false` otherwise.
 */

/**
 * Retrieve available output (render) audio devices.
 *
 * @returns A vector of AudioDeviceInfo objects describing output-capable devices.
 */
 
/**
 * Retrieve available input (capture) audio devices.
 *
 * @returns A vector of AudioDeviceInfo objects describing input-capable devices.
 */

/**
 * Enumerate audio devices filtered by data flow direction.
 *
 * @param direction The EDataFlow value specifying the device data flow (e.g., eRender for output, eCapture for input).
 * @returns A vector of AudioDeviceInfo objects for devices that match the specified data flow.
 */
namespace clipvault {

struct AudioDeviceInfo {
    std::string id;
    std::string name;
    bool is_default;
};

std::vector<AudioDeviceInfo> get_output_devices();
std::vector<AudioDeviceInfo> get_input_devices();
std::vector<AudioDeviceInfo> enumerate_devices(EDataFlow direction);

} // namespace clipvault