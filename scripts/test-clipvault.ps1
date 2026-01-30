#!/usr/bin/env pwsh
# ClipVault Comprehensive Content Validation Test
# Tests: Video is NOT black, Audio is NOT silent
# Run this test repeatedly to verify capture is working
# Usage: .\scripts\test-clipvault.ps1

param(
    [int]$NumVideoFrames = 30,
    [int]$AudioSampleSeconds = 5,
    [switch]$Help
)

if ($Help) {
    Write-Host "ClipVault Content Validation Test"
    Write-Host "================================"
    Write-Host ""
    Write-Host "Usage: .\scripts\test-clipvault.ps1"
    Write-Host ""
    Write-Host "Tests:"
    Write-Host "  - Video has real content (not all black)"
    Write-Host "  - Audio has real content (not silent)"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -NumVideoFrames <n>  Number of frames to check (default: 30)"
    Write-Host "  -AudioSampleSeconds <n>  Seconds of audio to analyze (default: 5)"
    Write-Host ""
    Write-Host "Run after saving a clip with F9"
    exit 0
}

$ErrorActionPreference = "Stop"

$FFmpegPath = "C:\Users\ebrar\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
$FFProbePath = "C:\Users\ebrar\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffprobe.exe"
$ClipsDir = "D:\Clips\ClipVault"

$TestResults = @{
    VideoPass = $false
    AudioPass = $false
    VideoDetails = @{}
    AudioDetails = @{}
    Errors = @()
}

function Write-TestHeader {
    param([string]$Message)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
}

function Write-TestResult {
    param([string]$Test, [bool]$Passed, [string]$Details = "")
    if ($Passed) {
        Write-Host "[PASS] " -ForegroundColor Green -NoNewline
        Write-Host $Test -ForegroundColor White
    } else {
        Write-Host "[FAIL] " -ForegroundColor Red -NoNewline
        Write-Host $Test -ForegroundColor White
    }
    if ($Details -and -not $Passed) {
        Write-Host "       $Details" -ForegroundColor Gray
    }
}

# ============================================
# SETUP
# ============================================
Write-TestHeader "ClipVault Content Validation Test"

$clips = Get-ChildItem -Path $ClipsDir -Filter "*.mp4" | Sort-Object LastWriteTime -Descending
if ($clips.Count -eq 0) {
    Write-Host "[FAIL] No MP4 files found in $ClipsDir" -ForegroundColor Red
    Write-Host ""
    Write-Host "To create a clip:" -ForegroundColor Yellow
    Write-Host "  1. Run .\bin\ClipVault.exe" -ForegroundColor Gray
    Write-Host "  2. Wait for buffer (15s configured)" -ForegroundColor Gray
    Write-Host "  3. Press F9 to save clip" -ForegroundColor Gray
    Write-Host "  4. Run this test" -ForegroundColor Gray
    exit 1
}

$clip = $clips[0]
Write-Host "Testing: $($clip.Name)" -ForegroundColor Gray
Write-Host "  Size: $([math]::Round($clip.Length / 1MB, 2)) MB" -ForegroundColor Gray
Write-Host "  Modified: $($clip.LastWriteTime)" -ForegroundColor Gray

# Get video info
$jsonOutput = & $FFProbePath -v error -show_format -show_streams -of json $clip.FullName 2>&1 | Where-Object { $_ -notlike "*ffmpeg*" }
$json = $jsonOutput | ConvertFrom-Json

$videoStream = $json.streams | Where-Object { $_.codec_type -eq "video" }
$audioStreams = $json.streams | Where-Object { $_.codec_type -eq "audio" }

Write-Host ""
Write-Host "Video: $($videoStream.codec_name) @ $($videoStream.width)x$($videoStream.height) @ $($videoStream.r_frame_rate)" -ForegroundColor Gray
Write-Host "Audio: $(@($audioStreams).Count) stream(s)" -ForegroundColor Gray

