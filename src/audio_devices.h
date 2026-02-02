#pragma once

#include <string>
#include <vector>
#include <windows.h>
#include <mmdeviceapi.h>

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