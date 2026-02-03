import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Monitor, Mic, Power, Sparkles } from 'lucide-react'
import type { AppSettings, AudioDeviceInfo, MonitorInfo } from '../../types/electron'

const DEFAULT_CLIPS_PATH = 'D:\\Clips\\ClipVault'

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

const normalizeSettings = (value: AppSettings): AppSettings => {
  const outputPath = value.output_path?.trim() ? value.output_path : DEFAULT_CLIPS_PATH
  return {
    ...value,
    output_path: outputPath,
    video: {
      ...value.video,
      monitor: Number.isFinite(value.video.monitor) ? value.video.monitor : 0,
    },
    audio: {
      ...value.audio,
      system_audio_device_id: value.audio.system_audio_device_id ?? 'default',
      microphone_device_id: value.audio.microphone_device_id ?? 'default',
    },
    ui: {
      show_notifications: value.ui?.show_notifications ?? true,
      minimize_to_tray: value.ui?.minimize_to_tray ?? true,
      start_with_windows: value.ui?.start_with_windows ?? false,
      first_run_completed: value.ui?.first_run_completed ?? false,
    },
  }
}

const withDefaultDevice = (
  devices: AudioDeviceInfo[],
  label: string,
  fallbackType: AudioDeviceInfo['type']
): AudioDeviceInfo[] => {
  const hasDefault = devices.some(device => device.id === 'default')
  if (hasDefault) {
    return devices
  }
  return [
    {
      id: 'default',
      name: label,
      type: devices[0]?.type ?? fallbackType,
      is_default: true,
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
        setAudioOutputs(withDefaultDevice(outputDevices, 'System Default', 'output'))
        setAudioInputs(withDefaultDevice(inputDevices, 'Microphone Default', 'input'))
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
    { id: 'behavior', title: 'Behavior', icon: Power },
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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-border bg-background-secondary p-8 shadow-2xl">
        <div className="flex flex-col gap-6">
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
                          isComplete ? 'w-full bg-accent-primary' : isActive ? 'w-1/2 bg-accent-primary' : 'w-0'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="min-h-[320px] rounded-2xl border border-border bg-background-primary p-6">
            {stepIndex === 0 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Choose your clips folder</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    This is where every clip will be saved. We’ll automatically create the folder if it
                    doesn’t exist yet.
                  </p>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-medium text-text-secondary">Clips folder path</label>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 rounded-lg border border-border bg-background-tertiary px-4 py-2 text-sm text-text-primary">
                      {settings.output_path}
                    </div>
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
                          output_path: DEFAULT_CLIPS_PATH,
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
                  <h2 className="text-xl font-semibold text-text-primary">Pick your capture monitor</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    ClipVault will record the monitor you select. You can switch monitors later in
                    Settings.
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-text-secondary">Monitor</label>
                    <select
                      className="w-full rounded-lg border border-border bg-background-tertiary px-3 py-2 text-sm text-text-primary"
                      value={settings.video.monitor}
                      onChange={event =>
                        setSettings(prev => ({
                          ...prev,
                          video: { ...prev.video, monitor: Number(event.target.value) },
                        }))
                      }
                    >
                      {monitors.length === 0 && (
                        <option value={settings.video.monitor}>Monitor {settings.video.monitor + 1}</option>
                      )}
                      {monitors.map(monitor => (
                        <option key={monitor.id} value={monitor.id}>
                          {monitor.name} ({monitor.width}x{monitor.height})
                          {monitor.primary ? ' • Primary' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedMonitor && (
                      <div className="rounded-lg border border-border bg-background-secondary p-3 text-xs text-text-muted">
                        Selected monitor: {selectedMonitor.width}x{selectedMonitor.height} @
                        {settings.video.fps}fps
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-text-secondary">Quality preset</label>
                    <div className="grid gap-2">
                      {qualityPresets.map(preset => {
                        const isActive = currentQuality === preset.id
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() =>
                              setSettings(prev => ({
                                ...prev,
                                video: { ...prev.video, quality: preset.quality },
                              }))
                            }
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              isActive
                                ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
                                : 'border-border bg-background-secondary text-text-muted hover:border-accent-primary'
                            }`}
                          >
                            <div>
                              <div className="font-semibold text-text-primary">{preset.label}</div>
                              <div className="text-xs text-text-muted">{preset.description}</div>
                            </div>
                            <div className="text-xs font-semibold text-text-muted">CQP {preset.quality}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {stepIndex === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Audio devices</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Choose the default devices for system audio and microphone capture. You can tweak
                    them anytime in Settings.
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">System audio</div>
                        <div className="text-xs text-text-muted">Capture game and desktop sound</div>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
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
                        <div className="h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-5.5" />
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
                          {device.name}{device.is_default ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">Microphone</div>
                        <div className="text-xs text-text-muted">Add your voice or team chat</div>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
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
                        <div className="h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-5.5" />
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
                          {device.name}{device.is_default ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {loadingDevices && (
                  <div className="text-xs text-text-muted">
                    Loading devices from backend...
                  </div>
                )}
              </div>
            )}

            {stepIndex === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Startup & behavior</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Decide how ClipVault behaves when Windows starts or when you close the window.
                  </p>
                </div>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-background-secondary p-4">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">Start with Windows</div>
                      <div className="text-xs text-text-muted">
                        Launch ClipVault in the background when you log in.
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
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
                      <div className="h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-5.5" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-background-secondary p-4">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">Minimize to tray</div>
                      <div className="text-xs text-text-muted">
                        Keep ClipVault running when you close the window.
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={settings.ui?.minimize_to_tray ?? true}
                        onChange={event =>
                          setSettings(prev => ({
                            ...prev,
                            ui: {
                              ...prev.ui,
                              minimize_to_tray: event.target.checked,
                            },
                          }))
                        }
                        className="peer sr-only"
                      />
                      <div className="h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-5.5" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-background-secondary p-4">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">Show save notifications</div>
                      <div className="text-xs text-text-muted">
                        Display a tray notification when a clip is saved.
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
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
                      <div className="h-6 w-11 rounded-full bg-background-tertiary after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-accent-primary peer-checked:after:left-5.5" />
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
