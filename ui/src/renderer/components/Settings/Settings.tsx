import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Save,
  RotateCcw,
  FolderOpen,
  Video,
  Mic,
  Keyboard,
  Info,
  Monitor,
  HardDrive,
  Power,
} from 'lucide-react'

interface AppSettings {
  output_path: string
  buffer_seconds: number
  video: {
    width: number
    height: number
    fps: number
    encoder: 'auto' | 'nvenc' | 'x264'
    quality: number
    monitor: number
  }
  audio: {
    sample_rate: number
    bitrate: number
    system_audio_enabled: boolean
    microphone_enabled: boolean
    system_audio_device_id?: string
    microphone_device_id?: string
  }
  hotkey: {
    save_clip: string
  }
  editor?: {
    skip_seconds?: number
  }
  ui?: {
    show_notifications?: boolean
    play_sound?: boolean
    minimize_to_tray?: boolean
    start_with_windows?: boolean
    first_run_completed?: boolean
  }
}

interface SettingsProps {
  onClose: () => void
}

interface MonitorInfo {
  id: number
  name: string
  width: number
  height: number
  x: number
  y: number
  primary: boolean
}

interface AudioDeviceInfo {
  id: string
  name: string
  type: 'output' | 'input'
  is_default: boolean
}

type OpenDialogResult = {
  canceled: boolean
  filePaths: string[]
}

// Quality presets with realistic bitrates for file size calculation
// Based on real-world x264 CQP encoding (measured from actual clips)
const qualityPresets = {
  low: {
    quality: 30,
    label: 'Low',
    description: 'Smaller files, good for sharing',
    videoBitrateMbps: 1.5, // ~1.5 Mbps (heavily compressed)
  },
  medium: {
    quality: 23,
    label: 'Medium',
    description: 'Best balance of quality and size',
    videoBitrateMbps: 2.5, // ~2.5 Mbps (typical for CQP 20-23)
  },
  high: {
    quality: 18,
    label: 'High',
    description: 'High quality, larger files',
    videoBitrateMbps: 5, // ~5 Mbps
  },
  ultra: {
    quality: 15,
    label: 'Ultra',
    description: 'Maximum quality, very large files',
    videoBitrateMbps: 12, // ~12 Mbps (visually lossless)
  },
}

// All resolution presets (will be filtered by monitor resolution)
const allResolutionPresets = [
  { label: '720p', width: 1280, height: 720, fps: 30 },
  { label: '1080p', width: 1920, height: 1080, fps: 60 },
  { label: '1440p', width: 2560, height: 1440, fps: 60 },
  { label: '4K', width: 3840, height: 2160, fps: 30 },
]

// FPS options
const fpsOptions = [30, 60, 120, 144]

// Calculate estimated file size
const calculateEstimatedSize = (
  durationSeconds: number,
  width: number,
  height: number,
  fps: number,
  qualityPreset: keyof typeof qualityPresets,
  audioBitrateKbps: number
): string => {
  const preset = qualityPresets[qualityPreset]

  // Base bitrate for 1080p60
  let videoBitrateMbps = preset.videoBitrateMbps

  // Adjust for resolution (pixel count ratio vs 1080p)
  const pixelCount = width * height
  const pixelRatio = pixelCount / (1920 * 1080)
  videoBitrateMbps *= pixelRatio

  // Adjust for frame rate (linear scaling roughly)
  const fpsRatio = fps / 60
  videoBitrateMbps *= fpsRatio

  // Audio bitrate in Mbps
  const audioBitrateMbps = audioBitrateKbps / 1000

  // Total bitrate
  const totalBitrateMbps = videoBitrateMbps + audioBitrateMbps

  // Calculate size in MB
  const sizeMB = (totalBitrateMbps * durationSeconds) / 8

  // Format nicely
  if (sizeMB >= 1024) {
    return `${(sizeMB / 1024).toFixed(2)} GB`
  } else if (sizeMB >= 1) {
    return `${sizeMB.toFixed(1)} MB`
  } else {
    return `${(sizeMB * 1024).toFixed(0)} KB`
  }
}

