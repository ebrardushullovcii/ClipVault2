# Validate specific clip file
param([string]$ClipPath = "D:\Clips\ClipVault\2026-01-31_00-17-21.mp4")

Write-Host "========================================"
Write-Host "Validating Clip: $(Split-Path $ClipPath -Leaf)"
Write-Host "========================================"

# Video check - extract 10 frames at different positions
$framePositions = @(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0)
$nonBlackFrames = 0
$totalBrightness = 0
$frameCount = 0

foreach ($pos in $framePositions) {
    $tempFrame = "D:\Clips\ClipVault\temp_frame_$frameCount.png"
    ffmpeg -i "$ClipPath" -ss "$($pos * 100)%" -vframes 1 -f image2 "$tempFrame" -y 2>$null
    
    if (Test-Path $tempFrame) {
        # Get frame statistics
        $stats = ffmpeg -i "$tempFrame" -vf "format=gray,showinfo" -f null - 2>&1 | Select-String "mean"
        if ($stats -match 'mean:\s*\[?([^\]]+)\]?') {
            $brightness = [float]$matches[1]
            $totalBrightness += $brightness
            if ($brightness -gt 10) { $nonBlackFrames++ }
        }
        Remove-Item $tempFrame -Force -ErrorAction SilentlyContinue
    }
    $frameCount++
}

$avgBrightness = if ($frameCount -gt 0) { $totalBrightness / $frameCount } else { 0 }
Write-Host "Video Check:"
Write-Host "  Frames analyzed: $frameCount"
Write-Host "  Non-black frames: $nonBlackFrames"
Write-Host "  Avg brightness: $([math]::Round($avgBrightness, 1))/255"

if ($nonBlackFrames -gt 0) {
    Write-Host "  [PASS] Video has CONTENT!" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Video is BLACK" -ForegroundColor Red
}

# Audio check
$tempAudio = "D:\Clips\ClipVault\temp_audio.wav"
ffmpeg -i "$ClipPath" -t 3 -vn -acodec pcm_s16le -ar 44100 -ac 2 "$tempAudio" -y 2>$null

if (Test-Path $tempAudio) {
    $audioInfo = ffmpeg -i "$tempAudio" -af "volumedetect" -f null - 2>&1 | Select-String "max_volume|mean_volume"
    $maxVol = ($audioInfo | Select-String "max_volume" | Select-Object -First 1)
    $meanVol = ($audioInfo | Select-String "mean_volume" | Select-Object -First 1)
    
    Write-Host "`nAudio Check:"
    Write-Host "  $maxVol"
    Write-Host "  $meanVol"
    
    if ($maxVol -match '-\d+\.\d+ dB') {
        $maxDb = [float]$matches[0].Replace(' dB', '')
        if ($maxDb -gt -60) {
            Write-Host "  [PASS] Audio has CONTENT!" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Audio is SILENT" -ForegroundColor Red
        }
    }
    
    Remove-Item $tempAudio -Force -ErrorAction SilentlyContinue
}

Write-Host "`n========================================" 
