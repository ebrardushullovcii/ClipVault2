<#
.SYNOPSIS
    Build script for ClipVault

.PARAMETER Clean
    Remove build directory before building

.PARAMETER Run
    Run the application after building

.PARAMETER Debug
    Build with debug configuration

.PARAMETER Setup
    First-time setup (clone OBS, build libobs)

.EXAMPLE
    .\build.ps1
    .\build.ps1 -Clean
    .\build.ps1 -Run
    .\build.ps1 -Setup
#>

param(
    [switch]$Clean,
    [switch]$Run,
    [switch]$Debug,
    [switch]$Setup
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host "=== ClipVault Build ===" -ForegroundColor Cyan

# Check for required tools
function Check-Tool {
    param([string]$Name, [string]$Command)

    if (!(Get-Command $Command -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: $Name not found. Install with: scoop install $Name" -ForegroundColor Red
        exit 1
    }
}

Check-Tool "CMake" "cmake"
Check-Tool "MinGW" "g++"

# Setup - clone OBS and build libobs
if ($Setup) {
    Write-Host "`n[Setup] This will clone OBS Studio and build libobs..." -ForegroundColor Yellow

    # Create third_party directory
    $ThirdParty = Join-Path $ProjectRoot "third_party"
    if (!(Test-Path $ThirdParty)) {
        New-Item -ItemType Directory -Path $ThirdParty | Out-Null
    }

    # Clone OBS if not present
    $ObsDir = Join-Path $ThirdParty "obs-studio"
    if (!(Test-Path $ObsDir)) {
        Write-Host "Cloning OBS Studio (this may take a while)..."
        git clone --depth 1 --branch 30.0.0 https://github.com/obsproject/obs-studio.git $ObsDir
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Failed to clone OBS Studio" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "OBS Studio already cloned"
    }

    Write-Host "`n[Setup] OBS cloned. Building libobs will be added in Phase 1.2" -ForegroundColor Green
    Write-Host "For now, the basic build system is ready.`n"
}

# Clean
if ($Clean) {
    Write-Host "`n[Clean] Removing build directory..."
    $BuildDir = Join-Path $ProjectRoot "build"
    if (Test-Path $BuildDir) {
        Remove-Item -Recurse -Force $BuildDir
    }

    $BinExe = Join-Path $ProjectRoot "bin\ClipVault.exe"
    if (Test-Path $BinExe) {
        Remove-Item -Force $BinExe
    }
}

# Create build directory
$BuildDir = Join-Path $ProjectRoot "build"
if (!(Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir | Out-Null
}

# Configure
Write-Host "`n[Configure] Running CMake..."
$BuildType = if ($Debug) { "Debug" } else { "Release" }

Push-Location $BuildDir
try {
    # Explicitly specify MinGW compilers to avoid Clang being picked up
    $env:CC = "gcc"
    $env:CXX = "g++"
    cmake .. -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=$BuildType -DCMAKE_C_COMPILER=gcc -DCMAKE_CXX_COMPILER=g++
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: CMake configuration failed" -ForegroundColor Red
        exit 1
    }

    # Build
    Write-Host "`n[Build] Compiling..."
    cmake --build . --parallel
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Build failed" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "`n[Success] Build complete!" -ForegroundColor Green
Write-Host "Output: bin\ClipVault.exe"

# Copy MinGW runtime DLLs (required for the backend to run on other PCs)
Write-Host "`n[Copy] Copying MinGW runtime DLLs..."
$MinGWPath = (Get-Command g++).Source | Split-Path
$MinGWDLLs = @("libgcc_s_seh-1.dll", "libstdc++-6.dll", "libwinpthread-1.dll")
$DestDir = Join-Path $ProjectRoot "bin"

foreach ($dll in $MinGWDLLs) {
    $Src = Join-Path $MinGWPath $dll
    if (Test-Path $Src) {
        Copy-Item $Src $DestDir -Force
        Write-Host "  Copied: $dll" -ForegroundColor Gray
    } else {
        Write-Host "  WARNING: $dll not found in MinGW directory" -ForegroundColor Yellow
    }
}

# Copy FFmpeg tools (required for video metadata and thumbnails)
Write-Host "`n[Copy] Copying FFmpeg tools..."
$FFmpegPath = (Get-Command ffprobe).Source | Split-Path
$FFmpegTools = @("ffprobe.exe", "ffmpeg.exe")

foreach ($tool in $FFmpegTools) {
    $Src = Join-Path $FFmpegPath $tool
    if (Test-Path $Src) {
        Copy-Item $Src $DestDir -Force
        Write-Host "  Copied: $tool" -ForegroundColor Gray
    } else {
        Write-Host "  WARNING: $tool not found" -ForegroundColor Yellow
    }
}

# Copy clip saved sound (notification)
Write-Host "`n[Copy] Copying clip saved sound..."
$ClipSoundSrc = Join-Path $ProjectRoot "ui/resources/bin/clip_saved.wav"
$ClipSoundDest = Join-Path $DestDir "clip_saved.wav"
if (Test-Path $ClipSoundSrc) {
    Copy-Item $ClipSoundSrc $ClipSoundDest -Force
    Write-Host "  Copied: clip_saved.wav" -ForegroundColor Gray
} else {
    Write-Host "  WARNING: clip_saved.wav not found in ui/resources/bin" -ForegroundColor Yellow
}

# Copy NVENC files (required for NVENC hardware encoding)
Write-Host "`n[Copy] Copying NVENC files for hardware encoding..."

# Copy obs-nvenc.dll plugin
$NVEncSource = Join-Path $ProjectRoot "third_party/obs-download/obs-plugins/64bit/obs-nvenc.dll"
$NVEncDest = Join-Path $DestDir "obs-plugins/64bit/obs-nvenc.dll"
if (Test-Path $NVEncSource) {
    $NVEncDestDir = Split-Path $NVEncDest -Parent
    if (!(Test-Path $NVEncDestDir)) {
        New-Item -ItemType Directory -Path $NVEncDestDir -Force | Out-Null
    }
    Copy-Item $NVEncSource $NVEncDest -Force
    Write-Host "  Copied: obs-nvenc.dll" -ForegroundColor Gray
} else {
    Write-Host "  WARNING: obs-nvenc.dll not found in third_party/obs-download" -ForegroundColor Yellow
}

# Copy obs-nvenc-test.exe (CRITICAL: OBS uses this to detect NVENC capability)
$NVEncTestSource = Join-Path $ProjectRoot "third_party/obs-download/bin/64bit/obs-nvenc-test.exe"
$NVEncTestDest = Join-Path $DestDir "obs-nvenc-test.exe"
if (Test-Path $NVEncTestSource) {
    Copy-Item $NVEncTestSource $NVEncTestDest -Force
    Write-Host "  Copied: obs-nvenc-test.exe (NVENC capability detector)" -ForegroundColor Gray
} else {
    Write-Host "  WARNING: obs-nvenc-test.exe not found - NVENC may not work!" -ForegroundColor Yellow
}

# Run
if ($Run) {
    Write-Host "`n[Run] Starting ClipVault..."
    $Exe = Join-Path $ProjectRoot "bin\ClipVault.exe"
    if (Test-Path $Exe) {
        & $Exe
    } else {
        Write-Host "ERROR: Executable not found" -ForegroundColor Red
        exit 1
    }
}
