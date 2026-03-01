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
  Share2,
} from 'lucide-react'
import type { AppSettings, AudioDeviceInfo, MonitorInfo } from '../../types/electron'

interface SettingsProps {
  onClose: () => void
  onSettingsSaved?: (settings: AppSettings) => void
}

type OpenDialogResult = {
  canceled: boolean
  filePaths: string[]
}

type YouTubeDeviceAuthSession = {
  deviceCode: string
  userCode: string
  verificationUrl: string
  expiresAt: number
  intervalSeconds: number
}

type YouTubeAuthMode = 'managed' | 'custom'

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

export const Settings: React.FC<SettingsProps> = ({ onClose, onSettingsSaved }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [originalSettings, setOriginalSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  const [audioOutputDevices, setAudioOutputDevices] = useState<AudioDeviceInfo[]>([])
  const [audioInputDevices, setAudioInputDevices] = useState<AudioDeviceInfo[]>([])
  const [discordTestStatus, setDiscordTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle'
  )
  const [discordTestMessage, setDiscordTestMessage] = useState('')
  const [youtubeAuthSession, setYoutubeAuthSession] = useState<YouTubeDeviceAuthSession | null>(null)
  const [youtubeAuthState, setYoutubeAuthState] = useState<'idle' | 'pending' | 'success' | 'error'>(
    'idle'
  )
  const [youtubeAuthMessage, setYoutubeAuthMessage] = useState('')
  const [youtubeManagedAvailable, setYoutubeManagedAvailable] = useState(false)
  const [showYouTubeAdvancedSetup, setShowYouTubeAdvancedSetup] = useState(false)

  // Load settings, monitors and audio devices on mount
  useEffect(() => {
    loadSettings()
    loadYouTubeProviderInfo()
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

  const loadYouTubeProviderInfo = async () => {
    try {
      const result = await window.electronAPI.social.youtubeGetProviderInfo()
      if (result.success) {
        setYoutubeManagedAvailable(result.managedAvailable)
      }
    } catch (err) {
      console.error('Error loading YouTube provider info:', err)
    }
  }

  const effectiveYouTubeAuthMode = useMemo<YouTubeAuthMode>(() => {
    if (!youtubeManagedAvailable) {
      return 'custom'
    }

    return settings?.social?.youtube?.auth_mode === 'custom' ? 'custom' : 'managed'
  }, [settings?.social?.youtube?.auth_mode, youtubeManagedAvailable])

  const showYouTubeAdvancedControls =
    !youtubeManagedAvailable || showYouTubeAdvancedSetup || effectiveYouTubeAuthMode === 'custom'

  useEffect(() => {
    if (effectiveYouTubeAuthMode === 'custom') {
      setShowYouTubeAdvancedSetup(true)
    }
  }, [effectiveYouTubeAuthMode])

  const handleSave = async () => {
    if (!settings) return

    try {
      setSaving(true)
      setError(null)
      const result = await window.electronAPI.saveSettings(settings)

      if (!result.success) {
        setSaveSuccess(false)
        setError('Failed to save settings')
        return
      }

      setSaveSuccess(true)
      setOriginalSettings(cloneSettings(settings))
      onSettingsSaved?.(cloneSettings(settings))

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

  const updateDiscordSetting = useCallback(
    (key: 'webhook_url' | 'default_message_template', value: string) => {
      setSettings(prev => {
        if (!prev) return null
        return {
          ...prev,
          social: {
            ...(prev.social || {}),
            discord: {
              ...(prev.social?.discord || {}),
              [key]: value,
            },
          },
        }
      })
    },
    []
  )

  const updateYouTubeSetting = useCallback(
    (
      key:
        | 'auth_mode'
        | 'client_id'
        | 'client_secret'
        | 'default_privacy'
        | 'default_title_template'
        | 'default_description'
        | 'default_tags',
      value: string | string[]
    ) => {
      setSettings(prev => {
        if (!prev) return null
        return {
          ...prev,
          social: {
            ...(prev.social || {}),
            youtube: {
              ...(prev.social?.youtube || {}),
              [key]: value,
            },
          },
        }
      })
    },
    []
  )

  const handleTestDiscordWebhook = useCallback(async () => {
    const webhookUrl = settings?.social?.discord?.webhook_url?.trim() || ''
    if (!webhookUrl) {
      setDiscordTestStatus('error')
      setDiscordTestMessage('Enter a webhook URL first.')
      return
    }

    setDiscordTestStatus('loading')
    setDiscordTestMessage('Testing webhook...')

    try {
      const result = await window.electronAPI.social.testDiscordWebhook(webhookUrl)
      if (result.success) {
        setDiscordTestStatus('success')
        setDiscordTestMessage('Webhook is valid and reachable.')
      } else {
        setDiscordTestStatus('error')
        setDiscordTestMessage(result.error || 'Webhook test failed.')
      }
    } catch (err) {
      setDiscordTestStatus('error')
      setDiscordTestMessage(`Webhook test failed: ${String(err)}`)
    }
  }, [settings?.social?.discord?.webhook_url])

  const handleStartYouTubeConnect = useCallback(async () => {
    const clientId = settings?.social?.youtube?.client_id?.trim() || ''
    const clientSecret = settings?.social?.youtube?.client_secret?.trim() || ''

    setYoutubeAuthState('pending')
    setYoutubeAuthMessage('Starting YouTube authorization...')

    try {
      const result = await window.electronAPI.social.youtubeStartDeviceAuth(
        effectiveYouTubeAuthMode === 'managed'
          ? { mode: 'managed' }
          : {
              mode: 'custom',
              clientId,
              clientSecret,
            }
      )

      if (!result.success || !result.deviceCode || !result.userCode || !result.verificationUrl) {
        setYoutubeAuthState('error')
        setYoutubeAuthMessage(result.error || 'Unable to start YouTube authorization.')
        return
      }

      setYoutubeAuthSession({
        deviceCode: result.deviceCode,
        userCode: result.userCode,
        verificationUrl: result.verificationUrl,
        expiresAt: Date.now() + (result.expiresInSeconds || 1800) * 1000,
        intervalSeconds: result.intervalSeconds || 5,
      })
      setYoutubeAuthState('pending')
      setYoutubeAuthMessage('Authorize in browser, then ClipVault will finish automatically.')
      void window.electronAPI.openExternal(result.verificationUrl)
    } catch (err) {
      setYoutubeAuthState('error')
      setYoutubeAuthMessage(`Unable to start YouTube authorization: ${String(err)}`)
    }
  }, [
    effectiveYouTubeAuthMode,
    settings?.social?.youtube?.client_id,
    settings?.social?.youtube?.client_secret,
  ])

  const openExternalLink = useCallback((url: string) => {
    void window.electronAPI.openExternal(url)
  }, [])

  const handleDisconnectYouTube = useCallback(async () => {
    setYoutubeAuthState('idle')
    setYoutubeAuthMessage('Disconnecting YouTube...')

    try {
      const result = await window.electronAPI.social.youtubeDisconnect()
      if (!result.success) {
        setYoutubeAuthState('error')
        setYoutubeAuthMessage(result.error || 'Failed to disconnect YouTube.')
        return
      }

      const clearConnection = (prev: AppSettings | null): AppSettings | null => {
        if (!prev) return prev
        return {
          ...prev,
          social: {
            ...(prev.social || {}),
            youtube: {
              ...(prev.social?.youtube || {}),
              access_token: '',
              refresh_token: '',
              token_expiry: 0,
              channel_id: '',
              channel_title: '',
            },
          },
        }
      }

      setSettings(prev => clearConnection(prev))
      setOriginalSettings(prev => clearConnection(prev))
      setYoutubeAuthSession(null)
      setYoutubeAuthState('success')
      setYoutubeAuthMessage('YouTube account disconnected.')
    } catch (err) {
      setYoutubeAuthState('error')
      setYoutubeAuthMessage(`Failed to disconnect YouTube: ${String(err)}`)
    }
  }, [])

  useEffect(() => {
    if (!youtubeAuthSession) {
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const scheduleNext = (intervalSeconds: number) => {
      timeoutId = setTimeout(
        () => {
          void pollAuth()
        },
        Math.max(1, intervalSeconds) * 1000
      )
    }

    const pollAuth = async () => {
      if (cancelled || Date.now() > youtubeAuthSession.expiresAt) {
        setYoutubeAuthSession(null)
        setYoutubeAuthState('error')
        setYoutubeAuthMessage('YouTube authorization expired. Start again.')
        return
      }

      try {
        const result = await window.electronAPI.social.youtubePollDeviceAuth({
          deviceCode: youtubeAuthSession.deviceCode,
        })

        if (cancelled) {
          return
        }

        if (result.success) {
          const applyConnectedState = (prev: AppSettings | null): AppSettings | null => {
            if (!prev) return prev
            return {
              ...prev,
              social: {
                ...(prev.social || {}),
                youtube: {
                  ...(prev.social?.youtube || {}),
                  channel_id: result.channelId || prev.social?.youtube?.channel_id || '',
                  channel_title: result.channelTitle || prev.social?.youtube?.channel_title || '',
                },
              },
            }
          }

          setSettings(prev => applyConnectedState(prev))
          setOriginalSettings(prev => applyConnectedState(prev))
          setYoutubeAuthSession(null)
          setYoutubeAuthState('success')
          setYoutubeAuthMessage(
            result.channelTitle
              ? `Connected to YouTube: ${result.channelTitle}`
              : 'Connected to YouTube successfully.'
          )
          return
        }

        if (result.pending) {
          setYoutubeAuthState('pending')
          setYoutubeAuthMessage('Waiting for Google authorization...')
          scheduleNext(result.intervalSeconds || youtubeAuthSession.intervalSeconds)
          return
        }

        setYoutubeAuthSession(null)
        setYoutubeAuthState('error')
        setYoutubeAuthMessage(result.error || 'YouTube authorization failed.')
      } catch (err) {
        if (cancelled) {
          return
        }
        setYoutubeAuthSession(null)
        setYoutubeAuthState('error')
        setYoutubeAuthMessage(`YouTube authorization failed: ${String(err)}`)
      }
    }

    scheduleNext(youtubeAuthSession.intervalSeconds)

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [youtubeAuthSession])

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
                          prev
                            ? { ...prev, buffer_seconds: parseInt(e.target.value, 10) || 120 }
                            : null
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
                  <div className="relative h-6 w-11 rounded-full bg-background-primary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-[22px] peer-focus:outline-none" />
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
                  <div className="relative h-6 w-11 rounded-full bg-background-primary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-[22px] peer-focus:outline-none" />
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
                  onChange={e => updateAudioSetting('bitrate', parseInt(e.target.value, 10))}
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
                            skip_seconds: parseInt(e.target.value, 10) || 5,
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

          {/* Social Sharing */}
          <section className="rounded-xl border border-border bg-background-secondary p-6">
            <div className="mb-4 flex items-center gap-2">
              <Share2 className="h-5 w-5 text-accent-primary" />
              <h2 className="text-lg font-semibold text-text-primary">Social Sharing</h2>
            </div>

            <div className="space-y-6">
              <div className="rounded-lg border border-border bg-background-tertiary p-4">
                <div className="mb-2 text-sm font-semibold text-text-primary">Discord</div>
                <p className="mb-4 text-xs text-text-muted">
                  Use a Discord channel webhook for direct uploads from export preview.
                </p>

                <div className="mb-4 rounded-lg border border-border/70 bg-background-secondary p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Setup Guide
                  </div>
                  <ol className="list-decimal space-y-1 pl-5 text-xs text-text-muted">
                    <li>Open your Discord server and go to the channel you want uploads in.</li>
                    <li>Open channel settings, then go to Integrations, then Webhooks.</li>
                    <li>Create a new webhook, choose a name/icon, and pick the channel.</li>
                    <li>Copy the webhook URL and paste it below in ClipVault.</li>
                    <li>Click Test Webhook to verify everything before exporting clips.</li>
                  </ol>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openExternalLink(
                          'https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks'
                        )
                      }
                      className="rounded-lg border border-border bg-background-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                    >
                      Open Discord webhook guide
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="discordWebhookUrl"
                      className="mb-1 block text-sm font-medium text-text-secondary"
                    >
                      Webhook URL
                    </label>
                    <input
                      id="discordWebhookUrl"
                      type="password"
                      value={settings.social?.discord?.webhook_url ?? ''}
                      onChange={e => updateDiscordSetting('webhook_url', e.target.value)}
                      className="w-full rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                      placeholder="https://discord.com/api/webhooks/..."
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void handleTestDiscordWebhook()
                      }}
                      disabled={discordTestStatus === 'loading'}
                      className="rounded-lg border border-border bg-background-secondary px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary disabled:opacity-60"
                    >
                      {discordTestStatus === 'loading' ? 'Testing...' : 'Test Webhook'}
                    </button>
                    {discordTestMessage && (
                      <span
                        className={`text-xs ${
                          discordTestStatus === 'success'
                            ? 'text-success'
                            : discordTestStatus === 'error'
                              ? 'text-error'
                              : 'text-text-muted'
                        }`}
                      >
                        {discordTestMessage}
                      </span>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="discordMessageTemplate"
                      className="mb-1 block text-sm font-medium text-text-secondary"
                    >
                      Default Discord Message Template
                    </label>
                    <input
                      id="discordMessageTemplate"
                      type="text"
                      value={settings.social?.discord?.default_message_template ?? ''}
                      onChange={e =>
                        updateDiscordSetting('default_message_template', e.target.value)
                      }
                      className="w-full rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                      placeholder="New clip from ClipVault: {clip_name}"
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      Placeholders: {'{clip_name}'}, {'{filename}'}, {'{date}'}, {'{time}'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background-tertiary p-4">
                <div className="mb-2 text-sm font-semibold text-text-primary">YouTube</div>
                <p className="mb-4 text-xs text-text-muted">
                  Connect via Google OAuth and upload exports directly from the preview window.
                </p>

                {youtubeManagedAvailable && !showYouTubeAdvancedControls && (
                  <div className="mb-4 rounded-lg border border-border/70 bg-background-secondary p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Quick Connect (Recommended)
                    </div>
                    <ol className="list-decimal space-y-1 pl-5 text-xs text-text-muted">
                      <li>Click Connect YouTube below.</li>
                      <li>ClipVault opens Google automatically.</li>
                      <li>Enter the code shown here and approve access.</li>
                      <li>Return to ClipVault and uploads are ready.</li>
                    </ol>
                    <button
                      type="button"
                      onClick={() => {
                        setShowYouTubeAdvancedSetup(true)
                      }}
                      className="mt-3 rounded-lg border border-border bg-background-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                    >
                      Need custom setup?
                    </button>
                  </div>
                )}

                {showYouTubeAdvancedControls && (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateYouTubeSetting('auth_mode', 'managed')}
                        disabled={!youtubeManagedAvailable}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          effectiveYouTubeAuthMode === 'managed'
                            ? 'border-accent-primary text-accent-primary'
                            : 'border-border text-text-secondary hover:border-accent-primary hover:text-accent-primary'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        ClipVault managed
                      </button>
                      <button
                        type="button"
                        onClick={() => updateYouTubeSetting('auth_mode', 'custom')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          effectiveYouTubeAuthMode === 'custom'
                            ? 'border-accent-primary text-accent-primary'
                            : 'border-border text-text-secondary hover:border-accent-primary hover:text-accent-primary'
                        }`}
                      >
                        Custom credentials
                      </button>
                      {youtubeManagedAvailable && showYouTubeAdvancedSetup && (
                        <button
                          type="button"
                          onClick={() => {
                            updateYouTubeSetting('auth_mode', 'managed')
                            setShowYouTubeAdvancedSetup(false)
                          }}
                          className="rounded-lg border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                        >
                          Back to easy setup
                        </button>
                      )}
                    </div>

                    <p className="mb-3 text-xs text-text-muted">
                      {youtubeManagedAvailable
                        ? 'Managed mode is available and recommended. Use custom only if you run your own OAuth app.'
                        : 'Managed mode is not available in this build yet, so custom credentials are required.'}
                    </p>

                    <div className="mb-4 rounded-lg border border-border/70 bg-background-secondary p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        {effectiveYouTubeAuthMode === 'managed'
                          ? 'Managed Connect Flow'
                          : 'Guided OAuth Setup'}
                      </div>
                      {effectiveYouTubeAuthMode === 'managed' ? (
                        <ol className="list-decimal space-y-1 pl-5 text-xs text-text-muted">
                          <li>Click Connect YouTube below.</li>
                          <li>ClipVault opens the Google device verification page automatically.</li>
                          <li>Enter the shown code and approve access.</li>
                          <li>Return to ClipVault and uploads will be enabled.</li>
                        </ol>
                      ) : (
                        <>
                          <ol className="list-decimal space-y-1 pl-5 text-xs text-text-muted">
                            <li>Create or pick a Google Cloud project.</li>
                            <li>Enable YouTube Data API v3 for that project.</li>
                            <li>
                              Configure OAuth consent screen (External) and add your account as test
                              user.
                            </li>
                            <li>Create OAuth credentials for Desktop App and copy Client ID and Secret.</li>
                            <li>
                              Paste credentials below, click Connect YouTube, and approve in Google.
                            </li>
                          </ol>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openExternalLink('https://console.cloud.google.com/')}
                              className="rounded-lg border border-border bg-background-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                            >
                              Open Google Cloud
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openExternalLink(
                                  'https://console.cloud.google.com/apis/library/youtube.googleapis.com'
                                )
                              }
                              className="rounded-lg border border-border bg-background-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                            >
                              Open API page
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openExternalLink('https://console.cloud.google.com/apis/credentials')
                              }
                              className="rounded-lg border border-border bg-background-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                            >
                              Open credentials page
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {effectiveYouTubeAuthMode === 'custom' && (
                      <>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="youtubeClientId"
                              className="mb-1 block text-sm font-medium text-text-secondary"
                            >
                              OAuth Client ID
                            </label>
                            <input
                              id="youtubeClientId"
                              type="text"
                              value={settings.social?.youtube?.client_id ?? ''}
                              onChange={e => updateYouTubeSetting('client_id', e.target.value)}
                              className="w-full rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                              placeholder="Google OAuth desktop client ID"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="youtubeClientSecret"
                              className="mb-1 block text-sm font-medium text-text-secondary"
                            >
                              OAuth Client Secret
                            </label>
                            <input
                              id="youtubeClientSecret"
                              type="password"
                              value={settings.social?.youtube?.client_secret ?? ''}
                              onChange={e => updateYouTubeSetting('client_secret', e.target.value)}
                              className="w-full rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                              placeholder="Google OAuth client secret"
                            />
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-text-muted">
                          Client secret is hidden after load for security. Leave it blank to keep
                          the stored value.
                        </p>
                      </>
                    )}
                  </>
                )}

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="youtubeDefaultPrivacy"
                      className="mb-1 block text-sm font-medium text-text-secondary"
                    >
                      Default Privacy
                    </label>
                    <select
                      id="youtubeDefaultPrivacy"
                      value={settings.social?.youtube?.default_privacy ?? 'unlisted'}
                      onChange={e => updateYouTubeSetting('default_privacy', e.target.value)}
                      className="w-full rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                    >
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="youtubeDefaultTitleTemplate"
                      className="mb-1 block text-sm font-medium text-text-secondary"
                    >
                      Default Title Template
                    </label>
                    <input
                      id="youtubeDefaultTitleTemplate"
                      type="text"
                      value={settings.social?.youtube?.default_title_template ?? ''}
                      onChange={e => updateYouTubeSetting('default_title_template', e.target.value)}
                      className="w-full rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                      placeholder="{clip_name}"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label
                    htmlFor="youtubeDefaultDescription"
                    className="mb-1 block text-sm font-medium text-text-secondary"
                  >
                    Default Description
                  </label>
                  <textarea
                    id="youtubeDefaultDescription"
                    value={settings.social?.youtube?.default_description ?? ''}
                    onChange={e => updateYouTubeSetting('default_description', e.target.value)}
                    className="h-24 w-full rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                    placeholder="Shared from ClipVault"
                  />
                </div>

                <div className="mt-3">
                  <label
                    htmlFor="youtubeDefaultTags"
                    className="mb-1 block text-sm font-medium text-text-secondary"
                  >
                    Default Tags (comma separated)
                  </label>
                  <input
                    id="youtubeDefaultTags"
                    type="text"
                    value={(settings.social?.youtube?.default_tags ?? []).join(', ')}
                    onChange={e =>
                      updateYouTubeSetting(
                        'default_tags',
                        e.target.value
                          .split(',')
                          .map(tag => tag.trim())
                          .filter(Boolean)
                      )
                    }
                    className="w-full rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none"
                    placeholder="clipvault, gaming, highlights"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleStartYouTubeConnect()
                    }}
                    className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary/90"
                  >
                    {settings.social?.youtube?.channel_title
                      ? 'Reconnect YouTube'
                      : effectiveYouTubeAuthMode === 'managed'
                        ? 'Connect YouTube'
                        : 'Connect YouTube (Custom)'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void handleDisconnectYouTube()
                    }}
                    disabled={!settings.social?.youtube?.channel_title}
                    className="rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-red-400 hover:text-red-400 disabled:opacity-50"
                  >
                    Disconnect
                  </button>

                  {youtubeAuthSession && (
                    <button
                      type="button"
                      onClick={() => {
                        void window.electronAPI.openExternal(youtubeAuthSession.verificationUrl)
                      }}
                      className="rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                    >
                      Open Google Device Page
                    </button>
                  )}
                </div>

                {youtubeAuthSession && (
                  <div className="mt-3 rounded-lg border border-accent-primary/30 bg-accent-primary/10 p-3 text-sm text-text-primary">
                    <div className="text-xs text-text-muted">Enter this code in Google:</div>
                    <div className="mt-1 font-mono text-lg tracking-wider text-accent-primary">
                      {youtubeAuthSession.userCode}
                    </div>
                  </div>
                )}

                {settings.social?.youtube?.channel_title && (
                  <p className="mt-2 text-xs text-success">
                    Connected channel: {settings.social.youtube.channel_title}
                  </p>
                )}

                {youtubeAuthMessage && (
                  <p
                    className={`mt-2 text-xs ${
                      youtubeAuthState === 'success'
                        ? 'text-success'
                        : youtubeAuthState === 'error'
                          ? 'text-error'
                          : 'text-text-muted'
                    }`}
                  >
                    {youtubeAuthMessage}
                  </p>
                )}

                <p className="mt-3 text-xs text-text-muted">
                  Placeholders for title template: {'{clip_name}'}, {'{filename}'}, {'{date}'},
                  {' {time}'}
                </p>
              </div>
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
                  <div className="block text-sm font-medium text-text-primary">
                    Start with Windows
                  </div>
                  <p className="text-xs text-text-muted">
                    Automatically run ClipVault when you log in
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.ui?.start_with_windows}
                  aria-label="Start with Windows"
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

              {/* Library Hover Preview */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="block text-sm font-medium text-text-primary">
                    Library hover preview
                  </div>
                  <p className="text-xs text-text-muted">
                    Play a muted video preview when hovering clips in the library
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.ui?.library_hover_preview !== false}
                  aria-label="Library hover preview"
                  onClick={() =>
                    setSettings(prev =>
                      prev
                        ? {
                            ...prev,
                            ui: {
                              ...(prev.ui || {}),
                              library_hover_preview: !(prev.ui?.library_hover_preview ?? true),
                            },
                          }
                        : null
                    )
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.ui?.library_hover_preview !== false
                      ? 'bg-accent-primary'
                      : 'bg-background-tertiary'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.ui?.library_hover_preview !== false
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Show Notifications */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="block text-sm font-medium text-text-primary">
                    Show save notifications
                  </div>
                  <p className="text-xs text-text-muted">
                    Display a tray notification when a clip is saved
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.ui?.show_notifications !== false}
                  aria-label="Show save notifications"
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
                      settings.ui?.show_notifications !== false ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Play Sound */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="block text-sm font-medium text-text-primary">
                    Play sound on save
                  </div>
                  <p className="text-xs text-text-muted">
                    Play a sound effect when a clip is saved
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.ui?.play_sound !== false}
                  aria-label="Play sound on save"
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