$duration = [double]$json.format.duration
$bitrate = [int]$json.format.bit_rate
Write-Host "Duration: $([math]::Round($duration, 2))s, Bitrate: $([math]::Round($bitrate / 1000, 0)) kb/s" -ForegroundColor Gray

# ============================================
# VIDEO CONTENT CHECK
# ============================================
Write-TestHeader "VIDEO CONTENT CHECK ($NumVideoFrames random frames)"

$tempDir = Join-Path $ClipsDir "temp_test_$([guid]::NewGuid().ToString('N').Substring(0,6))"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

try {
    $brightnessValues = @()
    $nonBlackFrames = 0
    $minBrightness = 255
    $maxBrightness = 0
    
    Write-Host "Extracting $NumVideoFrames frames at random positions..." -ForegroundColor Gray
    
    $random = [System.Random]::new()
    
    for ($i = 1; $i -le $NumVideoFrames; $i++) {
        # Random position between 5% and 95% of video
        $pos = ($duration * 0.05) + ($random.NextDouble() * $duration * 0.90)
        $posStr = [math]::Round($pos, 2).ToString()
        $frameFile = "$tempDir\frame_${i}.pgm"
        
        $null = & $FFmpegPath -v quiet -ss $posStr -i "$($clip.FullName)" -vframes 1 -vf "scale=160:90" -pix_fmt gray "$frameFile" 2>&1
        
        if (Test-Path $frameFile) {
            $bytes = [System.IO.File]::ReadAllBytes($frameFile)
            
            # Skip PGM header
            $headerEnd = 0
            for ($h = 0; $h -lt $bytes.Count - 1; $h++) {
                if ($bytes[$h] -eq 10 -and $bytes[$h+1] -ge 48 -and $bytes[$h+1] -le 57) {
                    $headerEnd = $h + 1
                    break
                }
            }
            
            $totalBrightness = 0
            $pixelCount = 0
            $nonZeroPixels = 0
            
            for ($p = $headerEnd; $p -lt $bytes.Count; $p++) {
                $b = $bytes[$p]
                $totalBrightness += $b
                $pixelCount++
                if ($b -gt 10) { $nonZeroPixels++ }
            }
            
            $avgBrightness = if ($pixelCount -gt 0) { $totalBrightness / $pixelCount } else { 0 }
            $nonZeroPercent = ($nonZeroPixels / $pixelCount) * 100
            
            $brightnessValues += [PSCustomObject]@{
                Position = $pos
                AvgBrightness = $avgBrightness
                NonZeroPercent = $nonZeroPercent
            }
            
            if ($avgBrightness -gt 20) { $nonBlackFrames++ }
            if ($avgBrightness -lt $minBrightness) { $minBrightness = $avgBrightness }
            if ($avgBrightness -gt $maxBrightness) { $maxBrightness = $avgBrightness }
        }
    }
    
    # Statistics
    $avgOverall = ($brightnessValues | Measure-Object -Property AvgBrightness -Average).Average
    $nonBlackPercent = ($nonBlackFrames / $NumVideoFrames) * 100
    
    Write-Host ""
    Write-Host "Results:" -ForegroundColor Gray
    Write-Host "  Frames analyzed: $NumVideoFrames" -ForegroundColor Gray
    Write-Host "  Non-black frames: $nonBlackFrames ($([math]::Round($nonBlackPercent, 0))%)" -ForegroundColor Gray
    Write-Host "  Min brightness: $([int]$minBrightness)/255" -ForegroundColor Gray
    Write-Host "  Max brightness: $([int]$maxBrightness)/255" -ForegroundColor Gray
    Write-Host "  Avg brightness: $([math]::Round($avgOverall, 1))/255" -ForegroundColor Gray
    
    # Store for report
    $TestResults.VideoDetails = @{
        FramesAnalyzed = $NumVideoFrames
        NonBlackFrames = $nonBlackFrames
        NonBlackPercent = $nonBlackPercent
        MinBrightness = $minBrightness
        MaxBrightness = $maxBrightness
        AvgBrightness = $avgOverall
        AllBrightnesses = $brightnessValues
    }
    
    # Video is black if avg brightness < 20 OR less than 50% of frames have content
    if ($avgOverall -lt 20 -or $nonBlackPercent -lt 50) {
        Write-TestResult "Video has content" $false "Avg brightness: $([math]::Round($avgOverall, 1)), Non-black: $([math]::Round($nonBlackPercent, 0))%"
        $TestResults.VideoPass = $false
    } else {
        Write-TestResult "Video has content" $true
        $TestResults.VideoPass = $true
    }
    
} catch {
    Write-TestResult "Video analysis" $false "Error: $_"
    $TestResults.Errors += "Video error: $_"
}

