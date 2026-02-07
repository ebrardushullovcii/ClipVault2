import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, Monitor, Mic, Sparkles, Keyboard } from 'lucide-react'
import type { AppSettings, AudioDeviceInfo, MonitorInfo } from '../../types/electron'

// Fallback only — the actual default comes from main process via initialSettings.output_path
const DEFAULT_CLIPS_PATH = 'C:\\Videos\\ClipVault'
const DEFAULT_VIDEO: AppSettings['video'] = {
  width: 1920,
  height: 1080,
  fps: 60,
  encoder: 'auto',
  quality: 20,
  monitor: 0,
}
const DEFAULT_AUDIO: AppSettings['audio'] = {
  sample_rate: 48000,
  bitrate: 160,
  system_audio_enabled: true,
  microphone_enabled: true,
  system_audio_device_id: 'default',
  microphone_device_id: 'default',
}

const qualityPresets = [
  {
    id: 'performance',
    label: 'Performance',
    description: 'Smaller files, lighter load',
    quality: 28,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Great quality and size',
    quality: 22,
  },
  {
    id: 'quality',
    label: 'Quality',
    description: 'Sharper image, larger files',
    quality: 18,
  },
  {
    id: 'ultra',
    label: 'Ultra',
    description: 'Max quality for showcases',
    quality: 15,
  },
]

const bufferOptions = [
  { value: 30, label: '30 sec' },
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: 300, label: '5 min' },
]

const formatHotkey = (hotkey: string): string => {
  if (!hotkey) return ''
  return hotkey
    .replace(/Control/g, 'Ctrl')
    .replace(/Command/g, 'Cmd')
    .replace(/Option/g, 'Alt')
    .replace(/Shift/g, '\u21e7')
    .replace(/Meta/g, 'Win')
    .replace(/\+/g, ' + ')
}

const WizardHotkeyInput: React.FC<{
  value: string
  onChange: (value: string) => void
}> = ({ value, onChange }) => {
  const [isRecording, setIsRecording] = useState(false)
  const inputRef = useRef<HTMLButtonElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isRecording) {
      e.preventDefault()
      e.stopPropagation()
      if (['Control', 'Alt', 'Shift', 'Meta', 'Command', 'Option'].includes(e.key)) return

      const modifiers: string[] = []
      if (e.ctrlKey) modifiers.push('Ctrl')
      if (e.altKey) modifiers.push('Alt')
      if (e.shiftKey) modifiers.push('Shift')
      if (e.metaKey) modifiers.push('Win')

      let key = e.key
      if (key.length === 1) key = key.toUpperCase()
      else if (key === 'Escape') key = 'Esc'
      else if (key === 'Delete') key = 'Del'

      onChange([...modifiers, key].join('+'))
      setIsRecording(false)
    }
  }

  const handleClick = () => {
    setIsRecording(true)
    inputRef.current?.focus()
  }

  return (
    <button
      ref={inputRef}
      type="button"
      aria-label="Set hotkey"
      aria-pressed={isRecording}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={() => setIsRecording(false)}
      className={`cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
        isRecording
          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary ring-2 ring-accent-primary/50'
          : 'border-border bg-background-tertiary text-text-primary hover:border-accent-primary/50'
      }`}
    >
      {isRecording ? (
        <span className="animate-pulse">Press a key...</span>
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
        <span className="text-text-muted">Click to set hotkey</span>
      )}
    </button>
  )
}

