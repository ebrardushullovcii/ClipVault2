# ClipVault Testing Guide

## Content Validation Test (Primary Test)

The most important test validates that recorded clips have **real content** (not black video, not silent audio).

### Running the Test

```powershell
# Run after saving a clip with F9
.\scripts\test-clipvault.ps1

# With custom parameters
.\scripts\test-clipvault.ps1 -NumVideoFrames 30 -AudioSampleSeconds 5
```

### What It Checks

| Check | Description | Method |
|-------|-------------|--------|
| **Video Content** | Extracts 30 random frames and checks brightness | Frames with avg brightness < 20 are considered black |
| **Audio Content** | Analyzes 5 seconds of audio samples | Samples with amplitude > 100 are considered significant |

### Test Output

```
========================================
ClipVault Content Validation Test
========================================
Testing: 2026-01-30_22-47-15.mp4
  Size: 3.48 MB

Video: h264 @ 1920x1080 @ 60/1
Audio: 2 stream(s)
Duration: 11.58s, Bitrate: 2522 kb/s

========================================
VIDEO CONTENT CHECK (30 random frames)
========================================
Extracting 30 frames at random positions...

Results:
  Frames analyzed: 30
  Non-black frames: 0 (0%)
  Min brightness: 0/255
  Max brightness: 0/255
  Avg brightness: 0/255
[FAIL] Video has content
       Avg brightness: 0, Non-black: 0%

========================================
AUDIO CONTENT CHECK (5 seconds sampled)
========================================
Extracting 5 seconds of audio...

Results:
  Samples analyzed: 220517
  Significant samples (>100): 13 (0.01%)
  Avg amplitude: 1.1
[FAIL] Audio has content
       Only 0.01% of samples are significant

========================================
SUMMARY
========================================

Video: FAIL - Video is BLACK!
Audio: FAIL - Audio is SILENT!

DIAGNOSIS:
  Video is BLACK - monitor_capture is not capturing screen content
  Audio is SILENT - wasapi capture is not capturing sound
```

### Interpreting Results

**Video Results:**
| Result | Meaning |
|--------|---------|
| PASS | Avg brightness > 20, at least 50% of frames have content |
| FAIL | Video is entirely black (brightness = 0) |

**Audio Results:**
| Result | Meaning |
|--------|---------|
| PASS | > 1% of samples have amplitude > 100 |
| FAIL | Audio is essentially silent (only quantization noise) |

## Debugging Capture Issues

### If Video is BLACK

1. **Check scene rendering in log:**
   ```powershell
   Select-String "Scene source" .\bin\clipvault.log
   ```
   Should show: "Scene source: VALID (active: YES)"

2. **Check video source:**
   ```powershell
   Select-String "Video source" .\bin\clipvault.log
   ```

3. **Verify monitor_capture is being used:**
   ```powershell
   Select-String "monitor_capture" .\bin\clipvault.log
   ```

4. **Common causes:**
   - Scene not properly connected to replay output
   - Capture source not added to scene
   - Screen locked or no visible windows

### If Audio is SILENT

1. **Check audio sources in log:**
   ```powershell
   Select-String "Desktop audio" .\bin\clipvault.log
   Select-String "Microphone" .\bin\clipvault.log
   ```

2. **Verify WASAPI devices in Windows:**
   - Check volume mixer (Win + R, `sndvol`)
   - Ensure desktop audio is not muted
   - Ensure microphone is connected and enabled

3. **Common causes:**
   - Audio device muted in Windows
   - No audio playing during recording
   - Microphone not connected
   - Incorrect WASAPI source configuration

## Manual Verification Commands

```powershell
# Watch logs during development
Get-Content .\bin\clipvault.log -Wait -Tail 20

# Check clip streams
ffprobe -v error -show_format -show_streams -of json "D:\Clips\ClipVault\*.mp4"

# Extract and view a frame
ffmpeg -ss 5 -i "D:\Clips\ClipVault\*.mp4" -vframes 1 frame.jpg

# Check audio tracks
ffprobe -show_streams -select_streams a "D:\Clips\ClipVault\*.mp4"

# Extract audio for analysis
ffmpeg -i "D:\Clips\ClipVault\*.mp4" -t 5 -vn audio.wav
```

## Expected Log Output (Working State)

```
[INFO] [REPLAY] Buffer Duration: 15 seconds
[INFO] [REPLAY] Scene source connected to output (this renders the video)
[INFO] Initializing capture sources...
[INFO]   Using monitor_capture (DXGI method - most reliable)
[INFO]   Creating desktop audio capture...
[INFO]     Desktop audio -> Track 1
[INFO]   Creating microphone capture...
[INFO]     Microphone -> Track 2
[INFO]   Video source added to scene
[INFO]   Scene set as output source
```

## Agent Workflow for Capture Bugs

When fixing capture issues, use this workflow:

1. **Run ClipVault with a visible window and audio playing**
2. **Press F9 to save a clip**
3. **Run content validation:**
   ```powershell
   .\scripts\test-clipvault.ps1
   ```
4. **Check results:**
   - If both FAIL: Bug in capture.cpp (sources/scene setup)
   - If only video FAIL: Bug in monitor_capture or scene connection
   - If only audio FAIL: Bug in wasapi sources
5. **Fix the issue in capture.cpp**
6. **Rebuild:** `.\build.ps1`
7. **Repeat until both tests pass**

## Manual Testing Checklist

- [ ] App starts without errors
- [ ] Tray icon appears
- [ ] Replay buffer message in log
- [ ] Press F9, notification shows "Clip Saved"
- [ ] MP4 file appears in output directory
- [ ] Clip plays in media player
- [ ] Video is not all black (use test script)
- [ ] Audio is not silent (use test script)
- [ ] No ERROR messages in log