Remove-Item -Recurse -Path $tempDir -Force -ErrorAction SilentlyContinue

# ============================================
# AUDIO CONTENT CHECK
# ============================================
Write-TestHeader "AUDIO CONTENT CHECK ($AudioSampleSeconds seconds sampled)"

$tempWav = Join-Path $ClipsDir "temp_audio_test.wav"

try {
    Write-Host "Extracting $AudioSampleSeconds seconds of audio..." -ForegroundColor Gray
    
    $null = & $FFmpegPath -v quiet -y -i "$($clip.FullName)" -t $AudioSampleSeconds -vn -ac 1 -ar 44100 -sample_fmt s16 "$tempWav" 2>&1
    
    if (Test-Path $tempWav) {
        $bytes = [System.IO.File]::ReadAllBytes($tempWav)
        
        # WAV header is 44 bytes
        $dataStart = 44
        $totalSamples = [math]::Floor(($bytes.Count - $dataStart) / 2)
        
        $nonZeroCount = 0
        $totalAmplitude = 0
        $maxSample = 0
        $minSample = 0
        
        for ($i = $dataStart; $i -lt $bytes.Count; $i += 2) {
            # Read sample as unsigned 16-bit
            $byte1 = $bytes[$i]
            $byte2 = $bytes[$i+1]
            $sample = $byte1 + ($byte2 * 256)
            
            # Calculate amplitude (signed)
            $amplitude = if ($sample -gt 32767) { 65536 - $sample } else { $sample }
            
            # Check if sample is significant (above quantization noise threshold)
            # Threshold of 100 filters out near-silent audio
            $significantThreshold = 100
            if ($amplitude -gt $significantThreshold) {
                $nonZeroCount++
            }
            
            $totalAmplitude += $amplitude
            if ($amplitude -gt $maxSample) { $maxSample = $amplitude }
        }
        
        $nonZeroPercent = ($nonZeroCount / $totalSamples) * 100
        $avgAmplitude = if ($totalSamples -gt 0) { $totalAmplitude / $totalSamples } else { 0 }
        
        Write-Host ""
        Write-Host "Results:" -ForegroundColor Gray
        Write-Host "  Samples analyzed: $totalSamples" -ForegroundColor Gray
        Write-Host "  Significant samples (>100): $nonZeroCount ($( [math]::Round($nonZeroPercent, 2) )%)" -ForegroundColor Gray
        Write-Host "  Avg amplitude: $([math]::Round($avgAmplitude, 1))" -ForegroundColor Gray
        Write-Host "  Max amplitude: $maxSample" -ForegroundColor Gray
        
        # Store for report
        $TestResults.AudioDetails = @{
            SamplesAnalyzed = $totalSamples
            NonZeroSamples = $nonZeroCount
            NonZeroPercent = $nonZeroPercent
            AvgAmplitude = $avgAmplitude
            MaxAmplitude = $maxSample
        }
        
        # Audio is silent if less than 1% of samples are significant
        if ($nonZeroPercent -lt 1) {
            Write-TestResult "Audio has content" $false "Only $( [math]::Round($nonZeroPercent, 2) )% of samples are significant"
            $TestResults.AudioPass = $false
        } else {
            Write-TestResult "Audio has content" $true "$( [math]::Round($nonZeroPercent, 2) )% of samples have real audio"
            $TestResults.AudioPass = $true
        }
        
        # Audio is silent if less than 1% of samples are significant
        if ($nonZeroPercent -lt 1) {
            Write-TestResult "Audio has content" $false "Only $( [math]::Round($nonZeroPercent, 2) )% of samples are above threshold"
            $TestResults.AudioPass = $false
        } else {
            Write-TestResult "Audio has content" $true "$( [math]::Round($nonZeroPercent, 2) )% of samples have real audio"
            $TestResults.AudioPass = $true
        }
        
        Remove-Item $tempWav -Force
    } else {
        Write-TestResult "Audio extraction" $false "Could not extract audio"
        $TestResults.Errors += "Could not extract audio"
    }
} catch {
    Write-TestResult "Audio analysis" $false "Error: $_"
    $TestResults.Errors += "Audio error: $_"
}

