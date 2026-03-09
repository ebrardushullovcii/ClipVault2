@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "PWSH_PATH=%ProgramFiles%\PowerShell\7\pwsh.exe"
set "WINDOWS_PS_PATH=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

if exist "%PWSH_PATH%" (
    "%PWSH_PATH%" -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\build.ps1" %*
    exit /b %ERRORLEVEL%
)

if exist "%WINDOWS_PS_PATH%" (
    "%WINDOWS_PS_PATH%" -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\build.ps1" %*
    exit /b %ERRORLEVEL%
)

echo ERROR: Could not find PowerShell at "%PWSH_PATH%" or "%WINDOWS_PS_PATH%".
exit /b 1