const normalizeSettings = (value: AppSettings): AppSettings => {
  const outputPath = value.output_path?.trim() ? value.output_path.trim() : DEFAULT_CLIPS_PATH
  const video = { ...DEFAULT_VIDEO, ...(value.video ?? {}) }
  const audio = { ...DEFAULT_AUDIO, ...(value.audio ?? {}) }
  const ui = value.ui ?? {}
  const monitor = video.monitor
  return {
    ...value,
    output_path: outputPath,
    video: {
      ...video,
      monitor: Number.isFinite(monitor) ? monitor : DEFAULT_VIDEO.monitor,
    },
    audio: {
      ...audio,
      system_audio_device_id: audio.system_audio_device_id ?? DEFAULT_AUDIO.system_audio_device_id,
      microphone_device_id: audio.microphone_device_id ?? DEFAULT_AUDIO.microphone_device_id,
    },
    buffer_seconds: value.buffer_seconds ?? 120,
    hotkey: {
      save_clip: value.hotkey?.save_clip ?? 'F9',
    },
    ui: {
      show_notifications: ui.show_notifications ?? true,
      play_sound: ui.play_sound ?? true,
      start_with_windows: ui.start_with_windows ?? false,
      first_run_completed: ui.first_run_completed ?? false,
    },
  }
}

const withDefaultDevice = (
  devices: AudioDeviceInfo[],
  fallbackType: AudioDeviceInfo['type']
): AudioDeviceInfo[] => {
  const hasDefault = devices.some(device => device.id === 'default')
  if (hasDefault) {
    return devices
  }
  return [
    {
      id: 'default',
      name: 'Default Device (follows system setting)',
      type: devices[0]?.type ?? fallbackType,
      is_default: false, // This is the "follow default" option, not a device that IS the default
    },
    ...devices,
  ]
}

