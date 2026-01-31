import React, { useRef, useState, useEffect, useCallback } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Scissors,
  RotateCcw,
  Check,
  X,
  Download,
  Maximize,
  Settings2,
  Layers,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react'
import type { VideoMetadata } from '../../hooks/useVideoMetadata'
import type { ClipInfo, ClipMetadata, AudioTrackUrls } from '../../types/electron'

interface EditorProps {
  clip: ClipInfo
  metadata: VideoMetadata
  onClose: () => void
  onSave: (clipId: string, metadata: ClipMetadata) => void
}

export const Editor: React.FC<EditorProps> = ({ clip, metadata, onClose, onSave }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(metadata.duration || 0)
  const [_isFullscreen, setIsFullscreen] = useState(false)

  // Web Audio API refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBuffer1Ref = useRef<AudioBuffer | null>(null)
  const audioBuffer2Ref = useRef<AudioBuffer | null>(null)
  const sourceNode1Ref = useRef<AudioBufferSourceNode | null>(null)
  const sourceNode2Ref = useRef<AudioBufferSourceNode | null>(null)
  const gainNode1Ref = useRef<GainNode | null>(null)
  const gainNode2Ref = useRef<GainNode | null>(null)
  const audioStartTimeRef = useRef<number>(0)
  const videoStartTimeRef = useRef<number>(0)
  const isAudioPlayingRef = useRef<boolean>(false)

  // Audio track sources and volume
  const [audioTrack1Src, setAudioTrack1Src] = useState<string | null>(null)
  const [audioTrack2Src, setAudioTrack2Src] = useState<string | null>(null)
  const [audioTrack1Volume, setAudioTrack1Volume] = useState(0.7)
  const [audioTrack2Volume, setAudioTrack2Volume] = useState(0.7)
  const [audioTrack1Muted, setAudioTrack1Muted] = useState(false)
  const [audioTrack2Muted, setAudioTrack2Muted] = useState(false)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)

  // Trim markers (in seconds)
  const [trimStart, setTrimStart] = useState(clip.metadata?.trim?.start || 0)
  const [trimEnd, setTrimEnd] = useState(clip.metadata?.trim?.end || metadata.duration || 0)
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'playhead' | null>(null)

  // Audio tracks (for export selection)
  const [audioTrack1, setAudioTrack1] = useState(clip.metadata?.audio?.track1 !== false) // Default true
  const [audioTrack2, setAudioTrack2] = useState(clip.metadata?.audio?.track2 !== false) // Default true
  const [isFavorite, setIsFavorite] = useState(clip.metadata?.favorite || false)
  const [tags, setTags] = useState<string[]>(clip.metadata?.tags || [])
  const [newTag, setNewTag] = useState('')

  // Export state
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [targetSizeMB, setTargetSizeMB] = useState<number | 'original'>('original')
  const [showSizeDropdown, setShowSizeDropdown] = useState(false)
  const [videoSrc, setVideoSrc] = useState(`clipvault://clip/${encodeURIComponent(clip.filename)}`)

  // Editor settings
  const [skipSeconds, setSkipSeconds] = useState(5)

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await window.electronAPI.getSettings()
        if (data && data.editor) {
          setSkipSeconds(data.editor.skip_seconds || 5)
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }
    loadSettings()
  }, [])

  // Update duration when metadata changes
  useEffect(() => {
    if (metadata.duration) {
      setDuration(metadata.duration)
      if (trimEnd === 0 || trimEnd > metadata.duration) {
        setTrimEnd(metadata.duration)
      }
    }
  }, [metadata])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSizeDropdown) {
        setShowSizeDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showSizeDropdown])

  // Initialize AudioContext
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      audioContextRef.current = new AudioContextClass()
    }

    return () => {
      // Cleanup audio resources on unmount
      if (sourceNode1Ref.current) {
        try {
          sourceNode1Ref.current.stop()
          sourceNode1Ref.current.disconnect()
        } catch {}
      }
      if (sourceNode2Ref.current) {
        try {
          sourceNode2Ref.current.stop()
          sourceNode2Ref.current.disconnect()
        } catch {}
      }
      if (gainNode1Ref.current) {
        gainNode1Ref.current.disconnect()
      }
      if (gainNode2Ref.current) {
        gainNode2Ref.current.disconnect()
      }
      audioBuffer1Ref.current = null
      audioBuffer2Ref.current = null
      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [])

  // Load audio buffers when sources are available
  useEffect(() => {
    const loadAudioBuffer = async (url: string): Promise<AudioBuffer | null> => {
      if (!audioContextRef.current) return null

      try {
        const response = await fetch(url)
        const arrayBuffer = await response.arrayBuffer()
        return await audioContextRef.current.decodeAudioData(arrayBuffer)
      } catch (error) {
        console.error('Failed to load audio buffer:', error)
        return null
      }
    }

    void (async () => {
      if (audioTrack1Src && audioContextRef.current) {
        const buffer = await loadAudioBuffer(audioTrack1Src)
        audioBuffer1Ref.current = buffer
      }
    })()

    void (async () => {
      if (audioTrack2Src && audioContextRef.current) {
        const buffer = await loadAudioBuffer(audioTrack2Src)
        audioBuffer2Ref.current = buffer
      }
    })()
  }, [audioTrack1Src, audioTrack2Src])

  // Extract audio tracks on mount
  useEffect(() => {
    // Small delay to ensure IPC is ready
    const timer = setTimeout(() => {
      void (async () => {
        if (!window.electronAPI?.extractAudioTracks || metadata.audioTracks < 1) {
          return
        }

        setIsLoadingAudio(true)
        try {
          const result: AudioTrackUrls = await window.electronAPI.extractAudioTracks(
            clip.id,
            clip.path
          )
          if (result.track1) {
            setAudioTrack1Src(result.track1)
          }
          if (result.track2) {
            setAudioTrack2Src(result.track2)
          }
        } catch (error) {
          console.error('Failed to extract audio tracks:', error)
        } finally {
          setIsLoadingAudio(false)
        }
      })()
    }, 100)
    
    return () => clearTimeout(timer)
  }, [clip.id, clip.path, metadata.audioTracks])

  // Update gain node values when volume/mute changes
  useEffect(() => {
    if (gainNode1Ref.current) {
      gainNode1Ref.current.gain.value = audioTrack1Muted ? 0 : audioTrack1Volume
    }
  }, [audioTrack1Volume, audioTrack1Muted])

  useEffect(() => {
    if (gainNode2Ref.current) {
      gainNode2Ref.current.gain.value = audioTrack2Muted ? 0 : audioTrack2Volume
    }
  }, [audioTrack2Volume, audioTrack2Muted])

  // Start audio playback from a specific time
  const startAudioPlayback = useCallback((fromTime: number) => {
    if (!audioContextRef.current) return

    // Stop any existing playback
    if (sourceNode1Ref.current) {
      try {
        sourceNode1Ref.current.stop()
      } catch {
        // Ignore errors if already stopped
      }
      sourceNode1Ref.current = null
    }
    if (sourceNode2Ref.current) {
      try {
        sourceNode2Ref.current.stop()
      } catch {
        // Ignore errors if already stopped
      }
      sourceNode2Ref.current = null
    }

    // Create gain nodes if they don't exist
    if (!gainNode1Ref.current) {
      gainNode1Ref.current = audioContextRef.current.createGain()
      gainNode1Ref.current.connect(audioContextRef.current.destination)
      gainNode1Ref.current.gain.value = audioTrack1Muted ? 0 : audioTrack1Volume
    }
    if (!gainNode2Ref.current) {
      gainNode2Ref.current = audioContextRef.current.createGain()
      gainNode2Ref.current.connect(audioContextRef.current.destination)
      gainNode2Ref.current.gain.value = audioTrack2Muted ? 0 : audioTrack2Volume
    }

    // Create and start source nodes for each track
    if (audioBuffer1Ref.current && audioTrack1) {
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer1Ref.current
      source.connect(gainNode1Ref.current)
      source.start(0, fromTime)
      sourceNode1Ref.current = source
    }

    if (audioBuffer2Ref.current && audioTrack2) {
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer2Ref.current
      source.connect(gainNode2Ref.current)
      source.start(0, fromTime)
      sourceNode2Ref.current = source
    }

    // Record the start time for sync calculations
    audioStartTimeRef.current = audioContextRef.current.currentTime
    videoStartTimeRef.current = fromTime
    isAudioPlayingRef.current = true

    // Handle playback ending
    const checkPlaybackEnd = () => {
      if (!isAudioPlayingRef.current) return

      const elapsed = audioContextRef.current!.currentTime - audioStartTimeRef.current
      const currentAudioTime = videoStartTimeRef.current + elapsed

      if (currentAudioTime >= duration) {
        isAudioPlayingRef.current = false
        setIsPlaying(false)
      } else {
        requestAnimationFrame(checkPlaybackEnd)
      }
    }
    requestAnimationFrame(checkPlaybackEnd)
  }, [audioTrack1, audioTrack2, audioTrack1Muted, audioTrack2Muted, audioTrack1Volume, audioTrack2Volume, duration])

  // Stop audio playback
  const stopAudioPlayback = useCallback(() => {
    if (sourceNode1Ref.current) {
      try {
        sourceNode1Ref.current.stop()
      } catch {
        // Ignore errors if already stopped
      }
      sourceNode1Ref.current = null
    }
    if (sourceNode2Ref.current) {
      try {
        sourceNode2Ref.current.stop()
      } catch {
        // Ignore errors if already stopped
      }
      sourceNode2Ref.current = null
    }
    isAudioPlayingRef.current = false
  }, [])

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    const handleLoadedMetadata = () => {
      setDuration(video.duration)
    }

    const handlePlay = () => {
      setIsPlaying(true)
      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        void audioContextRef.current.resume()
      }
      // Start audio synced to video
      startAudioPlayback(video.currentTime)
    }

    const handlePause = () => {
      setIsPlaying(false)
      stopAudioPlayback()
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [startAudioPlayback, stopAudioPlayback])

  // Handle video load errors - fallback to IPC file url
  const handleVideoError = useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    console.error('Video failed to load with protocol, trying IPC fallback...')

    try {
      if (window.electronAPI?.getVideoFileUrl) {
        const result = await window.electronAPI.getVideoFileUrl(clip.filename)
        if (result.success && result.url) {
          console.log('Loading video via IPC file URL:', result.url)
          setVideoSrc(result.url)
        } else {
          console.error('Failed to get video file URL:', result.error)
        }
      }
    } catch (error) {
      console.error('Error in video fallback:', error)
    }
  }, [clip.filename])

  // Playback controls
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      void video.play()
    }
  }, [isPlaying])

  const skip = useCallback(
    (seconds: number) => {
      if (videoRef.current) {
        const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
        videoRef.current.currentTime = newTime
        setCurrentTime(newTime)

        // If playing, restart audio at new position
        if (isPlaying) {
          startAudioPlayback(newTime)
        }
      }
    },
    [currentTime, duration, isPlaying, startAudioPlayback]
  )

  const skipFrame = useCallback(
    (direction: 'back' | 'forward') => {
      if (videoRef.current && metadata.fps > 0) {
        const frameTime = 1 / metadata.fps
        const adjustment = direction === 'forward' ? frameTime : -frameTime
        const newTime = Math.max(0, Math.min(duration, currentTime + adjustment))
        videoRef.current.currentTime = newTime
        setCurrentTime(newTime)

        if (isPlaying) {
          startAudioPlayback(newTime)
        }
      }
    },
    [currentTime, duration, metadata.fps, isPlaying, startAudioPlayback]
  )

  const seek = useCallback(
    (time: number) => {
      if (videoRef.current) {
        const newTime = Math.max(0, Math.min(duration, time))
        videoRef.current.currentTime = newTime
        setCurrentTime(newTime)

        // If playing, restart audio at new position
        if (isPlaying) {
          startAudioPlayback(newTime)
        }
      }
    },
    [duration, isPlaying, startAudioPlayback]
  )

  const toggleAudioTrack1Mute = useCallback(() => {
    setAudioTrack1Muted(!audioTrack1Muted)
  }, [audioTrack1Muted])

  const toggleAudioTrack2Mute = useCallback(() => {
    setAudioTrack2Muted(!audioTrack2Muted)
  }, [audioTrack2Muted])

  const handleAudioTrack1VolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value)
      setAudioTrack1Volume(newVolume)
      if (newVolume > 0 && audioTrack1Muted) {
        setAudioTrack1Muted(false)
      }
    },
    [audioTrack1Muted]
  )

  const handleAudioTrack2VolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value)
      setAudioTrack2Volume(newVolume)
      if (newVolume > 0 && audioTrack2Muted) {
        setAudioTrack2Muted(false)
      }
    },
    [audioTrack2Muted]
  )

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      videoRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  // Timeline interactions
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timelineRef.current || isDragging) return

      const rect = timelineRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = Math.max(0, Math.min(1, x / rect.width))
      const time = percentage * duration

      seek(time)
    },
    [duration, isDragging, seek]
  )

  const handleMarkerDragStart = useCallback((marker: 'start' | 'end') => {
    setIsDragging(marker)
  }, [])

  const handlePlayheadDragStart = useCallback(() => {
    setIsDragging('playhead')
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !timelineRef.current) return

      const rect = timelineRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = Math.max(0, Math.min(1, x / rect.width))
      const time = percentage * duration

      if (isDragging === 'start') {
        setTrimStart(Math.min(trimEnd - 1, Math.max(0, time)))
      } else if (isDragging === 'end') {
        setTrimEnd(Math.max(trimStart + 1, Math.min(duration, time)))
      } else if (isDragging === 'playhead') {
        seek(time)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(null)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, duration, trimStart, trimEnd, seek])

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  // Save metadata
  const handleSave = useCallback(() => {
    const newMetadata: ClipMetadata = {
      favorite: isFavorite,
      tags,
      trim: {
        start: trimStart,
        end: trimEnd,
      },
      audio: {
        track1: audioTrack1,
        track2: audioTrack2,
      },
    }
    onSave(clip.id, newMetadata)
  }, [clip.id, isFavorite, tags, trimStart, trimEnd, audioTrack1, audioTrack2, onSave])

  // Reset trim
  const handleReset = useCallback(() => {
    setTrimStart(0)
    setTrimEnd(duration)
    setAudioTrack1(true)
    setAudioTrack2(true)
  }, [duration])

  // Add tag
  const handleAddTag = useCallback(() => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }, [newTag, tags])

  // Remove tag
  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      setTags(tags.filter(tag => tag !== tagToRemove))
    },
    [tags]
  )

  // Handle export
  const handleExport = useCallback(async () => {
    if (!window.electronAPI?.dialog?.save || !window.electronAPI?.editor?.exportClip) {
      console.error('Export API not available')
      return
    }

    setIsExporting(true)
    setExportProgress(0)
    setExportStatus('idle')

    try {
      // Open save dialog
      // Generate unique filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const baseFilename = clip.filename.replace('.mp4', '')
      const exportFilename = `${baseFilename}_export_${timestamp}.mp4`
      
      // Export to fixed location: ClipVault/exported-clips/
      const exportResult = await window.electronAPI.editor.exportClip({
        clipPath: clip.path,
        exportFilename,
        trimStart,
        trimEnd,
        audioTrack1,
        audioTrack2,
        audioTrack1Volume,
        audioTrack2Volume,
        targetSizeMB,
      })

      if (exportResult.success) {
        setExportStatus('success')
        // Pause editor playback before showing preview
        if (videoRef.current) {
          videoRef.current.pause()
        }
        // Show export preview window for easy sharing
        if (exportResult.filePath) {
          void window.electronAPI.showExportPreview?.(exportResult.filePath)
        }
        setTimeout(() => {
          setIsExporting(false)
          setExportProgress(0)
          setExportStatus('idle')
        }, 2000)
      } else {
        setExportStatus('error')
        setTimeout(() => {
          setIsExporting(false)
          setExportProgress(0)
          setExportStatus('idle')
        }, 3000)
      }
    } catch (error) {
      console.error('Export failed:', error)
      setExportStatus('error')
      setTimeout(() => {
        setIsExporting(false)
        setExportProgress(0)
        setExportStatus('idle')
      }, 3000)
    }
  }, [clip.path, clip.filename, trimStart, trimEnd, audioTrack1, audioTrack2, audioTrack1Volume, audioTrack2Volume, targetSizeMB])

  return (
    <div className="flex h-full flex-col bg-background-primary">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
          <div>
            <h2 className="font-semibold text-text-primary">{clip.filename.replace('.mp4', '')}</h2>
            <p className="text-xs text-text-muted">
              {metadata.width}x{metadata.height} • {Math.round(metadata.fps)}fps •{' '}
              {Math.round(metadata.bitrate / 1000)}kbps
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tags */}
          <div className="flex items-center gap-1 mr-2">
            {tags.map(tag => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded bg-accent-primary/10 px-2 py-1 text-xs text-accent-primary"
              >
                {tag}
                <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-400">
                  ×
                </button>
              </span>
            ))}
            <div className="relative">
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                placeholder="+ tag"
                className="input w-20 text-xs py-1"
              />
            </div>
          </div>

          {/* Favorite */}
          <button
            onClick={() => setIsFavorite(!isFavorite)}
            className={`rounded-lg p-2 transition-colors ${
              isFavorite
                ? 'text-yellow-500 hover:bg-yellow-500/10'
                : 'text-text-muted hover:bg-background-tertiary hover:text-text-primary'
            }`}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
          </button>

          <div className="h-6 w-px bg-border mx-2" />

          <button onClick={handleReset} className="btn-secondary flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button onClick={handleSave} className="btn-primary flex items-center gap-2">
            <Check className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video Area */}
        <div className="flex flex-1 flex-col gap-4 p-6">
          {/* Video Player */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              src={videoSrc}
              className="max-h-full max-w-full cursor-pointer"
              onClick={togglePlay}
              onError={handleVideoError}
              playsInline
              muted // Video is muted, audio comes from Web Audio API
            />

            {/* Audio loading indicator */}
            {isLoadingAudio && (
              <div className="absolute right-4 top-4 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-text-secondary">
                <Loader2 className="h-3 w-3 animate-spin" />
                Extracting audio...
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="flex flex-col gap-6 rounded-xl bg-background-secondary p-5">
            {/* Time display */}
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono text-text-primary">{formatTime(currentTime)}</span>
              <span className="font-mono text-text-muted">{formatTime(duration)}</span>
            </div>

            {/* Timeline bar */}
            <div
              ref={timelineRef}
              className="relative flex-1 cursor-pointer px-2 py-2"
              onClick={handleTimelineClick}
            >
              {/* Background track */}
              <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-background-tertiary" />

              {/* Cut region - before trim start (grayed out) */}
              <div
                className="absolute top-0 bottom-0 rounded-l-full bg-text-muted/20"
                style={{ left: '0%', width: `${(trimStart / duration) * 100}%` }}
              />

              {/* Cut region - after trim end (grayed out) */}
              <div
                className="absolute top-0 bottom-0 rounded-r-full bg-text-muted/20"
                style={{ left: `${(trimEnd / duration) * 100}%`, right: '0%' }}
              />

              {/* Trim region */}
              <div
                className="absolute inset-y-0 rounded-full bg-accent-primary/20"
                style={{
                  left: `${(trimStart / duration) * 100}%`,
                  right: `${100 - (trimEnd / duration) * 100}%`,
                }}
              />

              {/* Playhead - full height, vertically centered */}
              <div
                className="absolute inset-y-0 w-0.5 cursor-ew-resize bg-white"
                style={{ left: `${(currentTime / duration) * 100}%` }}
                onMouseDown={e => {
                  e.stopPropagation()
                  handlePlayheadDragStart()
                }}
              >
                <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow-md" />
              </div>

              {/* Start trim marker - pin style extending above */}
              <div
                className="absolute bottom-0 w-1 cursor-ew-resize bg-accent-primary transition-all hover:w-1.5"
                style={{ left: `${(trimStart / duration) * 100}%`, height: '200%', top: '-100%' }}
                onMouseDown={e => {
                  e.stopPropagation()
                  handleMarkerDragStart('start')
                }}
              >
                <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 h-4 w-4 rounded-full bg-accent-primary shadow-md" />
              </div>

              {/* End trim marker - pin style extending above */}
              <div
                className="absolute bottom-0 w-1 cursor-ew-resize bg-accent-primary transition-all hover:w-1.5"
                style={{ left: `${(trimEnd / duration) * 100}%`, height: '200%', top: '-100%' }}
                onMouseDown={e => {
                  e.stopPropagation()
                  handleMarkerDragStart('end')
                }}
              >
                <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 h-4 w-4 rounded-full bg-accent-primary shadow-md" />
              </div>
            </div>

            {/* Trim info */}
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Scissors className="h-3 w-3" />
                Trim: {formatTime(trimStart)} - {formatTime(trimEnd)}
              </span>
              <span>Duration: {formatTime(trimEnd - trimStart)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex h-14 items-center justify-center rounded-xl bg-background-secondary px-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => skipFrame('back')}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
                title="Back 1 Frame"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => skip(-skipSeconds)}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
                title={`Back ${skipSeconds} Seconds`}
              >
                <SkipBack className="h-5 w-5" />
              </button>
              <button
                onClick={togglePlay}
                className="hover:bg-accent-secondary flex h-10 w-10 items-center justify-center rounded-lg bg-accent-primary transition-colors"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 text-background-primary" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5 text-background-primary" />
                )}
              </button>
              <button
                onClick={() => skip(skipSeconds)}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
                title={`Forward ${skipSeconds} Seconds`}
              >
                <SkipForward className="h-5 w-5" />
              </button>
              <button
                onClick={() => skipFrame('forward')}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
                title="Forward 1 Frame"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="w-px h-6 bg-border mx-2" />
              <button
                onClick={toggleFullscreen}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
                title="Fullscreen"
              >
                <Maximize className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="flex w-80 flex-col gap-6 overflow-y-auto border-l border-border bg-background-secondary p-6">
          {/* Audio Tracks */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
              <Layers className="h-4 w-4" />
              Audio Tracks
            </h3>
            <div className="space-y-2">
              {/* Track 1 - Desktop */}
              <div className="rounded-lg bg-background-tertiary p-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={audioTrack1}
                    onChange={e => setAudioTrack1(e.target.checked)}
                    className="h-4 w-4 accent-accent-primary"
                  />
                  <span className="text-sm text-text-secondary">Desktop Audio</span>
                </label>
                {audioTrack1Src && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={toggleAudioTrack1Mute}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-background-primary"
                    >
                      {audioTrack1Muted || audioTrack1Volume === 0 ? (
                        <VolumeX className="h-3 w-3" />
                      ) : (
                        <Volume2 className="h-3 w-3" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={audioTrack1Muted ? 0 : audioTrack1Volume}
                      onChange={handleAudioTrack1VolumeChange}
                      className="flex-1 accent-accent-primary"
                    />
                  </div>
                )}
              </div>

              {/* Track 2 - Microphone */}
              <div className="rounded-lg bg-background-tertiary p-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={audioTrack2}
                    onChange={e => setAudioTrack2(e.target.checked)}
                    className="h-4 w-4 accent-accent-primary"
                  />
                  <span className="text-sm text-text-secondary">Microphone</span>
                </label>
                {audioTrack2Src && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={toggleAudioTrack2Mute}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-background-primary"
                    >
                      {audioTrack2Muted || audioTrack2Volume === 0 ? (
                        <VolumeX className="h-3 w-3" />
                      ) : (
                        <Volume2 className="h-3 w-3" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={audioTrack2Muted ? 0 : audioTrack2Volume}
                      onChange={handleAudioTrack2VolumeChange}
                      className="flex-1 accent-accent-primary"
                    />
                  </div>
                )}
              </div>
            </div>
            {(!audioTrack1 || !audioTrack2) && (
              <p className="mt-2 text-xs text-text-muted">
                Disabled tracks will be muted in export
              </p>
            )}
          </div>

          {/* Export Preview */}
          <div className="mt-auto border-t border-border pt-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
              <Settings2 className="h-4 w-4" />
              Export Preview
            </h3>
            <div className="space-y-2 text-sm text-text-muted">
              <div className="flex justify-between">
                <span>Original Duration</span>
                <span className="text-text-secondary">{formatTime(duration)}</span>
              </div>
              <div className="flex justify-between">
                <span>Trimmed Duration</span>
                <span className="text-accent-primary">{formatTime(trimEnd - trimStart)}</span>
              </div>
              <div className="flex justify-between">
                <span>Audio Tracks</span>
                <span className="text-text-secondary">
                  {(audioTrack1 ? 1 : 0) + (audioTrack2 ? 1 : 0)} active
                </span>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleExport}
                disabled={isExporting}
                className={`btn-primary flex flex-1 items-center justify-center gap-2 ${
                  isExporting ? 'cursor-not-allowed opacity-80' : ''
                } ${exportStatus === 'success' ? 'bg-green-600 hover:bg-green-700' : ''} ${
                  exportStatus === 'error' ? 'bg-red-600 hover:bg-red-700' : ''
                }`}
              >
                {isExporting ? (
                  <>
                    {exportStatus === 'idle' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : exportStatus === 'success' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    {exportStatus === 'idle' && exportProgress > 0
                      ? `Exporting... ${Math.round(exportProgress)}%`
                      : exportStatus === 'idle'
                        ? 'Exporting...'
                        : exportStatus === 'success'
                          ? 'Export Complete!'
                          : 'Export Failed'}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Export
                    {targetSizeMB !== 'original' && (
                      <span className="ml-1 text-xs opacity-80">({targetSizeMB}MB)</span>
                    )}
                  </>
                )}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowSizeDropdown(!showSizeDropdown)}
                  disabled={isExporting}
                  className={`btn-secondary flex items-center gap-1 px-3 ${
                    isExporting ? 'cursor-not-allowed opacity-80' : ''
                  }`}
                  title="Select export size target"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                {showSizeDropdown && (
                  <div className="absolute bottom-full right-0 z-50 mb-1 w-40 rounded-lg border border-border bg-background-secondary py-1 shadow-lg">
                    <button
                      onClick={() => {
                        setTargetSizeMB('original')
                        setShowSizeDropdown(false)
                      }}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-background-tertiary ${
                        targetSizeMB === 'original' ? 'text-accent-primary' : 'text-text-secondary'
                      }`}
                    >
                      <span>Original</span>
                      {targetSizeMB === 'original' && <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setTargetSizeMB(10)
                        setShowSizeDropdown(false)
                      }}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-background-tertiary ${
                        targetSizeMB === 10 ? 'text-accent-primary' : 'text-text-secondary'
                      }`}
                    >
                      <span>10 MB</span>
                      {targetSizeMB === 10 && <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setTargetSizeMB(50)
                        setShowSizeDropdown(false)
                      }}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-background-tertiary ${
                        targetSizeMB === 50 ? 'text-accent-primary' : 'text-text-secondary'
                      }`}
                    >
                      <span>50 MB</span>
                      {targetSizeMB === 50 && <Check className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setTargetSizeMB(100)
                        setShowSizeDropdown(false)
                      }}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-background-tertiary ${
                        targetSizeMB === 100 ? 'text-accent-primary' : 'text-text-secondary'
                      }`}
                    >
                      <span>100 MB</span>
                      {targetSizeMB === 100 && <Check className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
            {isExporting && exportProgress > 0 && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-background-tertiary">
                <div
                  className="h-full bg-accent-primary transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