# ============================================
# SUMMARY
# ============================================
Write-TestHeader "SUMMARY"

Write-Host ""
Write-Host "Video: $(if ($TestResults.VideoPass) { 'PASS - Has content' } else { 'FAIL - Video is BLACK!' })" -ForegroundColor $(if ($TestResults.VideoPass) { 'Green' } else { 'Red' })
Write-Host "Audio: $(if ($TestResults.AudioPass) { 'PASS - Has content' } else { 'FAIL - Audio is SILENT!' })" -ForegroundColor $(if ($TestResults.AudioPass) { 'Green' } else { 'Red' })

Write-Host ""
Write-Host "Test Parameters:" -ForegroundColor Gray
Write-Host "  Video frames checked: $NumVideoFrames" -ForegroundColor Gray
Write-Host "  Audio seconds sampled: $AudioSampleSeconds" -ForegroundColor Gray

if ($TestResults.VideoDetails.Count -gt 0) {
    Write-Host ""
    Write-Host "Video Details:" -ForegroundColor Gray
    Write-Host "  Non-black frames: $($TestResults.VideoDetails.NonBlackFrames)/$NumVideoFrames" -ForegroundColor Gray
    Write-Host "  Avg brightness: $([math]::Round($TestResults.VideoDetails.AvgBrightness, 1))/255" -ForegroundColor Gray
    Write-Host "  Brightness range: $([int]$TestResults.VideoDetails.MinBrightness) - $([int]$TestResults.VideoDetails.MaxBrightness)" -ForegroundColor Gray
}

if ($TestResults.AudioDetails.Count -gt 0) {
    Write-Host ""
    Write-Host "Audio Details:" -ForegroundColor Gray
    Write-Host "  Non-zero samples: $([math]::Round($TestResults.AudioDetails.NonZeroPercent, 2))%" -ForegroundColor Gray
    Write-Host "  Avg amplitude: $([math]::Round($TestResults.AudioDetails.AvgAmplitude, 1))" -ForegroundColor Gray
}

if (-not $TestResults.VideoPass -or -not $TestResults.AudioPass) {
    Write-Host ""
    Write-Host "DIAGNOSIS:" -ForegroundColor Red
    
    if (-not $TestResults.VideoPass) {
        Write-Host "  Video is BLACK - monitor_capture is not capturing screen content" -ForegroundColor Yellow
        Write-Host "  Check:" -ForegroundColor Gray
        Write-Host "    - Is a window visible on screen?" -ForegroundColor Gray
        Write-Host "    - Is the screen locked?" -ForegroundColor Gray
        Write-Host "    - Check scene/source configuration in capture.cpp" -ForegroundColor Gray
    }
    
    if (-not $TestResults.AudioPass) {
        Write-Host "  Audio is SILENT - wasapi capture is not capturing sound" -ForegroundColor Yellow
        Write-Host "  Check:" -ForegroundColor Gray
        Write-Host "    - Is system audio playing?" -ForegroundColor Gray
        Write-Host "    - Is microphone connected?" -ForegroundColor Gray
        Write-Host "    - Check Windows volume mixer settings" -ForegroundColor Gray
        Write-Host "    - Check source configuration in capture.cpp" -ForegroundColor Gray
    }
    
    exit 1
}

Write-Host ""
Write-Host "All content checks passed!" -ForegroundColor Green
exit 0