import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import type { FC } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Scissors,
  X,
  Download,
  Maximize,
  Settings2,
  Layers,
  Loader2,
  Check,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Star,
  Trash2,
  Gamepad2,
} from 'lucide-react'
import { GameTagEditor } from '../GameTagEditor'
import type { VideoMetadata } from '../../hooks/useVideoMetadata'
import type {
  ClipInfo,
  ClipMetadata,
  AudioTrackUrls,
  AudioTrackSetting,
} from '../../types/electron'

interface EditorProps {
  clip: ClipInfo
  metadata: VideoMetadata
  onClose: () => void
  onSave?: (clipId: string, metadata: ClipMetadata) => void
  onOpenClip?: (clip: ClipInfo, metadata: VideoMetadata) => void
  getAdjacentClip?: (
    clipId: string,
    direction: 'previous' | 'next'
  ) => { clip: ClipInfo; metadata: VideoMetadata } | null
}

const MIN_TRIM_LENGTH = 1

const toFiniteNumber = (value: number | undefined | null): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return value
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const sanitizeDuration = (value: number | undefined | null): number =>
  Math.max(0, toFiniteNumber(value))

const getSafeTimelineDuration = (value: number): number => {
  const duration = sanitizeDuration(value)
  return duration > 0 ? duration : 1
}

const resolveAudioEnabled = (track?: AudioTrackSetting): boolean => {
  if (typeof track === 'boolean') return track
  return track?.enabled ?? true
}

const resolveAudioMuted = (track?: AudioTrackSetting): boolean => {
  if (typeof track === 'boolean') return false
  return track?.muted ?? false
}

const resolveAudioVolume = (track?: AudioTrackSetting): number => {
  if (typeof track === 'boolean') return 0.7
  return track?.volume ?? 0.7
}

