# Test ClipVault with new build
Write-Host "Starting ClipVault test..."

# Delete old clips
Remove-Item -Path 'D:\Clips\ClipVault\*.mp4' -Force -ErrorAction SilentlyContinue
Write-Host "Old clips deleted"

# Start ClipVault
$proc = Start-Process -FilePath '.\bin\ClipVault.exe' -WindowStyle Hidden -PassThru
Write-Host "ClipVault started (PID: $($proc.Id))"

# Wait for buffer to fill (130 seconds for 120 sec / 2 minute buffer)
Write-Host "Waiting 2 minutes 10 seconds for buffer to fill..."
Start-Sleep -Seconds 130

# Press F9 to save
Write-Host "Pressing F9 to save clip..."
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('{F9}')

# Wait for save to complete
Write-Host "Waiting 3 seconds for save..."
Start-Sleep -Seconds 3

# Stop ClipVault
Write-Host "Stopping ClipVault..."
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue

# Check for clip
$clips = Get-ChildItem -Path 'D:\Clips\ClipVault\*.mp4' -ErrorAction SilentlyContinue
if ($clips) {
    Write-Host "SUCCESS: Clip saved!"
    $clips | ForEach-Object { Write-Host "  - $($_.Name) ($([math]::Round($_.Length/1MB, 2)) MB)" }
} else {
    Write-Host "ERROR: No clip found!"
}