// Format duration
const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) {
    return `${minutes} min`
  }
  return `${minutes}m ${remainingSeconds}s`
}

// Hotkey Input Component
interface HotkeyInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const HotkeyInput: React.FC<HotkeyInputProps> = ({
  value,
  onChange,
  placeholder = 'Click to set hotkey',
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const inputRef = useRef<HTMLDivElement>(null)

  const formatHotkey = (hotkey: string): string => {
    if (!hotkey) return ''
    return hotkey
      .replace(/Control/g, 'Ctrl')
      .replace(/Command/g, 'Cmd')
      .replace(/Option/g, 'Alt')
      .replace(/Shift/g, '⇧')
      .replace(/Ctrl/g, 'Ctrl')
      .replace(/Alt/g, 'Alt')
      .replace(/Meta/g, 'Win')
      .replace(/\+/g, ' + ')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return

    e.preventDefault()
    e.stopPropagation()

    // Ignore standalone modifier keys
    if (['Control', 'Alt', 'Shift', 'Meta', 'Command', 'Option'].includes(e.key)) {
      return
    }

    // Build the hotkey string
    const modifiers: string[] = []
    if (e.ctrlKey) modifiers.push('Ctrl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')
    if (e.metaKey) modifiers.push('Win')

    // Get the main key
    let key = e.key
    if (key.length === 1) {
      key = key.toUpperCase()
    } else if (key.startsWith('F') && /^F\d+$/.test(key)) {
      // Keep F1-F24 as-is
    } else if (key === 'Escape') {
      key = 'Esc'
    } else if (key === 'Delete') {
      key = 'Del'
    } else if (key === 'Insert') {
      key = 'Ins'
    } else if (key === 'PageUp') {
      key = 'PgUp'
    } else if (key === 'PageDown') {
      key = 'PgDown'
    } else if (key === 'ArrowUp') {
      key = 'Up'
    } else if (key === 'ArrowDown') {
      key = 'Down'
    } else if (key === 'ArrowLeft') {
      key = 'Left'
    } else if (key === 'ArrowRight') {
      key = 'Right'
    } else if (key === 'Backspace') {
      key = 'Backspace'
    } else if (key === 'Tab') {
      key = 'Tab'
    } else if (key === 'Enter') {
      key = 'Enter'
    } else if (key === 'Space') {
      key = 'Space'
    }

    // Combine modifiers and key
    const hotkeyString = [...modifiers, key].join('+')
    onChange(hotkeyString)
    setIsRecording(false)
  }

  const handleClick = () => {
    setIsRecording(true)
  }

  const handleBlur = () => {
    setIsRecording(false)
  }

  const clearHotkey = () => {
    onChange('')
    setIsRecording(false)
  }

  return (
    <div className="flex items-center gap-2">
      <div
        ref={inputRef}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        tabIndex={0}
        className={`flex-1 cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
          isRecording
            ? 'border-accent-primary bg-accent-primary/10 text-accent-primary ring-2 ring-accent-primary/50'
            : 'border-border bg-background-tertiary text-text-primary hover:border-accent-primary/50'
        }`}
      >
        {isRecording ? (
          <span className="animate-pulse">Press keys...</span>
        ) : value ? (
          <span className="flex items-center gap-2">
            {formatHotkey(value)
              .split(' + ')
              .map((part, i, arr) => (
                <span key={i} className="flex items-center gap-2">
                  <kbd className="rounded bg-background-secondary px-2 py-0.5 text-xs">{part}</kbd>
                  {i < arr.length - 1 && <span className="text-text-muted">+</span>}
                </span>
              ))}
          </span>
        ) : (
          <span className="text-text-muted">{placeholder}</span>
        )}
      </div>
      {value && (
        <button
          onClick={clearHotkey}
          className="hover:border-error hover:text-error rounded-lg border border-border bg-background-tertiary px-3 py-2 text-sm text-text-secondary transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  )
}

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [originalSettings, setOriginalSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioDeviceInfo[]>([])
  const [audioInputDevices, setAudioInputDevices] = useState<AudioDeviceInfo[]>([])

  // Load settings, monitors and audio devices on mount
  useEffect(() => {
    loadSettings()
    loadMonitors()
    loadAudioDevices()
  }, [])

  const cloneSettings = (value: AppSettings): AppSettings =>
    JSON.parse(JSON.stringify(value)) as AppSettings

  const isOpenDialogResult = (value: unknown): value is OpenDialogResult => {
    if (!value || typeof value !== 'object') return false
    const record = value as { canceled?: unknown; filePaths?: unknown }
    return typeof record.canceled === 'boolean' && Array.isArray(record.filePaths)
  }

  const loadSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await window.electronAPI.getSettings()
      setSettings(data)
      setOriginalSettings(cloneSettings(data))
    } catch (err) {
      setError('Failed to load settings')
      console.error('Error loading settings:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMonitors = async () => {
    try {
      const monitorList = await window.electronAPI.getMonitors()
      setMonitors(monitorList)
    } catch (err) {
      console.error('Error loading monitors:', err)
    }
  }

  const loadAudioDevices = async () => {
    try {
      // Get audio devices from backend (returns WASAPI device IDs that OBS can use)
      const [outputs, inputs] = await Promise.all([
        window.electronAPI.getAudioDevices('output'),
        window.electronAPI.getAudioDevices('input'),
      ])
      setAudioOutputDevices(outputs)
      setAudioInputDevices(inputs)
    } catch (err) {
      console.error('Error loading audio devices:', err)
    }
  }

  const handleSave = async () => {
    if (!settings) return

    try {
      setSaving(true)
      setError(null)
      const result = await window.electronAPI.saveSettings(settings)
      setSaveSuccess(true)
      setOriginalSettings(cloneSettings(settings))

      // Show restart message
      if (result.restarted) {
        setTimeout(() => {
          setError(null)
        }, 3000)
      }

      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setError('Failed to save settings')
      console.error('Error saving settings:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (originalSettings) {
      setSettings(cloneSettings(originalSettings))
    }
  }

  const updateVideoSetting = useCallback((key: keyof AppSettings['video'], value: unknown) => {
    setSettings(prev => {
      if (!prev) return null
      return {
        ...prev,
        video: {
          ...prev.video,
          [key]: value,
        },
      }
    })
  }, [])

  const updateAudioSetting = useCallback((key: keyof AppSettings['audio'], value: unknown) => {
    setSettings(prev => {
      if (!prev) return null
      return {
        ...prev,
        audio: {
          ...prev.audio,
          [key]: value,
        },
      }
    })
  }, [])

  const applyQualityPreset = (preset: keyof typeof qualityPresets) => {
    const { quality } = qualityPresets[preset]
    updateVideoSetting('quality', quality)
  }

  const applyResolutionPreset = (preset: (typeof allResolutionPresets)[0]) => {
    updateVideoSetting('width', preset.width)
    updateVideoSetting('height', preset.height)
    updateVideoSetting('fps', preset.fps)
  }

  // Get available resolution presets based on selected monitor
  const getAvailableResolutionPresets = () => {
    if (!settings || monitors.length === 0) return allResolutionPresets

    const selectedMonitor = monitors.find(m => m.id === settings.video.monitor) || monitors[0]
    if (!selectedMonitor) return allResolutionPresets

    // Filter presets that fit within the monitor's resolution
    return allResolutionPresets.filter(
      preset => preset.width <= selectedMonitor.width && preset.height <= selectedMonitor.height
    )
  }

  // Get current quality preset name
  const getCurrentQualityPreset = (): keyof typeof qualityPresets => {
    if (!settings) return 'medium'
    const currentQuality = settings.video.quality
    const preset = (Object.keys(qualityPresets) as Array<keyof typeof qualityPresets>).find(
      key => qualityPresets[key].quality === currentQuality
    )
    return preset || 'medium'
  }

  // Calculate estimated file size
  const estimatedSize = useMemo(() => {
    if (!settings) return '0 MB'
    return calculateEstimatedSize(
      settings.buffer_seconds,
      settings.video.width,
      settings.video.height,
      settings.video.fps,
      getCurrentQualityPreset(),
      settings.audio.bitrate
    )
  }, [settings])

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-text-secondary">Loading settings...</div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-error">Failed to load settings</div>
      </div>
    )
  }

  const availablePresets = getAvailableResolutionPresets()
  const currentPreset = getCurrentQualityPreset()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
          <span className="text-sm text-text-muted">
            Backend will automatically restart when you save
          </span>
        </div>
        <div className="flex items-center gap-3">
          {saveSuccess && <span className="text-success text-sm">Saved & restarted!</span>}
          {hasChanges && <span className="text-warning text-sm">Unsaved changes</span>}
          <button
            onClick={handleReset}
            disabled={!hasChanges || saving}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-background-tertiary disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-background-tertiary"
          >
            Close
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-error/10 text-error mx-6 mt-4 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Video & Capture Settings */}
          <section className="rounded-xl border border-border bg-background-secondary p-6">
            <div className="mb-4 flex items-center gap-2">
              <Video className="h-5 w-5 text-accent-primary" />
              <h2 className="text-lg font-semibold text-text-primary">Video & Capture</h2>
            </div>

            <div className="space-y-6">
              {/* Monitor Selection */}
              {monitors.length > 0 && (
                <div>
                  <label className="mb-3 block text-sm font-medium text-text-secondary">
                    Capture Monitor
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {monitors.map(monitor => (
                      <button
                        key={monitor.id}
                        onClick={() => updateVideoSetting('monitor', monitor.id)}
                        className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-all ${
                          settings.video.monitor === monitor.id
                            ? 'border-accent-primary bg-accent-primary/10'
                            : 'border-border bg-background-tertiary hover:border-accent-primary/50'
                        }`}
                      >
                        <Monitor
                          className={`h-5 w-5 ${settings.video.monitor === monitor.id ? 'text-accent-primary' : 'text-text-muted'}`}
                        />
                        <div>
                          <div
                            className={`text-sm font-medium ${settings.video.monitor === monitor.id ? 'text-accent-primary' : 'text-text-primary'}`}
                          >
                            {monitor.name} {monitor.primary && '(Primary)'}
                          </div>
                          <div className="text-xs text-text-muted">
                            {monitor.width}x{monitor.height}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution & FPS */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Resolution Presets */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">
                    Resolution
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availablePresets.map(preset => {
                      const isActive =
                        settings.video.width === preset.width &&
                        settings.video.height === preset.height
                      return (
                        <button
                          key={preset.label}
                          onClick={() => applyResolutionPreset(preset)}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                            isActive
                              ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                              : 'border-border bg-background-tertiary text-text-secondary hover:border-accent-primary/50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      )
                    })}
                  </div>
                  {monitors.length > 0 && availablePresets.length < allResolutionPresets.length && (
                    <p className="text-text-warning mt-2 text-xs">
                      Some options hidden - exceed monitor resolution
                    </p>
                  )}
                </div>

                {/* FPS Selection */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">
                    Frame Rate (FPS)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {fpsOptions.map(fps => (
                      <button
                        key={fps}
                        onClick={() => updateVideoSetting('fps', fps)}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                          settings.video.fps === fps
                            ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                            : 'border-border bg-background-tertiary text-text-secondary hover:border-accent-primary/50'
                        }`}
                      >
                        {fps}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quality Presets */}
              <div>
                <label className="mb-3 block text-sm font-medium text-text-secondary">
                  Quality Preset
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(Object.keys(qualityPresets) as Array<keyof typeof qualityPresets>).map(
                    preset => {
                      const isActive = settings.video.quality === qualityPresets[preset].quality
                      return (
                        <button
                          key={preset}
                          onClick={() => applyQualityPreset(preset)}
                          className={`rounded-lg border p-3 text-left transition-all ${
                            isActive
                              ? 'border-accent-primary bg-accent-primary/10'
                              : 'border-border bg-background-tertiary hover:border-accent-primary/50'
                          }`}
                        >
                          <div
                            className={`text-sm font-medium ${isActive ? 'text-accent-primary' : 'text-text-primary'}`}
                          >
                            {qualityPresets[preset].label}
                          </div>
                          <div className="mt-1 text-xs leading-tight text-text-muted">
                            {qualityPresets[preset].description}
                          </div>
                        </button>
                      )
                    }
                  )}
                </div>
              </div>

              {/* Buffer Duration - Moved to Video section */}
              <div className="rounded-lg border border-border bg-background-tertiary p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">
                      Buffer Duration
                    </label>
                    <p className="mt-1 text-xs text-text-muted">
                      How much gameplay is kept in memory
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="30"
                      max="300"
                      step="30"
                      value={settings.buffer_seconds}
                      onChange={e =>
                        setSettings(prev =>
                          prev ? { ...prev, buffer_seconds: parseInt(e.target.value) || 120 } : null
                        )
                      }
                      className="w-20 rounded-lg border border-border bg-background-secondary px-3 py-2 text-center text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                    />
                    <span className="w-16 text-sm text-text-muted">
                      {formatDuration(settings.buffer_seconds)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Encoder Selection */}
              <div>
                <label className="mb-2 block text-sm font-medium text-text-secondary">
                  Encoder
                </label>
                <div className="flex gap-3">
                  {(['auto', 'nvenc', 'x264'] as const).map(encoder => (
                    <button
                      key={encoder}
                      onClick={() => updateVideoSetting('encoder', encoder)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                        settings.video.encoder === encoder
                          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                          : 'border-border bg-background-tertiary text-text-secondary hover:border-accent-primary/50'
                      }`}
                    >
                      {encoder === 'auto' && 'Auto (NVENC if available)'}
                      {encoder === 'nvenc' && 'NVENC (GPU)'}
                      {encoder === 'x264' && 'x264 (CPU)'}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  NVENC uses your NVIDIA GPU for minimal performance impact
                </p>
              </div>

              {/* File Size Estimation */}
              <div className="rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-4">
                <div className="flex items-center gap-3">
                  <HardDrive className="h-5 w-5 text-accent-primary" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-text-primary">
                      Estimated File Size per Clip
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      Based on {formatDuration(settings.buffer_seconds)} @ {settings.video.width}x
                      {settings.video.height} with {qualityPresets[currentPreset].label} quality
                    </div>
                    <div className="mt-0.5 text-xs italic text-text-muted/60">
                      *Actual size varies with content complexity (CQP/CRF uses variable bitrate)
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-accent-primary">{estimatedSize}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Output Settings */}
          <section className="rounded-xl border border-border bg-background-secondary p-6">
            <div className="mb-4 flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-accent-primary" />
              <h2 className="text-lg font-semibold text-text-primary">Output</h2>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">
                Clips Folder
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-lg border border-border bg-background-tertiary px-4 py-2 text-sm text-text-primary">
                  {settings.output_path}
                </div>
                <button
                  onClick={async () => {
                    try {
                      const result: unknown = await window.electronAPI.dialog.openFolder()
                      if (!isOpenDialogResult(result)) {
                        return
                      }
                      const { canceled, filePaths } = result
                      if (!canceled && filePaths.length > 0) {
                        setSettings(prev => (prev ? { ...prev, output_path: filePaths[0] } : null))
                      }
                    } catch (error) {
                      console.error('Failed to open folder picker:', error)
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background-tertiary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse...
                </button>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Where clips are saved when you press {settings.hotkey.save_clip}
              </p>
            </div>
          </section>

          {/* Audio Settings */}
          <section className="rounded-xl border border-border bg-background-secondary p-6">
            <div className="mb-4 flex items-center gap-2">
              <Mic className="h-5 w-5 text-accent-primary" />
              <h2 className="text-lg font-semibold text-text-primary">Audio</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-background-tertiary p-4">
                <div>
                  <div className="font-medium text-text-primary">System Audio</div>
                  <div className="text-sm text-text-muted">Record desktop/game audio</div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.audio.system_audio_enabled}
                    onChange={e => updateAudioSetting('system_audio_enabled', e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="peer-checked:after:left-[22px] h-6 w-11 rounded-full bg-background-primary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-focus:outline-none" />
                </label>
              </div>

              {settings.audio.system_audio_enabled && audioOutputDevices.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">
                    System Audio Device
                  </label>
                  <select
                    value={settings.audio.system_audio_device_id || 'default'}
                    onChange={e => updateAudioSetting('system_audio_device_id', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                  >
                    <option value="default">Default Device (follows system setting)</option>
                    {audioOutputDevices.map(device => (
                      <option key={device.id} value={device.id}>
                        {device.name}
                        {device.is_default ? ' (Current Default)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-muted">
                    {settings.audio.system_audio_device_id === 'default' ||
                    !settings.audio.system_audio_device_id
                      ? 'Will automatically switch when you change your Windows default device'
                      : 'Using a specific device - will not follow system changes'}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-border bg-background-tertiary p-4">
                <div>
                  <div className="font-medium text-text-primary">Microphone</div>
                  <div className="text-sm text-text-muted">Record microphone input</div>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.audio.microphone_enabled}
                    onChange={e => updateAudioSetting('microphone_enabled', e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="peer-checked:after:left-[22px] h-6 w-11 rounded-full bg-background-primary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-focus:outline-none" />
                </label>
              </div>

              {settings.audio.microphone_enabled && audioInputDevices.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">
                    Microphone Device
                  </label>
                  <select
                    value={settings.audio.microphone_device_id || 'default'}
                    onChange={e => updateAudioSetting('microphone_device_id', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                  >
                    <option value="default">Default Device (follows system setting)</option>
                    {audioInputDevices.map(device => (
                      <option key={device.id} value={device.id}>
                        {device.name}
                        {device.is_default ? ' (Current Default)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-muted">
                    {settings.audio.microphone_device_id === 'default' ||
                    !settings.audio.microphone_device_id
                      ? 'Will automatically switch when you change your Windows default device'
                      : 'Using a specific device - will not follow system changes'}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-text-secondary">
                  Audio Bitrate: {settings.audio.bitrate} kbps
                </label>
                <input
                  type="range"
                  min="96"
                  max="320"
                  step="32"
                  value={settings.audio.bitrate}
                  onChange={e => updateAudioSetting('bitrate', parseInt(e.target.value))}
                  className="w-full accent-accent-primary"
                />
                <div className="mt-1 flex justify-between text-xs text-text-muted">
                  <span>96 kbps (compact)</span>
                  <span>320 kbps (high quality)</span>
                </div>
              </div>
            </div>
          </section>

          {/* Editor Settings */}
          <section className="rounded-xl border border-border bg-background-secondary p-6">
            <div className="mb-4 flex items-center gap-2">
              <Video className="h-5 w-5 text-accent-primary" />
              <h2 className="text-lg font-semibold text-text-primary">Editor</h2>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">
                Skip Duration (seconds)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.editor?.skip_seconds ?? 5}
                onChange={e =>
                  setSettings(prev =>
                    prev
                      ? {
                          ...prev,
                          editor: {
                            ...(prev.editor || {}),
                            skip_seconds: parseInt(e.target.value) || 5,
                          },
                        }
                      : null
                  )
                }
                className="w-full rounded-lg border border-border bg-background-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
              />
              <p className="mt-1 text-xs text-text-muted">
                How many seconds to skip when using the skip buttons in the editor
              </p>
            </div>
          </section>

          {/* Hotkey Settings */}
          <section className="rounded-xl border border-border bg-background-secondary p-6">
            <div className="mb-4 flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-accent-primary" />
              <h2 className="text-lg font-semibold text-text-primary">Hotkey</h2>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-text-secondary">
                Save Clip Hotkey
              </label>
              <HotkeyInput
                value={settings.hotkey.save_clip}
                onChange={value =>
                  setSettings(prev =>
                    prev ? { ...prev, hotkey: { ...prev.hotkey, save_clip: value } } : null
                  )
                }
                placeholder="Click to set hotkey (e.g., F9)"
              />
              <p className="mt-1 text-xs text-text-muted">
                Press this key combination to save the last{' '}
                {formatDuration(settings.buffer_seconds)} as a clip (~{estimatedSize})
              </p>
            </div>
          </section>

          {/* Startup & Behavior */}
          <section className="rounded-xl border border-border bg-background-secondary p-6">
            <div className="mb-4 flex items-center gap-2">
              <Power className="h-5 w-5 text-accent-primary" />
              <h2 className="text-lg font-semibold text-text-primary">Startup & Behavior</h2>
            </div>

            <div className="space-y-4">
              {/* Start with Windows */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-text-primary">
                    Start with Windows
                  </label>
                  <p className="text-xs text-text-muted">
                    Automatically run ClipVault when you log in
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!settings) return
                    const newValue = !settings.ui?.start_with_windows
                    setSettings(prev =>
                      prev
                        ? { ...prev, ui: { ...(prev.ui || {}), start_with_windows: newValue } }
                        : null
                    )
                    try {
                      await window.electronAPI.setStartup(newValue)
                    } catch (error) {
                      console.error('Failed to set startup:', error)
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.ui?.start_with_windows ? 'bg-accent-primary' : 'bg-background-tertiary'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.ui?.start_with_windows ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Show Notifications */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-text-primary">
                    Show save notifications
                  </label>
                  <p className="text-xs text-text-muted">
                    Display a tray notification when a clip is saved
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings(prev =>
                      prev
                        ? {
                            ...prev,
                            ui: {
                              ...(prev.ui || {}),
                              show_notifications: !(prev.ui?.show_notifications ?? true),
                            },
                          }
                        : null
                    )
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.ui?.show_notifications !== false
                      ? 'bg-accent-primary'
                      : 'bg-background-tertiary'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.ui?.show_notifications !== false
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Play Sound */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-text-primary">
                    Play sound on save
                  </label>
                  <p className="text-xs text-text-muted">
                    Play a sound effect when a clip is saved
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings(prev =>
                      prev
                        ? {
                            ...prev,
                            ui: {
                              ...(prev.ui || {}),
                              play_sound: !(prev.ui?.play_sound ?? true),
                            },
                          }
                        : null
                    )
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.ui?.play_sound !== false
                      ? 'bg-accent-primary'
                      : 'bg-background-tertiary'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.ui?.play_sound !== false ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Info */}
          <section className="rounded-xl border border-border bg-background-secondary p-6">
            <div className="mb-4 flex items-center gap-2">
              <Info className="h-5 w-5 text-accent-primary" />
              <h2 className="text-lg font-semibold text-text-primary">About</h2>
            </div>

            <div className="space-y-2 text-sm text-text-secondary">
              <p>ClipVault - Lightweight game clipping tool</p>
              <p>
                Settings are saved to{' '}
                <code className="rounded bg-background-tertiary px-2 py-1 text-text-primary">
                  %APPDATA%\ClipVault\settings.json
                </code>
              </p>
              <p className="text-text-muted">
                Changes require restarting the backend to take full effect.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
