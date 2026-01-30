<#
.SYNOPSIS
    Download and setup OBS dependencies for ClipVault

.DESCRIPTION
    Downloads pre-built OBS Studio and extracts the required files:
    - libobs DLLs
    - Plugin DLLs (encoders, capture sources)
    - Data files (effects, locale)

.EXAMPLE
    .\setup-obs.ps1
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

# OBS version to use
$OBS_VERSION = "31.0.0"
$OBS_URL = "https://github.com/obsproject/obs-studio/releases/download/$OBS_VERSION/OBS-Studio-$OBS_VERSION-Windows.zip"

Write-Host "=== ClipVault OBS Setup ===" -ForegroundColor Cyan
Write-Host "OBS Version: $OBS_VERSION"

# Create directories
$ThirdParty = Join-Path $ProjectRoot "third_party"
$ObsDownload = Join-Path $ThirdParty "obs-download"
$BinDir = Join-Path $ProjectRoot "bin"

if (!(Test-Path $ThirdParty)) {
    New-Item -ItemType Directory -Path $ThirdParty | Out-Null
}

# Download OBS
$ZipPath = Join-Path $ThirdParty "obs-studio.zip"
if (!(Test-Path $ZipPath)) {
    Write-Host "`n[1/4] Downloading OBS Studio..."
    Write-Host "URL: $OBS_URL"

    try {
        Invoke-WebRequest -Uri $OBS_URL -OutFile $ZipPath -UseBasicParsing
        Write-Host "Download complete!" -ForegroundColor Green
    } catch {
        Write-Host "ERROR: Failed to download OBS" -ForegroundColor Red
        Write-Host $_.Exception.Message
        exit 1
    }
} else {
    Write-Host "`n[1/4] OBS already downloaded"
}

# Extract
if (!(Test-Path $ObsDownload)) {
    Write-Host "`n[2/4] Extracting OBS..."
    Expand-Archive -Path $ZipPath -DestinationPath $ObsDownload -Force
    Write-Host "Extraction complete!" -ForegroundColor Green
} else {
    Write-Host "`n[2/4] OBS already extracted"
}

# Find OBS root - could be directly in obs-download or in a subfolder
$ObsRoot = $ObsDownload
# Check if there's a bin/64bit directly, or if it's in a subfolder
if (!(Test-Path (Join-Path $ObsRoot "bin\64bit"))) {
    $ObsExtracted = Get-ChildItem -Path $ObsDownload -Directory | Select-Object -First 1
    if ($ObsExtracted) {
        $ObsRoot = $ObsExtracted.FullName
    }
}
Write-Host "OBS Root: $ObsRoot"

# Copy required files to bin/
Write-Host "`n[3/4] Copying required files to bin/..."

# Ensure bin directory exists
if (!(Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

# Copy ALL DLLs from bin/64bit/ (OBS has many dependencies)
Write-Host "  Copying all DLLs..."
$ObsBinDir = Join-Path $ObsRoot "bin\64bit"
Get-ChildItem -Path $ObsBinDir -Filter "*.dll" | ForEach-Object {
    Copy-Item $_.FullName -Destination $BinDir -Force
    Write-Host "    Copied: $($_.Name)"
}

# Also copy exe files needed
$CoreExes = @(
    "obs-ffmpeg-mux.exe"
)

foreach ($exe in $CoreExes) {
    $src = Join-Path $ObsBinDir $exe
    if (Test-Path $src) {
        Copy-Item $src -Destination $BinDir -Force
        Write-Host "    Copied: $exe"
    }
}

# Copy obs-plugins (encoders, capture sources)
$PluginSrc = Join-Path $ObsRoot "obs-plugins\64bit"
$PluginDst = Join-Path $BinDir "obs-plugins\64bit"
if (Test-Path $PluginSrc) {
    if (!(Test-Path $PluginDst)) {
        New-Item -ItemType Directory -Path $PluginDst -Force | Out-Null
    }

    # Key plugins we need
    $RequiredPlugins = @(
        "win-capture.dll",          # Monitor/window capture
        "win-wasapi.dll",           # Audio capture
        "obs-ffmpeg.dll",           # NVENC, AAC encoder
        "obs-x264.dll",             # x264 fallback
        "obs-outputs.dll"           # Replay buffer, file output
    )

    foreach ($plugin in $RequiredPlugins) {
        $src = Join-Path $PluginSrc $plugin
        if (Test-Path $src) {
            Copy-Item $src -Destination $PluginDst -Force
            Write-Host "  Copied plugin: $plugin"
        } else {
            Write-Host "  Warning: Plugin $plugin not found" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  Warning: Plugin directory not found" -ForegroundColor Yellow
}

# Copy data files
$DataSrc = Join-Path $ObsRoot "data"
$DataDst = Join-Path $BinDir "data"

if (Test-Path $DataSrc) {
    Write-Host "`n[4/4] Copying data files..."

    # Copy libobs data (effects, etc.)
    $LibobsDataSrc = Join-Path $DataSrc "libobs"
    $LibobsDataDst = Join-Path $DataDst "libobs"
    if (Test-Path $LibobsDataSrc) {
        if (Test-Path $LibobsDataDst) {
            Remove-Item -Recurse -Force $LibobsDataDst
        }
        Copy-Item -Path $LibobsDataSrc -Destination $LibobsDataDst -Recurse
        Write-Host "  Copied: data/libobs/"
    }

    # Copy plugin data
    $PluginDataSrc = Join-Path $DataSrc "obs-plugins"
    $PluginDataDst = Join-Path $DataDst "obs-plugins"
    if (Test-Path $PluginDataSrc) {
        if (Test-Path $PluginDataDst) {
            Remove-Item -Recurse -Force $PluginDataDst
        }
        Copy-Item -Path $PluginDataSrc -Destination $PluginDataDst -Recurse
        Write-Host "  Copied: data/obs-plugins/"
    }
} else {
    Write-Host "  Warning: Data directory not found" -ForegroundColor Yellow
}

# Clone OBS source for headers
$ObsSourceDir = Join-Path $ThirdParty "obs-studio-src"
if (!(Test-Path $ObsSourceDir)) {
    Write-Host "`n[Bonus] Cloning OBS source for headers..."
    git clone --depth 1 --branch $OBS_VERSION https://github.com/obsproject/obs-studio.git $ObsSourceDir 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Cloned OBS source for headers" -ForegroundColor Green
    } else {
        Write-Host "  Warning: Could not clone OBS source (headers may need manual setup)" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Files copied to bin/:"
Write-Host "  - Core DLLs (libobs.dll, ffmpeg, etc.)"
Write-Host "  - Plugin DLLs (obs-plugins/64bit/)"
Write-Host "  - Data files (data/libobs/, data/obs-plugins/)"
Write-Host ""
Write-Host "Next step: Run .\build.ps1 to build ClipVault"
