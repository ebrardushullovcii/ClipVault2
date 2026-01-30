# Quick validation of latest clip
$clip = Get-ChildItem -Path 'D:\Clips\ClipVault\*.mp4' | Sort-Object LastWriteTime -Descending | Select-Object -First 1

Write-Host "Checking: $($clip.Name)" -ForegroundColor Cyan

# Check streams
$streams = ffmpeg -i $clip.FullName 2>&1
$videoStream = $streams | Select-String "Video:" | Select-Object -First 1
$audioStreams = $streams | Select-String "Audio:" 

Write-Host "`nStreams found:"
Write-Host "  $videoStream"
$audioStreams | ForEach-Object { Write-Host "  $_" }

# Extract a short audio sample and check volume
$tempWav = [System.IO.Path]::GetTempFileName() + ".wav"
ffmpeg -i $clip.FullName -t 2 -vn -acodec pcm_s16le -ar 44100 -ac 2 $tempWav -y 2>$null

if (Test-Path $tempWav) {
    $volDetect = ffmpeg -i $tempWav -af "volumedetect" -f null - 2>&1 | Select-String "max_volume"
    Write-Host "`nAudio volume check:"
    if ($volDetect) {
        Write-Host "  $volDetect"
        if ($volDetect -match '-\d+\.\d+') {
            $db = [float]$matches[0]
            if ($db -gt -60) {
                Write-Host "  [PASS] Audio has content! ($db dB)" -ForegroundColor Green
            } else {
                Write-Host "  [FAIL] Audio is silent ($db dB)" -ForegroundColor Red
            }
        }
    }
    Remove-Item $tempWav -Force -ErrorAction SilentlyContinue
}

Write-Host ""