interface FirstRunWizardProps {
  initialSettings: AppSettings
  onComplete: (settings: AppSettings) => void
  onSkip: (settings: AppSettings) => void
}

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({
  initialSettings,
  onComplete,
  onSkip,
}) => {
  const [stepIndex, setStepIndex] = useState(0)
  const [settings, setSettings] = useState<AppSettings>(() => normalizeSettings(initialSettings))
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<AudioDeviceInfo[]>([])
  const [audioInputs, setAudioInputs] = useState<AudioDeviceInfo[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)

  useEffect(() => {
    setSettings(normalizeSettings(initialSettings))
  }, [initialSettings])

  useEffect(() => {
    let mounted = true
    const loadDevices = async () => {
      setLoadingDevices(true)
      try {
        const [monitorList, outputDevices, inputDevices] = await Promise.all([
          window.electronAPI.getMonitors(),
          window.electronAPI.getAudioDevices('output'),
          window.electronAPI.getAudioDevices('input'),
        ])

        if (!mounted) return

        setMonitors(monitorList)
        setAudioOutputs(withDefaultDevice(outputDevices, 'output'))
        setAudioInputs(withDefaultDevice(inputDevices, 'input'))
      } catch (error) {
        console.error('[FirstRunWizard] Failed to load devices:', error)
      } finally {
        if (mounted) {
          setLoadingDevices(false)
        }
      }
    }

    void loadDevices()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (monitors.length === 0) return
    const selected = settings.video.monitor
    const exists = monitors.some(monitor => monitor.id === selected)
    if (!exists) {
      const primary = monitors.find(monitor => monitor.primary) ?? monitors[0]
      setSettings(prev => ({
        ...prev,
        video: {
          ...prev.video,
          monitor: primary.id,
        },
      }))
    }
  }, [monitors, settings.video.monitor])

  const currentQuality = useMemo(() => {
    const match = qualityPresets.find(preset => preset.quality === settings.video.quality)
    return match?.id ?? 'balanced'
  }, [settings.video.quality])

  const steps = [
    { id: 'storage', title: 'Storage', icon: FolderOpen },
    { id: 'capture', title: 'Capture', icon: Monitor },
    { id: 'audio', title: 'Audio', icon: Mic },
    { id: 'behavior', title: 'Hotkey', icon: Keyboard },
  ]

  const canContinue = useMemo(() => {
    if (stepIndex === 0) {
      return settings.output_path.trim().length > 0
    }
    return true
  }, [stepIndex, settings.output_path])

  const handleBrowseFolder = async () => {
    try {
      const result = await window.electronAPI.dialog.openFolder()
      if (!result.canceled && result.filePaths.length > 0) {
        const [selectedPath] = result.filePaths
        setSettings(prev => ({ ...prev, output_path: selectedPath }))
      }
    } catch (error) {
      console.error('[FirstRunWizard] Failed to open folder picker:', error)
    }
  }

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(prev => prev + 1)
      return
    }

    const finalSettings: AppSettings = {
      ...settings,
      ui: {
        ...settings.ui,
        first_run_completed: true,
      },
    }
    onComplete(finalSettings)
  }

  const handleBack = () => {
    setStepIndex(prev => Math.max(prev - 1, 0))
  }

  const handleSkip = () => {
    const finalSettings: AppSettings = {
      ...settings,
      ui: {
        ...settings.ui,
        first_run_completed: true,
      },
    }
    onSkip(finalSettings)
  }

  const selectedMonitor = monitors.find(monitor => monitor.id === settings.video.monitor)
  const clipsPathLabelId = 'first-run-clips-path-label'
  const clipsPathDisplayId = 'first-run-clips-path-display'
  const monitorSelectId = 'first-run-monitor-select'
  const monitorInfoId = 'first-run-monitor-info'
  const qualityLabelId = 'first-run-quality-label'
  const systemAudioLabelId = 'first-run-system-audio-label'
  const microphoneLabelId = 'first-run-microphone-label'
  const startWithWindowsLabelId = 'first-run-start-windows-label'
  const showNotificationsLabelId = 'first-run-show-notifications-label'
  const playSoundLabelId = 'first-run-play-sound-label'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-border bg-background-secondary p-8 shadow-2xl">
        <div className="flex max-h-[calc(100vh-4rem)] flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-accent-primary">
                <Sparkles className="h-4 w-4" />
                ClipVault Setup
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-text-primary">
                Let’s get everything ready before your first clip.
              </h1>
              <p className="mt-2 max-w-xl text-sm text-text-muted">
                We’ll set a clips folder, pick a capture monitor, and lock in audio and startup
                defaults. You can change any of this later in Settings.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted transition-colors hover:border-accent-primary hover:text-accent-primary"
            >
              Skip Setup
            </button>
          </div>

          <div className="flex items-center gap-2">
            {steps.map((step, index) => {
              const isActive = index === stepIndex
              const isComplete = index < stepIndex
              const Icon = step.icon
              return (
                <div key={step.id} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-accent-primary bg-accent-primary text-white'
                        : isComplete
                          ? 'border-accent-primary/40 bg-accent-primary/20 text-accent-primary'
                          : 'border-border bg-background-tertiary text-text-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        isActive || isComplete ? 'text-text-primary' : 'text-text-muted'
                      }`}
                    >
                      {step.title}
                    </div>
                    <div className="h-1 w-full rounded-full bg-background-tertiary">
                      <div
                        className={`h-1 rounded-full transition-all ${
                          isComplete
                            ? 'w-full bg-accent-primary'
                            : isActive
                              ? 'w-1/2 bg-accent-primary'
                              : 'w-0'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-background-primary p-6">
            {stepIndex === 0 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">
                    Choose your clips folder
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    This is where every clip will be saved. We’ll automatically create the folder if
                    it doesn’t exist yet.
                  </p>
                </div>
                <div className="space-y-3">
                  <label
                    htmlFor={clipsPathDisplayId}
                    id={clipsPathLabelId}
                    className="text-sm font-medium text-text-secondary"
                  >
                    Clips folder path
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      id={clipsPathDisplayId}
                      type="text"
                      readOnly
                      aria-labelledby={clipsPathLabelId}
                      value={settings.output_path}
                      className="flex-1 rounded-lg border border-border bg-background-tertiary px-4 py-2 text-sm text-text-primary"
                    />
                    <button
                      type="button"
                      onClick={handleBrowseFolder}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background-secondary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Browse
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings(prev => ({
                          ...prev,
                          output_path: initialSettings.output_path || DEFAULT_CLIPS_PATH,
                        }))
                      }
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:border-accent-primary hover:text-accent-primary"
                    >
                      Use Default
                    </button>
                  </div>
                </div>
              </div>
            )}

            {stepIndex === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">
                    Pick your capture monitor
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    ClipVault will record the monitor you select. You can switch monitors later in
                    Settings.
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div className="space-y-3">
                    <label
                      htmlFor={monitorSelectId}
                      className="text-sm font-medium text-text-secondary"
                    >
                      Monitor
                    </label>
                    <select
                      id={monitorSelectId}
                      className="w-full rounded-lg border border-border bg-background-tertiary px-3 py-2 text-sm text-text-primary"
                      value={settings.video.monitor}
                      aria-describedby={selectedMonitor ? monitorInfoId : undefined}
                      onChange={event =>
                        setSettings(prev => ({
                          ...prev,
                          video: { ...prev.video, monitor: Number(event.target.value) },
                        }))
                      }
                    >
                      {monitors.length === 0 && (
                        <option value={settings.video.monitor}>
                          Monitor {settings.video.monitor + 1}
                        </option>
                      )}
                      {monitors.map(monitor => (
                        <option key={monitor.id} value={monitor.id}>
                          {monitor.name} ({monitor.width}x{monitor.height})
                          {monitor.primary ? ' • Primary' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedMonitor && (
                      <div
                        id={monitorInfoId}
                        className="rounded-lg border border-border bg-background-secondary p-3 text-xs text-text-muted"
                      >
                        Selected monitor: {selectedMonitor.width}x{selectedMonitor.height} @
                        {settings.video.fps}fps
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div id={qualityLabelId} className="text-sm font-medium text-text-secondary">
                      Quality preset
                    </div>
                    <div role="radiogroup" aria-labelledby={qualityLabelId} className="grid gap-2">
                      {qualityPresets.map(preset => {
                        const isActive = currentQuality === preset.id
                        const inputId = `first-run-quality-${preset.id}`
                        return (
                          <label
                            key={preset.id}
                            htmlFor={inputId}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              isActive
                                ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
                                : 'border-border bg-background-secondary text-text-muted hover:border-accent-primary'
                            }`}
                          >
                            <input
                              id={inputId}
                              type="radio"
                              name="first-run-quality"
                              value={preset.id}
                              checked={isActive}
                              onChange={() =>
                                setSettings(prev => ({
                                  ...prev,
                                  video: { ...prev.video, quality: preset.quality },
                                }))
                              }
                              className="sr-only"
                            />
                            <div>
                              <div className="font-semibold text-text-primary">{preset.label}</div>
                              <div className="text-xs text-text-muted">{preset.description}</div>
                            </div>
                            <div className="text-xs font-semibold text-text-muted">
                              CQP {preset.quality}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div id="frame-rate-label" className="text-sm font-medium text-text-secondary">
                      Frame rate
                    </div>
                    <div
                      className="flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-labelledby="frame-rate-label"
                    >
                      {[30, 60, 120, 144].map(fps => {
                        const isActive = settings.video.fps === fps
                        return (
                          <label
                            key={fps}
                            className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                              isActive
                                ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                                : 'border-border bg-background-secondary text-text-muted hover:border-accent-primary'
                            }`}
                          >
                            <input
                              type="radio"
                              name="wizard-fps"
                              className="sr-only"
                              checked={isActive}
                              onChange={() =>
                                setSettings(prev => ({
                                  ...prev,
                                  video: { ...prev.video, fps },
                                }))
                              }
                            />
                            {fps} FPS
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div id="encoder-label" className="text-sm font-medium text-text-secondary">
                      Encoder
                    </div>
                    <div
                      className="flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-labelledby="encoder-label"
                    >
                      {(
                        [
                          { value: 'auto', label: 'Auto' },
                          { value: 'nvenc', label: 'NVENC (GPU)' },
                          { value: 'x264', label: 'x264 (CPU)' },
                        ] as const
                      ).map(enc => {
                        const isActive = settings.video.encoder === enc.value
                        return (
                          <label
                            key={enc.value}
                            className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                              isActive
                                ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                                : 'border-border bg-background-secondary text-text-muted hover:border-accent-primary'
                            }`}
                          >
                            <input
                              type="radio"
                              name="wizard-encoder"
                              className="sr-only"
                              checked={isActive}
                              onChange={() =>
                                setSettings(prev => ({
                                  ...prev,
                                  video: { ...prev.video, encoder: enc.value },
                                }))
                              }
                            />
                            {enc.label}
                          </label>
                        )
                      })}
                    </div>
                    <p className="text-xs text-text-muted">
                      NVENC uses your GPU for minimal performance impact.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div
                    id="buffer-duration-label"
                    className="text-sm font-medium text-text-secondary"
                  >
                    Buffer duration
                  </div>
                  <p className="text-xs text-text-muted">
                    How much gameplay is kept in memory. When you press the save hotkey, this is the
                    maximum clip length.
                  </p>
                  <div
                    className="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-labelledby="buffer-duration-label"
                  >
                    {bufferOptions.map(opt => {
                      const isActive = (settings.buffer_seconds ?? 120) === opt.value
                      return (
                        <label
                          key={opt.value}
                          className={`cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                              : 'border-border bg-background-secondary text-text-muted hover:border-accent-primary'
                          }`}
                        >
                          <input
                            type="radio"
                            name="wizard-buffer"
                            className="sr-only"
                            checked={isActive}
                            onChange={() =>
                              setSettings(prev => ({
                                ...prev,
                                buffer_seconds: opt.value,
                              }))
                            }
                          />
                          {opt.label}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {stepIndex === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Audio devices</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Choose the default devices for system audio and microphone capture. You can
                    tweak them anytime in Settings.
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div id={systemAudioLabelId}>
                        <div className="text-sm font-semibold text-text-primary">System audio</div>
                        <div className="text-xs text-text-muted">
                          Capture game and desktop sound
                        </div>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          aria-labelledby={systemAudioLabelId}
                          checked={settings.audio.system_audio_enabled}
                          onChange={event =>
                            setSettings(prev => ({
                              ...prev,
                              audio: {
                                ...prev.audio,
                                system_audio_enabled: event.target.checked,
                              },
                            }))
                          }
                          className="peer sr-only"
                        />
                        <div className="relative h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-[22px]" />
                      </label>
                    </div>
                    <select
                      disabled={!settings.audio.system_audio_enabled}
                      className="w-full rounded-lg border border-border bg-background-tertiary px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                      value={settings.audio.system_audio_device_id ?? 'default'}
                      onChange={event =>
                        setSettings(prev => ({
                          ...prev,
                          audio: {
                            ...prev.audio,
                            system_audio_device_id: event.target.value,
                          },
                        }))
                      }
                    >
                      {audioOutputs.map(device => (
                        <option key={device.id} value={device.id}>
                          {device.name}
                          {device.is_default ? ' (Current Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div id={microphoneLabelId}>
                        <div className="text-sm font-semibold text-text-primary">Microphone</div>
                        <div className="text-xs text-text-muted">Add your voice or team chat</div>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          aria-labelledby={microphoneLabelId}
                          checked={settings.audio.microphone_enabled}
                          onChange={event =>
                            setSettings(prev => ({
                              ...prev,
                              audio: {
                                ...prev.audio,
                                microphone_enabled: event.target.checked,
                              },
                            }))
                          }
                          className="peer sr-only"
                        />
                        <div className="relative h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-[22px]" />
                      </label>
                    </div>
                    <select
                      disabled={!settings.audio.microphone_enabled}
                      className="w-full rounded-lg border border-border bg-background-tertiary px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                      value={settings.audio.microphone_device_id ?? 'default'}
                      onChange={event =>
                        setSettings(prev => ({
                          ...prev,
                          audio: {
                            ...prev.audio,
                            microphone_device_id: event.target.value,
                          },
                        }))
                      }
                    >
                      {audioInputs.map(device => (
                        <option key={device.id} value={device.id}>
                          {device.name}
                          {device.is_default ? ' (Current Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-text-secondary">
                    Audio bitrate: {settings.audio.bitrate ?? 160} kbps
                  </div>
                  <input
                    type="range"
                    min="96"
                    max="320"
                    step="32"
                    value={settings.audio.bitrate ?? 160}
                    aria-label="Audio bitrate in kbps"
                    onChange={event =>
                      setSettings(prev => ({
                        ...prev,
                        audio: {
                          ...prev.audio,
                          bitrate: parseInt(event.target.value, 10),
                        },
                      }))
                    }
                    className="w-full accent-accent-primary"
                  />
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>96 kbps (compact)</span>
                    <span>320 kbps (high quality)</span>
                  </div>
                </div>
                {loadingDevices && (
                  <div className="text-xs text-text-muted">Loading devices from backend...</div>
                )}
              </div>
            )}

            {stepIndex === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Hotkey & behavior</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Set up the key that saves your clips and decide how ClipVault starts.
                  </p>
                </div>
                <div className="grid gap-4">
                  <div className="rounded-lg border border-border bg-background-secondary p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Keyboard className="h-4 w-4 text-accent-primary" />
                      <div className="text-sm font-semibold text-text-primary">
                        Save clip hotkey
                      </div>
                    </div>
                    <WizardHotkeyInput
                      value={settings.hotkey?.save_clip ?? 'F9'}
                      onChange={value =>
                        setSettings(prev => ({
                          ...prev,
                          hotkey: { ...prev.hotkey, save_clip: value },
                        }))
                      }
                    />
                    <div className="mt-2 text-xs text-text-muted">
                      Press this key anytime to save your last{' '}
                      {bufferOptions.find(o => o.value === (settings.buffer_seconds ?? 120))
                        ?.label ?? '2 min'}{' '}
                      of gameplay.
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-background-secondary p-4">
                    <div id={startWithWindowsLabelId}>
                      <div className="text-sm font-semibold text-text-primary">
                        Start with Windows
                      </div>
                      <div className="text-xs text-text-muted">
                        Launch ClipVault in the background when you log in.
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        aria-labelledby={startWithWindowsLabelId}
                        checked={settings.ui?.start_with_windows ?? false}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            ui: {
                              ...prev.ui,
                              start_with_windows: event.target.checked,
                            },
                          }))
                        }
                        className="peer sr-only"
                      />
                      <div className="relative h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-[22px]" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-background-secondary p-4">
                    <div id={showNotificationsLabelId}>
                      <div className="text-sm font-semibold text-text-primary">
                        Show save notifications
                      </div>
                      <div className="text-xs text-text-muted">
                        Display a tray notification when a clip is saved.
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        aria-labelledby={showNotificationsLabelId}
                        checked={settings.ui?.show_notifications ?? true}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            ui: {
                              ...prev.ui,
                              show_notifications: event.target.checked,
                            },
                          }))
                        }
                        className="peer sr-only"
                      />
                      <div className="relative h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-[22px]" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-background-secondary p-4">
                    <div id={playSoundLabelId}>
                      <div className="text-sm font-semibold text-text-primary">
                        Play sound on save
                      </div>
                      <div className="text-xs text-text-muted">
                        Play a sound effect when a clip is saved.
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        aria-labelledby={playSoundLabelId}
                        checked={settings.ui?.play_sound ?? true}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            ui: {
                              ...prev.ui,
                              play_sound: event.target.checked,
                            },
                          }))
                        }
                        className="peer sr-only"
                      />
                      <div className="relative h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-[22px]" />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleBack}
              disabled={stepIndex === 0}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:border-accent-primary hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            <div className="flex items-center gap-3">
              <div className="text-xs text-text-muted">
                Step {stepIndex + 1} of {steps.length}
              </div>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canContinue}
                className="rounded-lg bg-accent-primary px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {stepIndex === steps.length - 1 ? 'Finish Setup' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
