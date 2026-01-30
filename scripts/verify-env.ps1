#!/usr/bin/env pwsh
# Environment Verification Script for ClipVault
# Run this before starting any development work

$ErrorActionPreference = "Stop"
$hasErrors = $false

Write-Host "=== ClipVault Environment Verification ===" -ForegroundColor Cyan
Write-Host ""

# Check 1: Required files exist
Write-Host "[1/6] Checking required files..." -ForegroundColor Yellow
$requiredFiles = @(
    "AGENTS.md",
    "AGENT_WORKFLOW.md",
    "PLAN.md",
    "CMakeLists.txt",
    ".clangd",
    "CMakePresets.json",
    "src/main.cpp",
    "src/logger.cpp",
    "src/config.cpp",
    "src/obs_core.cpp",
    "src/capture.cpp",
    "src/encoder.cpp",
    "src/tray.cpp",
    "src/replay.h",
    "src/hotkey.h"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file MISSING" -ForegroundColor Red
        $missingFiles += $file
        $hasErrors = $true
    }
}

# Check 2: OBS source present
Write-Host ""
Write-Host "[2/6] Checking OBS dependencies..." -ForegroundColor Yellow
if (Test-Path "third_party/obs-studio-src/libobs/obs.h") {
    Write-Host "  ✓ OBS headers found" -ForegroundColor Green
    $obsHeaders = (Get-ChildItem "third_party/obs-studio-src/libobs/*.h" | Measure-Object).Count
    Write-Host "    Found $obsHeaders header files" -ForegroundColor Gray
} else {
    Write-Host "  ✗ OBS headers NOT found" -ForegroundColor Red
    Write-Host "    Run: .\build.ps1 -Setup" -ForegroundColor Yellow
    $hasErrors = $true
}

# Check 3: Build tools
Write-Host ""
Write-Host "[3/6] Checking build tools..." -ForegroundColor Yellow

$tools = @(
    @{ Name = "CMake"; Command = "cmake" },
    @{ Name = "MinGW/GCC"; Command = "g++" },
    @{ Name = "Git"; Command = "git" }
)

foreach ($tool in $tools) {
    try {
        $null = Get-Command $tool.Command -ErrorAction Stop
        $version = & $tool.Command --version 2>&1 | Select-Object -First 1
        Write-Host "  ✓ $($tool.Name)" -ForegroundColor Green
        Write-Host "    $version" -ForegroundColor Gray
    } catch {
        Write-Host "  ✗ $($tool.Name) NOT found" -ForegroundColor Red
        Write-Host "    Install: scoop install $($tool.Name.ToLower())" -ForegroundColor Yellow
        $hasErrors = $true
    }
}

# Check 4: LSP setup
Write-Host ""
Write-Host "[4/6] Checking LSP (clangd) setup..." -ForegroundColor Yellow
try {
    $clangdVersion = & clangd --version 2>&1 | Select-Object -First 1
    Write-Host "  ✓ clangd installed" -ForegroundColor Green
    Write-Host "    $clangdVersion" -ForegroundColor Gray
} catch {
    Write-Host "  ✗ clangd NOT found" -ForegroundColor Red
    Write-Host "    Install: scoop install llvm" -ForegroundColor Yellow
    $hasErrors = $true
}

if (Test-Path "build/compile_commands.json") {
    Write-Host "  ✓ compile_commands.json exists" -ForegroundColor Green
} else {
    Write-Host "  ⚠ compile_commands.json NOT found" -ForegroundColor Yellow
    Write-Host "    Run: .\build.ps1" -ForegroundColor Yellow
}

# Check 5: Build artifacts
Write-Host ""
Write-Host "[5/6] Checking build artifacts..." -ForegroundColor Yellow
if (Test-Path "bin/ClipVault.exe") {
    $exeInfo = Get-Item "bin/ClipVault.exe"
    Write-Host "  ✓ ClipVault.exe exists" -ForegroundColor Green
    Write-Host "    Size: $([math]::Round($exeInfo.Length/1KB, 2)) KB" -ForegroundColor Gray
    Write-Host "    Modified: $($exeInfo.LastWriteTime)" -ForegroundColor Gray
} else {
    Write-Host "  ⚠ ClipVault.exe NOT found (needs build)" -ForegroundColor Yellow
}

# Check 6: Git config
Write-Host ""
Write-Host "[6/6] Checking Git configuration..." -ForegroundColor Yellow
$gitName = git config user.name 2>$null
$gitEmail = git config user.email 2>$null

if ($gitName -and $gitEmail) {
    Write-Host "  ✓ Git user configured" -ForegroundColor Green
    Write-Host "    Name: $gitName" -ForegroundColor Gray
    Write-Host "    Email: $gitEmail" -ForegroundColor Gray
} else {
    Write-Host "  ⚠ Git user NOT configured" -ForegroundColor Yellow
    Write-Host "    Run: git config user.name 'Your Name'" -ForegroundColor Yellow
    Write-Host "    Run: git config user.email 'your@email.com'" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "=== Verification Summary ===" -ForegroundColor Cyan

if ($hasErrors) {
    Write-Host "❌ ENVIRONMENT NOT READY" -ForegroundColor Red
    Write-Host ""
    Write-Host "Missing critical components. Please fix the errors above." -ForegroundColor Red
    if ($missingFiles.Count -gt 0) {
        Write-Host ""
        Write-Host "Missing files:"
        $missingFiles | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    }
    exit 1
} else {
    Write-Host "✅ ENVIRONMENT READY" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now start development. Next steps:" -ForegroundColor Green
    Write-Host "  1. Read AGENT_WORKFLOW.md for the development process" -ForegroundColor White
    Write-Host "  2. Check PLAN.md for current phase" -ForegroundColor White
    Write-Host "  3. Run .\build.ps1 to verify build works" -ForegroundColor White
    exit 0
}