export const Editor: FC<EditorProps> = ({
  clip,
  metadata,
  onClose,
  onSave,
  onOpenClip,
  getAdjacentClip,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [resolvedMetadata, setResolvedMetadata] = useState(metadata)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(metadata.duration || 0)

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
  const startAudioPlaybackRef = useRef<((fromTime: number) => void) | null>(null)

  // Audio track sources and volume
  const [audioTrack1Src, setAudioTrack1Src] = useState<string | null>(null)
  const [audioTrack2Src, setAudioTrack2Src] = useState<string | null>(null)
  const initialTrack1 = clip.metadata?.audio?.track1
  const initialTrack2 = clip.metadata?.audio?.track2
  const [audioTrack1Volume, setAudioTrack1Volume] = useState(resolveAudioVolume(initialTrack1))
  const [audioTrack2Volume, setAudioTrack2Volume] = useState(resolveAudioVolume(initialTrack2))
  const [audioTrack1Muted, setAudioTrack1Muted] = useState(resolveAudioMuted(initialTrack1))
  const [audioTrack2Muted, setAudioTrack2Muted] = useState(resolveAudioMuted(initialTrack2))
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)

  // Trim markers (in seconds)
  const [trimStart, setTrimStart] = useState(clip.metadata?.trim?.start ?? 0)
  const [trimEnd, setTrimEnd] = useState(clip.metadata?.trim?.end ?? resolvedMetadata.duration ?? 0)
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'playhead' | null>(null)

  // Audio tracks (for export selection)
  const [audioTrack1, setAudioTrack1] = useState(resolveAudioEnabled(initialTrack1))
  const [audioTrack2, setAudioTrack2] = useState(resolveAudioEnabled(initialTrack2))
  const [isFavorite, setIsFavorite] = useState(clip.metadata?.favorite || false)
  const [tags, setTags] = useState<string[]>(clip.metadata?.tags || [])
  const [newTag, setNewTag] = useState('')
  const [game, setGame] = useState(clip.metadata?.game || '')
  const [isEditingGame, setIsEditingGame] = useState(false)

  // Track if we've already set trim end from video (to avoid re-setting on re-renders)
  const isVideoDurationSetRef = useRef(false)
  // Track if trimEnd was explicitly set from metadata
  const isTrimEndFromMetadataRef = useRef(clip.metadata?.trim?.end !== undefined)

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Trim in place state
  const [isTrimming, setIsTrimming] = useState(false)
  const [trimProgress, setTrimProgress] = useState(0)
  const [showTrimConfirm, setShowTrimConfirm] = useState(false)
  const [audioExtractionKey, setAudioExtractionKey] = useState(0)
  const hasRetriedAudioDecodeRef = useRef(false)
  const forceAudioReextractRef = useRef(false)

  // Editor settings
  const [skipSeconds, setSkipSeconds] = useState(5)

  // Export state
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [targetSizeMB, setTargetSizeMB] = useState<number | 'original'>('original')
  const [showSizeDropdown, setShowSizeDropdown] = useState(false)
  const [exportFps, setExportFps] = useState<number | 'original'>('original')
  const [exportResolution, setExportResolution] = useState<string>('original')
  const [videoSrc, setVideoSrc] = useState(`clipvault://clip/${encodeURIComponent(clip.filename)}`)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushPendingEditorStateRef = useRef<(() => Promise<boolean>) | null>(null)
  const [isEditorHydrated, setIsEditorHydrated] = useState(false)
  const safeDuration = getSafeTimelineDuration(duration)
  const minTrimLength = Math.min(MIN_TRIM_LENGTH, safeDuration)
  const clampedTrimStart = clamp(toFiniteNumber(trimStart), 0, safeDuration)
  const clampedTrimEnd = clamp(toFiniteNumber(trimEnd), clampedTrimStart, safeDuration)
  const clampedCurrentTime = clamp(toFiniteNumber(currentTime), 0, safeDuration)
  const hasResolvedDimensions = resolvedMetadata.width > 0 && resolvedMetadata.height > 0
  const hasResolvedFps = resolvedMetadata.fps > 0
  const hasResolvedBitrate = resolvedMetadata.bitrate > 0

  useEffect(() => {
    setResolvedMetadata(metadata)
  }, [metadata, clip.id])

  useEffect(() => {
    if (metadata.duration > 0 && metadata.width > 0 && metadata.height > 0 && metadata.fps > 0) {
      return
    }

    let cancelled = false

    const loadResolvedMetadata = async () => {
      try {
        const nextMetadata = await window.electronAPI.getVideoMetadata(clip.path)
        if (!cancelled) {
          setResolvedMetadata(nextMetadata)
        }
      } catch (error) {
        console.error('[Editor] Failed to load video metadata:', error)
      }
    }

    void loadResolvedMetadata()

    return () => {
      cancelled = true
    }
  }, [clip.path, clip.id, metadata])

  const syncTimelineBounds = useCallback(
    (nextDuration: number, options?: { forceTrimEnd?: boolean }) => {
      const sanitizedDuration = sanitizeDuration(nextDuration)
      setDuration(sanitizedDuration)

      if (sanitizedDuration <= 0) {
        setTrimStart(0)
        setTrimEnd(0)
        setCurrentTime(0)
        return
      }

      setTrimStart(prevTrimStart => {
        const newTrimStart = clamp(toFiniteNumber(prevTrimStart), 0, sanitizedDuration)

        setTrimEnd(prevTrimEnd => {
          const newTrimEnd = options?.forceTrimEnd
            ? sanitizedDuration
            : clamp(
                toFiniteNumber(prevTrimEnd),
                Math.min(newTrimStart + MIN_TRIM_LENGTH, sanitizedDuration),
                sanitizedDuration
              )

          setCurrentTime(prevCurrentTime =>
            clamp(toFiniteNumber(prevCurrentTime), newTrimStart, newTrimEnd)
          )

          return newTrimEnd
        })

        return newTrimStart
      })
    },
    []
  )

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

  // Load editor state from disk
  useEffect(() => {
    let cancelled = false
    setIsEditorHydrated(false)

    const loadEditorState = async () => {
      try {
        // Load from clips-metadata folder (single source of truth)
        const clipMetadata = await window.electronAPI.editor.loadState(clip.id)
        if (cancelled) {
          return
        }

        const fallbackTrack1 = clip.metadata?.audio?.track1
        const fallbackTrack2 = clip.metadata?.audio?.track2
        const fallbackTrimStart = clip.metadata?.trim?.start ?? 0
        const fallbackTrimEnd = clip.metadata?.trim?.end ?? resolvedMetadata.duration ?? 0
        const fallbackPlayhead = clip.metadata?.playheadPosition ?? 0

        isVideoDurationSetRef.current = false
        isTrimEndFromMetadataRef.current = clip.metadata?.trim?.end !== undefined

        // Reset all editor state to clip-specific defaults before applying persisted metadata.
        setDuration(resolvedMetadata.duration || 0)
        setTrimStart(fallbackTrimStart)
        setTrimEnd(fallbackTrimEnd)
        setAudioTrack1(resolveAudioEnabled(fallbackTrack1))
        setAudioTrack2(resolveAudioEnabled(fallbackTrack2))
        setAudioTrack1Muted(resolveAudioMuted(fallbackTrack1))
        setAudioTrack2Muted(resolveAudioMuted(fallbackTrack2))
        setAudioTrack1Volume(resolveAudioVolume(fallbackTrack1))
        setAudioTrack2Volume(resolveAudioVolume(fallbackTrack2))
        setIsFavorite(Boolean(clip.metadata?.favorite))
        setTags(Array.isArray(clip.metadata?.tags) ? clip.metadata.tags : [])
        setGame(typeof clip.metadata?.game === 'string' ? clip.metadata.game : '')
        setCurrentTime(fallbackPlayhead)
        if (videoRef.current) {
          videoRef.current.currentTime = fallbackPlayhead
        }

        if (clipMetadata) {
          console.log('[Editor] Loading metadata for clip:', clip.id)

          // Apply trim markers from persisted state when available.
          if (clipMetadata.trim) {
            setTrimStart(Math.max(0, toFiniteNumber(clipMetadata.trim.start)))
            setTrimEnd(Math.max(0, toFiniteNumber(clipMetadata.trim.end)))
            isTrimEndFromMetadataRef.current = true
          }

          // Apply audio settings
          if (clipMetadata.audio) {
            const track1State = clipMetadata.audio.track1
            const track2State = clipMetadata.audio.track2
            setAudioTrack1(resolveAudioEnabled(track1State))
            setAudioTrack2(resolveAudioEnabled(track2State))
            setAudioTrack1Muted(resolveAudioMuted(track1State))
            setAudioTrack2Muted(resolveAudioMuted(track2State))
            setAudioTrack1Volume(resolveAudioVolume(track1State))
            setAudioTrack2Volume(resolveAudioVolume(track2State))
          }

          // Apply favorite and tags
          if (clipMetadata.favorite !== undefined) {
            setIsFavorite(clipMetadata.favorite)
          }
          if (clipMetadata.tags) {
            setTags(clipMetadata.tags)
          }
          if (clipMetadata.game !== undefined) {
            setGame(clipMetadata.game)
          }

          // Apply playhead position
          if (clipMetadata.playheadPosition !== undefined) {
            setCurrentTime(Math.max(0, toFiniteNumber(clipMetadata.playheadPosition)))
            if (videoRef.current) {
              videoRef.current.currentTime = Math.max(
                0,
                toFiniteNumber(clipMetadata.playheadPosition)
              )
            }
          }
        }
      } catch (error) {
        console.error('[Editor] Failed to load editor state:', error)
      } finally {
        if (!cancelled) {
          setIsEditorHydrated(true)
        }
      }
    }

    void loadEditorState()

    return () => {
      cancelled = true
    }
  }, [clip.id])

  // Update duration when metadata changes
  useEffect(() => {
    const nextDuration = sanitizeDuration(resolvedMetadata.duration)
    if (nextDuration > 0) {
      syncTimelineBounds(nextDuration, { forceTrimEnd: trimEnd === 0 })
    }
  }, [resolvedMetadata, syncTimelineBounds, trimEnd])

  // Reset one-shot audio recovery state when switching clips
  useEffect(() => {
    hasRetriedAudioDecodeRef.current = false
    forceAudioReextractRef.current = false

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
    setAudioTrack1Src(null)
    setAudioTrack2Src(null)
    audioBuffer1Ref.current = null
    audioBuffer2Ref.current = null
    setIsLoadingAudio(false)
  }, [clip.id])

  const buildEditorMetadata = useCallback((): ClipMetadata => {
    return {
      favorite: isFavorite,
      tags,
      game,
      trim: {
        start: clampedTrimStart,
        end: clampedTrimEnd,
      },
      audio: {
        track1: {
          enabled: audioTrack1,
          muted: audioTrack1Muted,
          volume: audioTrack1Volume,
        },
        track2: {
          enabled: audioTrack2,
          muted: audioTrack2Muted,
          volume: audioTrack2Volume,
        },
      },
      playheadPosition: clamp(
        toFiniteNumber(videoRef.current?.currentTime ?? clampedCurrentTime),
        0,
        safeDuration
      ),
      lastModified: new Date().toISOString(),
    }
  }, [
    isFavorite,
    tags,
    game,
    clampedTrimStart,
    clampedTrimEnd,
    audioTrack1,
    audioTrack2,
    audioTrack1Muted,
    audioTrack2Muted,
    audioTrack1Volume,
    audioTrack2Volume,
    clampedCurrentTime,
    safeDuration,
  ])

  const persistEditorState = useCallback(async () => {
    if (!clip.id) {
      return
    }

    try {
      const newMetadata = buildEditorMetadata()

      // Save everything to clips-metadata folder (single file)
      const saveSucceeded = await window.electronAPI.saveClipMetadata(clip.id, newMetadata)
      if (!saveSucceeded) {
        throw new Error('Failed to save clip metadata.')
      }

      // Trigger Library update (for real-time UI reflection)
      onSave?.(clip.id, newMetadata)
    } catch (error) {
      console.error('[Editor] Failed to save editor state:', error)
      throw error
    }
  }, [clip.id, buildEditorMetadata, onSave])

  const flushPendingEditorState = useCallback(async (): Promise<boolean> => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }

    if (!isEditorHydrated) {
      return true
    }

    try {
      await persistEditorState()
      return true
    } catch (error) {
      console.error('[Editor] Failed to flush pending editor state:', error)
      return false
    }
  }, [isEditorHydrated, persistEditorState])

  useEffect(() => {
    flushPendingEditorStateRef.current = flushPendingEditorState
  }, [flushPendingEditorState])

  // Save editor state when trim, playhead, or audio settings change
  useEffect(() => {
    if (!isEditorHydrated) {
      return
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      void persistEditorState().catch(error => {
        console.error('[Editor] Autosave failed:', error)
      })
    }, 500)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
    }
  }, [isEditorHydrated, persistEditorState, isPlaying])

  useEffect(() => {
    return () => {
      void flushPendingEditorStateRef.current?.()
    }
  }, [clip.id])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showSizeDropdown) {
        setShowSizeDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showSizeDropdown])

  // Listen for trim progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI.on('trim:progress', (data: unknown) => {
      const payload = data as { percent?: number }
      if (typeof payload.percent === 'number') {
        setTrimProgress(payload.percent)
      }
    })
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  // Initialize AudioContext
  useEffect(() => {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
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
    let cancelled = false

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
      if (!audioContextRef.current) return

      const [track1Buffer, track2Buffer] = await Promise.all([
        audioTrack1Src ? loadAudioBuffer(audioTrack1Src) : Promise.resolve(null),
        audioTrack2Src ? loadAudioBuffer(audioTrack2Src) : Promise.resolve(null),
      ])

      if (cancelled) return

      const hadDecodeFailure =
        (!!audioTrack1Src && !track1Buffer) || (!!audioTrack2Src && !track2Buffer)

      if (hadDecodeFailure && !hasRetriedAudioDecodeRef.current) {
        console.warn('[Editor] Audio decode failed, forcing cache re-extraction for', clip.id)
        hasRetriedAudioDecodeRef.current = true
        forceAudioReextractRef.current = true
        setAudioTrack1Src(null)
        setAudioTrack2Src(null)
        audioBuffer1Ref.current = null
        audioBuffer2Ref.current = null
        setAudioExtractionKey(k => k + 1)
        return
      }

      audioBuffer1Ref.current = audioTrack1Src ? track1Buffer : null
      audioBuffer2Ref.current = audioTrack2Src ? track2Buffer : null

      // If video is already playing, start audio playback to sync once after both buffers finish.
      if (videoRef.current && !videoRef.current.paused && (track1Buffer || track2Buffer)) {
        startAudioPlaybackRef.current?.(videoRef.current.currentTime)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [audioTrack1Src, audioTrack2Src, clip.id])

  // Extract audio tracks on mount
  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!cancelled) {
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
        setAudioTrack1Src(null)
        setAudioTrack2Src(null)
        audioBuffer1Ref.current = null
        audioBuffer2Ref.current = null
      }

      if (!window.electronAPI?.extractAudioTracks || resolvedMetadata.audioTracks < 1) {
        if (!cancelled) {
          setAudioTrack1Src(null)
          setAudioTrack2Src(null)
          audioBuffer1Ref.current = null
          audioBuffer2Ref.current = null
        }
        forceAudioReextractRef.current = false
        return
      }

      setIsLoadingAudio(true)
      try {
        const forceReextract = forceAudioReextractRef.current
        const result: AudioTrackUrls = await window.electronAPI.extractAudioTracks(
          clip.id,
          clip.path,
          forceReextract ? { forceReextract: true } : undefined
        )

        if (forceReextract) {
          forceAudioReextractRef.current = false
        }

        if (!cancelled) {
          const nextTrack1Src =
            typeof result.track1 === 'string' && result.track1.trim().length > 0
              ? result.track1
              : null
          const nextTrack2Src =
            typeof result.track2 === 'string' && result.track2.trim().length > 0
              ? result.track2
              : null

          setAudioTrack1Src(nextTrack1Src)
          setAudioTrack2Src(nextTrack2Src)
        }
      } catch (error) {
        console.error('Failed to extract audio tracks:', error)
      } finally {
        forceAudioReextractRef.current = false
        if (!cancelled) {
          setIsLoadingAudio(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [clip.id, clip.path, resolvedMetadata.audioTracks, audioExtractionKey])

  // Update gain node values when volume/mute/track enabled changes
  useEffect(() => {
    if (gainNode1Ref.current) {
      // If track is disabled, mute it completely (volume = 0)
      gainNode1Ref.current.gain.value = audioTrack1Muted || !audioTrack1 ? 0 : audioTrack1Volume
    }
  }, [audioTrack1Volume, audioTrack1Muted, audioTrack1])

  useEffect(() => {
    if (gainNode2Ref.current) {
      // If track is disabled, mute it completely (volume = 0)
      gainNode2Ref.current.gain.value = audioTrack2Muted || !audioTrack2 ? 0 : audioTrack2Volume
    }
  }, [audioTrack2Volume, audioTrack2Muted, audioTrack2])

  // Start audio playback from a specific time
  const startAudioPlayback = useCallback(
    (fromTime: number) => {
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
        // Set gain to 0 if track is disabled or muted
        gainNode1Ref.current.gain.value = audioTrack1Muted || !audioTrack1 ? 0 : audioTrack1Volume
      }
      if (!gainNode2Ref.current) {
        gainNode2Ref.current = audioContextRef.current.createGain()
        gainNode2Ref.current.connect(audioContextRef.current.destination)
        // Set gain to 0 if track is disabled or muted
        gainNode2Ref.current.gain.value = audioTrack2Muted || !audioTrack2 ? 0 : audioTrack2Volume
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

      // Audio end is handled by video events — no separate rAF check needed
    },
    [
      audioTrack1,
      audioTrack2,
      audioTrack1Muted,
      audioTrack2Muted,
      audioTrack1Volume,
      audioTrack2Volume,
    ]
  )

  // Keep ref in sync so buffer-loading effect can call it without TDZ issues
  startAudioPlaybackRef.current = startAudioPlayback

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

  const { previousClip, nextClip } = useMemo(() => {
    if (!getAdjacentClip) {
      return {
        previousClip: null,
        nextClip: null,
      }
    }

    return {
      previousClip: getAdjacentClip(clip.id, 'previous'),
      nextClip: getAdjacentClip(clip.id, 'next'),
    }
  }, [clip.id, getAdjacentClip])

  const handleNavigateClip = useCallback(
    async (direction: 'previous' | 'next') => {
      if (!getAdjacentClip || !onOpenClip) {
        return
      }

      const adjacentClip = getAdjacentClip(clip.id, direction)
      if (!adjacentClip) {
        return
      }

      const saved = await flushPendingEditorState()
      if (!saved) {
        window.alert(
          'Could not save current clip edits. Please resolve the save error and try again.'
        )
        return
      }

      stopAudioPlayback()
      if (videoRef.current) {
        videoRef.current.pause()
      }

      onOpenClip(adjacentClip.clip, adjacentClip.metadata)
    },
    [clip.id, flushPendingEditorState, getAdjacentClip, onOpenClip, stopAudioPlayback]
  )

  // Track whether playhead is inside trim region (edge detection)
  const insideTrimRef = useRef(false)
  // Whether playback should loop within trim region (set on play/seek/skip from inside trim)
  const loopWithinTrimRef = useRef(false)
  // rAF handle stored in ref so play/pause handlers can start/stop loop
  const rafIdRef = useRef<number | null>(null)

  const updateLoopIntent = useCallback(
    (time: number) => {
      loopWithinTrimRef.current = time >= trimStart && time < trimEnd
    },
    [trimStart, trimEnd]
  )

  const stopRafLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [])

  const startRafLoop = useCallback(() => {
    stopRafLoop()
    const video = videoRef.current
    if (!video) return

    const tick = () => {
      const t = video.currentTime
      insideTrimRef.current = t >= trimStart && t < trimEnd

      if (loopWithinTrimRef.current && t >= trimEnd) {
        // Reached trim end while loop intent is active — loop to trim start
        video.currentTime = trimStart
        insideTrimRef.current = true
        setCurrentTime(trimStart)
        startAudioPlaybackRef.current?.(trimStart)
      } else {
        setCurrentTime(t)
      }

      rafIdRef.current = requestAnimationFrame(tick)
    }

    rafIdRef.current = requestAnimationFrame(tick)
  }, [trimStart, trimEnd, stopRafLoop])

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      syncTimelineBounds(video.duration, {
        forceTrimEnd: !isTrimEndFromMetadataRef.current,
      })
      isVideoDurationSetRef.current = true
    }

    const handlePlay = () => {
      setIsPlaying(true)
      if (audioContextRef.current?.state === 'suspended') {
        void audioContextRef.current.resume()
      }
      startAudioPlaybackRef.current?.(video.currentTime)
      const t = video.currentTime
      insideTrimRef.current = t >= trimStart && t < trimEnd
      loopWithinTrimRef.current = t >= trimStart && t < trimEnd
      startRafLoop()
    }

    const handlePause = () => {
      setIsPlaying(false)
      stopAudioPlayback()
      stopRafLoop()
      // Sync final position
      setCurrentTime(video.currentTime)
    }

    const handleEnded = () => {
      // Video reached the real end — loop to 0 and keep playing
      video.currentTime = 0
      insideTrimRef.current = 0 >= trimStart && 0 < trimEnd
      loopWithinTrimRef.current = 0 >= trimStart && 0 < trimEnd
      setCurrentTime(0)
      startAudioPlaybackRef.current?.(0)
      video.play().catch(() => {})
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    // Restart rAF loop if video is currently playing (e.g. trim markers changed mid-playback)
    if (!video.paused && !video.ended) {
      const t = video.currentTime
      insideTrimRef.current = t >= trimStart && t < trimEnd
      loopWithinTrimRef.current = t >= trimStart && t < trimEnd
      startRafLoop()
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      stopRafLoop()
    }
  }, [trimStart, trimEnd, startRafLoop, stopRafLoop, stopAudioPlayback, syncTimelineBounds])

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

  const handleVideoClick = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      const video = videoRef.current
      if (!video) return

      // Chromium fullscreen video has its own click-to-toggle behavior.
      // Running our toggle on top of that causes a double-toggle flicker.
      if (document.fullscreenElement === video) {
        return
      }

      e.preventDefault()
      togglePlay()
    },
    [togglePlay]
  )

  // Global spacebar shortcut for play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        togglePlay()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay])

  const skip = useCallback(
    (seconds: number) => {
      if (videoRef.current) {
        const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
        videoRef.current.currentTime = newTime
        setCurrentTime(newTime)
        updateLoopIntent(newTime)

        if (isPlaying) {
          startAudioPlayback(newTime)
        }
      }
    },
    [currentTime, duration, isPlaying, startAudioPlayback, updateLoopIntent]
  )

  const skipFrame = useCallback(
    (direction: 'back' | 'forward') => {
      if (videoRef.current && resolvedMetadata.fps > 0) {
        const frameTime = 1 / resolvedMetadata.fps
        const adjustment = direction === 'forward' ? frameTime : -frameTime
        const newTime = Math.max(0, Math.min(duration, currentTime + adjustment))
        videoRef.current.currentTime = newTime
        setCurrentTime(newTime)
        updateLoopIntent(newTime)

        if (isPlaying) {
          startAudioPlayback(newTime)
        }
      }
    },
    [currentTime, duration, resolvedMetadata.fps, isPlaying, startAudioPlayback, updateLoopIntent]
  )

  const seek = useCallback(
    (time: number) => {
      if (videoRef.current) {
        const newTime = Math.max(0, Math.min(duration, time))
        videoRef.current.currentTime = newTime
        setCurrentTime(newTime)
        updateLoopIntent(newTime)

        if (isPlaying) {
          startAudioPlayback(newTime)
        }
      }
    },
    [duration, isPlaying, startAudioPlayback, updateLoopIntent]
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
      void videoRef.current?.requestFullscreen()
    } else {
      void document.exitFullscreen()
    }
  }, [])

  // Timeline interactions
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timelineRef.current || isDragging) return

      const rect = timelineRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = Math.max(0, Math.min(1, x / rect.width))
      const time = percentage * safeDuration

      seek(time)
    },
    [isDragging, safeDuration, seek]
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
      const time = percentage * safeDuration

      if (isDragging === 'start') {
        setTrimStart(Math.min(clampedTrimEnd - minTrimLength, Math.max(0, time)))
      } else if (isDragging === 'end') {
        setTrimEnd(Math.max(clampedTrimStart + minTrimLength, Math.min(safeDuration, time)))
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
  }, [clampedTrimEnd, clampedTrimStart, isDragging, minTrimLength, safeDuration, seek])

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

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

  // Delete clip
  const handleDeleteClip = useCallback(async () => {
    try {
      await window.electronAPI.deleteClip(clip.id)
      onClose()
    } catch (error) {
      console.error('Failed to delete clip:', error)
    }
  }, [clip.id, onClose])

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
        exportFps: exportFps !== 'original' ? exportFps : undefined,
        exportResolution: exportResolution !== 'original' ? exportResolution : undefined,
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
  }, [
    clip.path,
    clip.filename,
    trimStart,
    trimEnd,
    audioTrack1,
    audioTrack2,
    audioTrack1Volume,
    audioTrack2Volume,
    targetSizeMB,
    exportFps,
    exportResolution,
  ])

  // Tolerance for floating-point imprecision when comparing trim markers against duration
  const TRIM_EPSILON = 0.1

  // Check if trim markers differ from the full clip (i.e. user has trimmed)
  const hasTrimRange =
    trimStart > TRIM_EPSILON || (duration > 0 && trimEnd < duration - TRIM_EPSILON)

  const handleTrimInPlace = useCallback(async () => {
    if (!window.electronAPI?.editor?.trimInPlace) {
      console.error('Trim in place API not available')
      return
    }

    setShowTrimConfirm(false)
    setIsTrimming(true)
    setTrimProgress(0)

    // Save current video source so we can restore on failure
    const prevSrc = videoRef.current?.currentSrc || videoSrc

    try {
      // Stop all playback before trimming
      setIsPlaying(false)
      stopAudioPlayback()
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.removeAttribute('src')
        videoRef.current.load()
      }

      const result = await window.electronAPI.editor.trimInPlace({
        clipId: clip.id,
        clipPath: clip.path,
        trimStart,
        trimEnd,
      })

      if (result.success) {
        // Reset trim markers to new full range
        setTrimStart(0)
        setTrimEnd(result.newDuration)
        setDuration(result.newDuration)
        setCurrentTime(0)

        // Force video element to reload with fresh file
        const freshSrc = `clipvault://clip/${encodeURIComponent(clip.filename)}?t=${Date.now()}`
        setVideoSrc(freshSrc)

        // Notify library of changes
        if (onSave) {
          onSave(clip.id, {
            favorite: isFavorite,
            tags,
            game,
            trim: { start: 0, end: result.newDuration },
            audio: {
              track1: { enabled: audioTrack1, muted: audioTrack1Muted, volume: audioTrack1Volume },
              track2: { enabled: audioTrack2, muted: audioTrack2Muted, volume: audioTrack2Volume },
            },
            playheadPosition: 0,
            lastModified: new Date().toISOString(),
          })
        }

        // Clear audio caches and trigger re-extraction
        setAudioTrack1Src(null)
        setAudioTrack2Src(null)
        audioBuffer1Ref.current = null
        audioBuffer2Ref.current = null
        hasRetriedAudioDecodeRef.current = false
        forceAudioReextractRef.current = true
        setAudioExtractionKey(k => k + 1)
      }
    } catch (error) {
      console.error('Trim in place failed:', error)
      // Restore video source so the user doesn't see a blank player
      if (prevSrc) {
        setVideoSrc(prevSrc)
      }
    } finally {
      setIsTrimming(false)
      setTrimProgress(0)
    }
  }, [
    clip.id,
    clip.path,
    clip.filename,
    trimStart,
    trimEnd,
    isFavorite,
    tags,
    game,
    audioTrack1,
    audioTrack2,
    audioTrack1Muted,
    audioTrack2Muted,
    audioTrack1Volume,
    audioTrack2Volume,
    stopAudioPlayback,
    onSave,
    videoSrc,
  ])

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
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background-secondary p-1">
            <button
              type="button"
              onClick={() => {
                void handleNavigateClip('previous')
              }}
              disabled={!previousClip}
              className="rounded-md p-2 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted"
              aria-label={
                previousClip
                  ? `Previous clip: ${previousClip.clip.filename.replace('.mp4', '')}`
                  : 'Previous clip'
              }
              title={
                previousClip
                  ? `Previous clip: ${previousClip.clip.filename.replace('.mp4', '')}`
                  : 'No previous clip in current filtered list'
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                void handleNavigateClip('next')
              }}
              disabled={!nextClip}
              className="rounded-md p-2 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted"
              aria-label={
                nextClip ? `Next clip: ${nextClip.clip.filename.replace('.mp4', '')}` : 'Next clip'
              }
              title={
                nextClip
                  ? `Next clip: ${nextClip.clip.filename.replace('.mp4', '')}`
                  : 'No next clip in current filtered list'
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">{clip.filename.replace('.mp4', '')}</h2>
            <p className="text-xs text-text-muted">
              {hasResolvedDimensions
                ? `${resolvedMetadata.width}x${resolvedMetadata.height}`
                : 'Resolution pending'}
              {' • '}
              {hasResolvedFps ? `${Math.round(resolvedMetadata.fps)}fps` : 'FPS pending'}
              {' • '}
              {hasResolvedBitrate
                ? `${Math.round(resolvedMetadata.bitrate / 1000)}kbps`
                : 'Bitrate pending'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tags */}
          <div className="mr-2 flex items-center gap-1">
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
                className="input w-20 py-1 text-xs"
              />
            </div>
          </div>

          {/* Game */}
          <button
            type="button"
            onClick={() => setIsEditingGame(true)}
            className={`flex items-center gap-1 rounded-lg px-2 py-2 transition-colors ${
              game
                ? 'text-purple-400 hover:bg-purple-400/10'
                : 'text-text-muted hover:bg-background-tertiary hover:text-text-primary'
            }`}
            title={game ? `Game: ${game}` : 'Add game tag'}
          >
            <Gamepad2 className="h-4 w-4" />
            {game && <span className="max-w-[100px] truncate text-xs">{game}</span>}
          </button>

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

          {/* Delete */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
            title="Delete clip"
          >
            <Trash2 className="h-4 w-4" />
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
              onClick={handleVideoClick}
              onError={handleVideoError}
              onLoadedMetadata={() => {
                const video = videoRef.current
                if (
                  video &&
                  video.duration &&
                  video.duration !== Infinity &&
                  !isVideoDurationSetRef.current
                ) {
                  const videoDuration = video.duration
                  syncTimelineBounds(videoDuration, {
                    forceTrimEnd: !isTrimEndFromMetadataRef.current,
                  })
                  isVideoDurationSetRef.current = true
                  console.log('[Editor] Synced duration from video metadata:', videoDuration)
                }
              }}
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
                className="absolute bottom-0 top-0 rounded-l-full bg-text-muted/20"
                style={{ left: '0%', width: `${(clampedTrimStart / safeDuration) * 100}%` }}
              />

              {/* Cut region - after trim end (grayed out) */}
              <div
                className="absolute bottom-0 top-0 rounded-r-full bg-text-muted/20"
                style={{ left: `${(clampedTrimEnd / safeDuration) * 100}%`, right: '0%' }}
              />

              {/* Trim region */}
              <div
                className="absolute inset-y-0 rounded-full bg-accent-primary/20"
                style={{
                  left: `${(clampedTrimStart / safeDuration) * 100}%`,
                  right: `${100 - (clampedTrimEnd / safeDuration) * 100}%`,
                }}
              />

              {/* Playhead - full height, vertically centered */}
              <div
                className="absolute inset-y-0 w-0.5 cursor-ew-resize bg-white"
                style={{ left: `${(clampedCurrentTime / safeDuration) * 100}%` }}
                onMouseDown={e => {
                  e.stopPropagation()
                  handlePlayheadDragStart()
                }}
              >
                <div className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-md" />
              </div>

              {/* Start trim marker - pin style extending above */}
              <div
                className="absolute bottom-0 w-1 cursor-ew-resize bg-accent-primary transition-all hover:w-1.5"
                style={{
                  left: `${(clampedTrimStart / safeDuration) * 100}%`,
                  height: '200%',
                  top: '-100%',
                }}
                onMouseDown={e => {
                  e.stopPropagation()
                  handleMarkerDragStart('start')
                }}
              >
                <div className="absolute -top-1.5 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-accent-primary shadow-md" />
              </div>

              {/* End trim marker - pin style extending above */}
              <div
                className="absolute bottom-0 w-1 cursor-ew-resize bg-accent-primary transition-all hover:w-1.5"
                style={{
                  left: `${(clampedTrimEnd / safeDuration) * 100}%`,
                  height: '200%',
                  top: '-100%',
                }}
                onMouseDown={e => {
                  e.stopPropagation()
                  handleMarkerDragStart('end')
                }}
              >
                <div className="absolute -top-1.5 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-accent-primary shadow-md" />
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
              <div className="mx-2 h-6 w-px bg-border" />
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
              <div
                className={`rounded-lg p-3 ${audioTrack1 ? 'bg-background-tertiary' : 'bg-background-tertiary/50'}`}
              >
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={audioTrack1}
                    onChange={e => setAudioTrack1(e.target.checked)}
                    className="h-4 w-4 accent-accent-primary"
                  />
                  <span
                    className={`text-sm ${audioTrack1 ? 'text-text-secondary' : 'text-text-muted'}`}
                  >
                    Desktop Audio
                  </span>
                </label>
                {audioTrack1Src && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={toggleAudioTrack1Mute}
                      disabled={!audioTrack1}
                      className={`rounded p-1 transition-colors hover:bg-background-primary ${
                        audioTrack1 ? 'text-text-muted' : 'cursor-not-allowed text-text-muted/50'
                      }`}
                    >
                      {!audioTrack1 || audioTrack1Muted || audioTrack1Volume === 0 ? (
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
                      disabled={!audioTrack1}
                      className="flex-1 accent-accent-primary disabled:opacity-50"
                    />
                  </div>
                )}
              </div>

              {/* Track 2 - Microphone */}
              <div
                className={`rounded-lg p-3 ${audioTrack2 ? 'bg-background-tertiary' : 'bg-background-tertiary/50'}`}
              >
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={audioTrack2}
                    onChange={e => setAudioTrack2(e.target.checked)}
                    className="h-4 w-4 accent-accent-primary"
                  />
                  <span
                    className={`text-sm ${audioTrack2 ? 'text-text-secondary' : 'text-text-muted'}`}
                  >
                    Microphone
                  </span>
                </label>
                {audioTrack2Src && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={toggleAudioTrack2Mute}
                      disabled={!audioTrack2}
                      className={`rounded p-1 transition-colors hover:bg-background-primary ${
                        audioTrack2 ? 'text-text-muted' : 'cursor-not-allowed text-text-muted/50'
                      }`}
                    >
                      {!audioTrack2 || audioTrack2Muted || audioTrack2Volume === 0 ? (
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
                      disabled={!audioTrack2}
                      className="flex-1 accent-accent-primary disabled:opacity-50"
                    />
                  </div>
                )}
              </div>
            </div>
            {(!audioTrack1 || !audioTrack2) && (
              <p className="text-text-warning mt-2 text-xs">
                Disabled tracks are muted during editing and excluded from export
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
              <div className="flex items-center justify-between">
                <span>FPS</span>
                <select
                  value={exportFps}
                  onChange={e => {
                    const v = e.target.value
                    setExportFps(v === 'original' ? 'original' : Number(v))
                  }}
                  disabled={isExporting || !hasResolvedFps}
                  className="rounded-md bg-background-tertiary px-2 py-1 text-sm text-text-secondary"
                >
                  <option value="original">
                    {hasResolvedFps
                      ? `Original (${Math.round(resolvedMetadata.fps)})`
                      : 'Original (Unknown)'}
                  </option>
                  {[30, 60, 120, 144]
                    .filter(fps => fps <= Math.round(resolvedMetadata.fps))
                    .map(fps => (
                      <option key={fps} value={String(fps)}>
                        {fps}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <span>Resolution</span>
                <select
                  value={exportResolution}
                  onChange={e => setExportResolution(e.target.value)}
                  disabled={isExporting || !hasResolvedDimensions}
                  className="rounded-md bg-background-tertiary px-2 py-1 text-sm text-text-secondary"
                >
                  <option value="original">
                    {hasResolvedDimensions
                      ? `Original (${resolvedMetadata.width}x${resolvedMetadata.height})`
                      : 'Original (Unknown)'}
                  </option>
                  {[
                    { label: '720p', value: '1280x720', w: 1280, h: 720 },
                    { label: '1080p', value: '1920x1080', w: 1920, h: 1080 },
                    { label: '1440p', value: '2560x1440', w: 2560, h: 1440 },
                    { label: '4K', value: '3840x2160', w: 3840, h: 2160 },
                  ]
                    .filter(r => r.w <= resolvedMetadata.width && r.h <= resolvedMetadata.height)
                    .map(r => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                </select>
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
                  onClick={e => {
                    e.stopPropagation()
                    setShowSizeDropdown(!showSizeDropdown)
                  }}
                  disabled={isExporting}
                  className={`btn-secondary flex h-full items-center gap-1 px-3 ${
                    isExporting ? 'cursor-not-allowed opacity-80' : ''
                  }`}
                  title="Select export size target"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                {showSizeDropdown && (
                  <div
                    onClick={e => e.stopPropagation()}
                    className="absolute bottom-full right-0 z-50 mb-1 w-40 rounded-lg border border-border bg-background-secondary py-1 shadow-lg"
                  >
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

            {/* Trim Original button - always visible, disabled when no trim range set */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowTrimConfirm(true)}
                disabled={isTrimming || isExporting || !hasTrimRange}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-400 transition-colors hover:bg-orange-500/20 ${
                  isTrimming || isExporting || !hasTrimRange ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                {isTrimming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {trimProgress > 0 ? `Trimming... ${Math.round(trimProgress)}%` : 'Trimming...'}
                  </>
                ) : (
                  <>
                    <Scissors className="h-4 w-4" />
                    Trim Original
                  </>
                )}
              </button>
              {isTrimming && trimProgress > 0 && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-background-tertiary">
                  <div
                    className="h-full bg-orange-500 transition-all duration-300"
                    style={{ width: `${trimProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-80 rounded-xl border border-border bg-background-secondary p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-text-primary">Delete Clip?</h3>
            <p className="mb-4 text-sm text-text-muted">
              Are you sure you want to delete &quot;{clip.filename}&quot;? This action cannot be
              undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleDeleteClip}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trim In Place Confirmation Modal */}
      {showTrimConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-96 rounded-xl border border-border bg-background-secondary p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-orange-400">Trim Original?</h3>
            <p className="mb-3 text-sm text-text-muted">
              This will permanently replace the original clip with the trimmed version (
              {formatTime(trimStart)} &ndash; {formatTime(trimEnd)}).
            </p>
            <p className="mb-4 text-sm font-medium text-red-400">
              This cannot be undone. The original full-length clip will be lost.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTrimConfirm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTrimInPlace}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600"
              >
                Trim Original
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Tag Editor Modal */}
      <GameTagEditor
        isOpen={isEditingGame}
        onClose={() => setIsEditingGame(false)}
        clip={clip}
        currentGame={game || null}
        onSave={newGame => setGame(newGame || '')}
      />
    </div>
  )
}
