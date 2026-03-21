import React, { useEffect, useState } from 'react'
import {
  ArrowsOutSimple,
  Bell,
  Brain,
  Command,
  Crosshair,
  Drop,
  FolderOpen,
  Gear,
  Info,
  Keyboard,
  Lightning,
  Microphone,
  MoonStars,
  Target,
  X,
} from '@phosphor-icons/react'
import { DEFAULT_SHORTCUT_SETTINGS, DEFAULT_KEYBINDINGS, KEYBINDING_LABELS, formatShortcutLabel } from '../../shared/types'
import type { KeybindingMap, KeybindingAction } from '../../shared/types'
import { useSessionStore, getReasoningLevelsForModel } from '../stores/sessionStore'
import { useColors, useThemeStore, FONT_PRESETS } from '../theme'

interface AppSettings {
  defaultModel: string
  defaultReasoning: string
  defaultDirectory: string
  rememberPosition: boolean
  yoloMode: boolean
  micEnabled: boolean
  voiceLanguage: string
  voiceKey: string
  keybindings?: Partial<KeybindingMap>
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultModel: 'gpt-5.4',
  defaultReasoning: 'medium',
  defaultDirectory: '~',
  rememberPosition: false,
  yoloMode: true,
  micEnabled: true,
  voiceLanguage: '',
  voiceKey: 'Alt',
}

const VOICE_LANGUAGES = [
  { id: '', label: 'Auto Detect' },
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' },
  { id: 'zh', label: '中文' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
]

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

function normalizeKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  if (key === 'ArrowUp') return 'Up'
  if (key === 'ArrowDown') return 'Down'
  if (key === 'ArrowLeft') return 'Left'
  if (key === 'ArrowRight') return 'Right'
  if (key === 'Escape') return 'Escape'
  return key
}

function eventToShortcut(e: React.KeyboardEvent): { value: string | null; preview: string } {
  const modifiers: string[] = []
  if (e.metaKey) modifiers.push('CommandOrControl')
  if (e.ctrlKey) modifiers.push('Control')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')

  const key = e.key
  const preview = [...modifiers, ...(!MODIFIER_KEYS.has(key) ? [normalizeKey(key)] : [])].join('+')

  if (MODIFIER_KEYS.has(key)) {
    return { value: null, preview: modifiers.join('+') }
  }

  return {
    value: [...modifiers, normalizeKey(key)].join('+'),
    preview,
  }
}

function keybindingEventToString(e: React.KeyboardEvent): { value: string | null; preview: string } {
  const modifiers: string[] = []
  if (e.metaKey) modifiers.push('Meta')
  if (e.ctrlKey) modifiers.push('Control')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')

  const key = e.key
  const preview = [...modifiers, ...(!MODIFIER_KEYS.has(key) ? [normalizeKey(key)] : [])].join('+')

  if (MODIFIER_KEYS.has(key)) {
    return { value: null, preview: modifiers.join('+') }
  }

  return {
    value: [...modifiers, normalizeKey(key)].join('+'),
    preview,
  }
}



function RowToggle({
  checked,
  onChange,
  label,
  accent,
  background,
  border,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  accent: string
  background: string
  border: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="relative h-5 w-9 rounded-full transition-colors"
      style={{
        background: checked ? accent : background,
        border: `1px solid ${checked ? accent : border}`,
      }}
    >
      <span
        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all"
        style={{
          left: checked ? 18 : 2,
          background: '#fff',
        }}
      />
    </button>
  )
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div className="px-2 pb-1 pt-4 text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color }}>
      {label}
    </div>
  )
}

type SettingsTab = 'general' | 'shortcuts' | 'about'

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Gear size={14} /> },
  { id: 'shortcuts', label: 'Shortcuts', icon: <Command size={14} /> },
  { id: 'about', label: 'About', icon: <Info size={14} /> },
]

const KEYBINDING_SECTIONS: { label: string; actions: KeybindingAction[] }[] = [
  {
    label: 'Tabs',
    actions: ['tab.1', 'tab.2', 'tab.3', 'tab.4', 'tab.5', 'tab.6', 'tab.7', 'tab.8', 'tab.9', 'tab.new', 'tab.close', 'tab.prev', 'tab.next'],
  },
  {
    label: 'Chord Shortcuts',
    actions: ['chord.prefix', 'chord.reasoning', 'chord.model'],
  },
  {
    label: 'Pickers',
    actions: ['picker.history', 'picker.down', 'picker.up', 'picker.confirm', 'picker.cancel'],
  },
  {
    label: 'Actions',
    actions: ['action.send', 'action.clear', 'action.focus', 'action.hide', 'action.toggleExpand'],
  },
]

export default function SettingsPage() {
  const colors = useColors()
  const themeMode = useThemeStore((s) => s.themeMode)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)
  const soundEnabled = useThemeStore((s) => s.soundEnabled)
  const setSoundEnabled = useThemeStore((s) => s.setSoundEnabled)
  const showReasoningStream = useThemeStore((s) => s.showReasoningStream)
  const setShowReasoningStream = useThemeStore((s) => s.setShowReasoningStream)
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const setExpandedUI = useThemeStore((s) => s.setExpandedUI)
  const overlayOpacity = useThemeStore((s) => s.overlayOpacity)
  const setOverlayOpacity = useThemeStore((s) => s.setOverlayOpacity)
  const fontFamily = useThemeStore((s) => s.fontFamily)
  const setFontFamily = useThemeStore((s) => s.setFontFamily)


  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [appSettings, setAppSettings] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS })

  useEffect(() => {
    window.oco.getAppSettings().then((raw) => {
      setAppSettings((prev) => ({ ...prev, ...raw } as AppSettings))
    }).catch(() => {})
  }, [])

  const updateAppSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setAppSettings((prev) => {
      const next = { ...prev, [key]: value }
      window.oco.getAppSettings().then((current) => {
        window.oco.setAppSettings({ ...current, ...next })
      }).catch(() => {})
      return next
    })
  }

  const shortcutSettings = useSessionStore((s) => s.shortcutSettings)
  const shortcutSettingsSaving = useSessionStore((s) => s.shortcutSettingsSaving)
  const shortcutSettingsError = useSessionStore((s) => s.shortcutSettingsError)
  const loadShortcutSettings = useSessionStore((s) => s.loadShortcutSettings)
  const saveShortcutSettings = useSessionStore((s) => s.saveShortcutSettings)

  const [primaryShortcut, setPrimaryShortcut] = useState(DEFAULT_SHORTCUT_SETTINGS.primaryShortcut || '')
  const [secondaryShortcut, setSecondaryShortcut] = useState(DEFAULT_SHORTCUT_SETTINGS.secondaryShortcut || '')
  const [recordingTarget, setRecordingTarget] = useState<'primary' | 'secondary' | null>(null)
  const [recordingPreview, setRecordingPreview] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!shortcutSettings) {
      void loadShortcutSettings()
    }
  }, [shortcutSettings, loadShortcutSettings])

  useEffect(() => {
    if (!shortcutSettings) return
    setPrimaryShortcut(shortcutSettings.primaryShortcut || '')
    setSecondaryShortcut(shortcutSettings.secondaryShortcut || '')
  }, [shortcutSettings])

  const stopRecording = () => {
    setRecordingTarget(null)
    setRecordingPreview('')
  }

  const handleRecorderKeyDown = (target: 'primary' | 'secondary') => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setSaveMessage(null)

    if (e.key === 'Escape') {
      stopRecording()
      return
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (target === 'primary') setPrimaryShortcut('')
      else setSecondaryShortcut('')
      stopRecording()
      return
    }

    const { value, preview } = eventToShortcut(e)
    setRecordingPreview(preview)
    if (!value) return

    if (target === 'primary') setPrimaryShortcut(value)
    else setSecondaryShortcut(value)
    stopRecording()
  }

  const handleSaveShortcuts = async () => {
    setSaveMessage(null)
    const ok = await saveShortcutSettings({
      primaryShortcut: primaryShortcut.trim() || null,
      secondaryShortcut: secondaryShortcut.trim() || null,
    })
    if (ok) setSaveMessage('Shortcuts saved.')
  }

  const shortcutControl = (
    value: string,
    setValue: (next: string) => void,
    target: 'primary' | 'secondary',
    placeholder: string,
  ) => {
    const isRecording = recordingTarget === target

    return (
      <div className="flex items-center gap-2 min-w-[280px]">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaveMessage(null)
          }}
          placeholder={isRecording ? 'Press shortcut...' : placeholder}
          className="h-8 min-w-0 flex-1 rounded-md px-2 text-[10px] outline-none"
          style={{
            background: colors.surfacePrimary,
            color: value ? colors.textPrimary : colors.textTertiary,
            border: `1px solid ${isRecording ? colors.accent : colors.containerBorder}`,
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (isRecording) {
              stopRecording()
            } else {
              setRecordingTarget(target)
              setRecordingPreview('')
              setSaveMessage(null)
            }
          }}
          onBlur={() => {
            if (recordingTarget === target) stopRecording()
          }}
          onKeyDown={handleRecorderKeyDown(target)}
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{
            background: isRecording ? colors.accent : colors.surfacePrimary,
            color: isRecording ? '#fff' : colors.textSecondary,
            border: `1px solid ${isRecording ? colors.accent : colors.containerBorder}`,
          }}
          title={isRecording ? 'Stop recording' : 'Record shortcut'}
          aria-label={isRecording ? 'Stop recording shortcut' : 'Record shortcut'}
        >
          <Target size={14} weight={isRecording ? 'fill' : 'bold'} />
        </button>
        <button
          type="button"
          onClick={() => {
            setValue('')
            setSaveMessage(null)
            if (recordingTarget === target) stopRecording()
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{
            background: colors.surfacePrimary,
            color: colors.textSecondary,
            border: `1px solid ${colors.containerBorder}`,
            opacity: value ? 1 : 0.55,
          }}
          title="Clear shortcut"
          aria-label="Clear shortcut"
        >
          <X size={14} weight="bold" />
        </button>
    </div>
  )
}

function VoiceKeyRow({ currentKey, disabled, onChange, colors, rowClassName, rowBaseStyle }: {
  currentKey: string
  disabled: boolean
  onChange: (key: string) => void
  colors: ReturnType<typeof useColors>
  rowClassName: string
  rowBaseStyle: React.CSSProperties
}) {
  const [listening, setListening] = React.useState(false)

  React.useEffect(() => {
    if (!listening) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const parts: string[] = []
      if (e.metaKey) parts.push('Meta')
      if (e.ctrlKey) parts.push('Control')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      const modifiers = new Set(['Meta', 'Control', 'Alt', 'Shift'])
      if (modifiers.has(e.key)) {
        onChange(e.key)
      } else {
        if (e.key === ' ') parts.push('Space')
        else if (e.key.length === 1) parts.push(e.key.toUpperCase())
        else parts.push(e.key)
        onChange(parts.join('+'))
      }
      setListening(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [listening, onChange])

  const displayKey = currentKey
    .replace('Meta', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace('Space', '␣')

  return (
    <div className={rowClassName} style={rowBaseStyle}>
      <div className="flex items-center gap-3">
        <Keyboard size={16} style={{ color: colors.textTertiary }} />
        <span className="text-[11px]">Voice Shortcut</span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setListening(true)}
        className="h-7 rounded-md px-3 text-[10px] font-mono"
        style={{
          background: listening ? colors.accent : colors.surfacePrimary,
          color: listening ? colors.textOnAccent : colors.textPrimary,
          border: `1px solid ${listening ? colors.accent : colors.containerBorder}`,
          opacity: disabled ? 0.4 : 1,
          minWidth: 60,
        }}
      >
        {listening ? 'Press a key...' : displayKey}
      </button>
    </div>
  )
}

function VoiceInputRow({ enabled, voiceKey, onChange, colors, rowClassName, rowBaseStyle }: {
  enabled: boolean
  voiceKey: string
  onChange: (v: boolean) => void
  colors: ReturnType<typeof useColors>
  rowClassName: string
  rowBaseStyle: React.CSSProperties
}) {
  const [whisperStatus, setWhisperStatus] = React.useState<'checking' | 'found' | 'missing'>('checking')
  const [whisperBackend, setWhisperBackend] = React.useState('')

  React.useEffect(() => {
    const check = async () => {
      try {
        const result = await window.oco.transcribeAudio('', '')
        if (result.error?.includes('not found') || result.error?.includes('not detected')) {
          setWhisperStatus('missing')
          setWhisperBackend(result.error)
        } else {
          setWhisperStatus('found')
        }
      } catch {
        setWhisperStatus('missing')
      }
    }
    void check()
  }, [])

  const displayKey = voiceKey
    .replace('Meta', '⌘').replace('Control', '⌃')
    .replace('Alt', '⌥').replace('Shift', '⇧').replace('Space', '␣')

  return (
    <div className={rowClassName} style={rowBaseStyle}>
      <div className="flex items-center gap-3">
        <Microphone size={16} style={{ color: enabled ? colors.accent : colors.textTertiary }} />
        <div>
          <span className="text-[11px]">Voice Input</span>
          <div className="text-[9px]" style={{ color: colors.textTertiary }}>
            {whisperStatus === 'checking'
              ? 'Checking Whisper...'
              : whisperStatus === 'missing'
                ? 'Whisper not installed'
                : `Hold ${displayKey} or tap mic`}
          </div>
          {whisperStatus === 'missing' && (
            <div className="text-[9px] mt-0.5" style={{ color: '#f59e0b' }}>
              Install: brew install whisperkit-cli
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {whisperStatus === 'found' && (
          <span className="text-[9px]" style={{ color: '#4ade80' }}>●</span>
        )}
        {whisperStatus === 'missing' && (
          <span className="text-[9px]" style={{ color: '#f59e0b' }}>●</span>
        )}
        <RowToggle
          checked={enabled}
          onChange={onChange}
          label="Toggle voice input"
          accent={colors.accent}
          background={colors.surfaceSecondary}
          border={colors.containerBorder}
        />
      </div>
    </div>
  )
}

  const rowBaseStyle: React.CSSProperties = {
    minHeight: 44,
    borderBottom: `1px solid ${colors.containerBorder}`,
    background: 'transparent',
  }

  const rowClassName = 'group flex w-full items-center justify-between px-4 text-left transition-colors hover:bg-[var(--oco-surface-hover)]'

  const [keybindings, setKeybindings] = useState<KeybindingMap>({ ...DEFAULT_KEYBINDINGS })
  const [recordingKeybinding, setRecordingKeybinding] = useState<KeybindingAction | null>(null)
  const [keybindingPreview, setKeybindingPreview] = useState('')
  

  useEffect(() => {
    window.oco.getAppSettings().then((raw) => {
      if (raw.keybindings && typeof raw.keybindings === 'object') {
        setKeybindings((prev) => ({ ...prev, ...(raw.keybindings as Partial<KeybindingMap>) }))
      }
    }).catch(() => {})
  }, [])

  const handleKeybindingKeyDown = (action: KeybindingAction) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      setRecordingKeybinding(null)
      setKeybindingPreview('')
      return
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      setKeybindings((prev) => {
        const next = { ...prev, [action]: DEFAULT_KEYBINDINGS[action] }
        autoSaveKeybindings(next)
        return next
      })
      setRecordingKeybinding(null)
      setKeybindingPreview('')
      return
    }

    const { value, preview } = keybindingEventToString(e)
    setKeybindingPreview(preview)
    if (!value) return

    setKeybindings((prev) => {
      const next = { ...prev, [action]: value }
      autoSaveKeybindings(next)
      return next
    })
    setRecordingKeybinding(null)
    setKeybindingPreview('')
  }

  const autoSaveKeybindings = (kb: KeybindingMap) => {
    window.oco.getAppSettings().then((current) => {
      window.oco.setAppSettings({ ...current, keybindings: kb })
    }).catch(() => {})
  }

  const handleResetKeybindings = () => {
    const defaults = { ...DEFAULT_KEYBINDINGS }
    setKeybindings(defaults)
    autoSaveKeybindings(defaults)
  }

  return (
    <div className="flex h-full flex-col" style={{ background: colors.containerBg, color: colors.textPrimary }}>
      <div className="drag-region h-10 w-full shrink-0" />

      <div className="flex items-center gap-1 px-6 pb-2" style={{ borderBottom: `1px solid ${colors.containerBorder}` }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors"
            style={{
              background: activeTab === tab.id ? colors.accentSoft : 'transparent',
              color: activeTab === tab.id ? colors.accent : colors.textTertiary,
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[480px] px-4 pb-8">

          {activeTab === 'general' && (
            <>
              <SectionHeader label="Defaults" color={colors.textTertiary} />
              <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${colors.containerBorder}`, background: colors.surfacePrimary }}>
                <div className={rowClassName} style={rowBaseStyle}>
                  <div className="flex items-center gap-3">
                    <Brain size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Default Model</span>
                  </div>
                  <select
                    value={appSettings.defaultModel}
                    onChange={(e) => updateAppSetting('defaultModel', e.target.value)}
                    className="h-7 rounded-md px-2 text-[10px] outline-none"
                    style={{ minWidth: 120, background: colors.surfacePrimary, color: colors.textPrimary, border: `1px solid ${colors.containerBorder}` }}
                  >
                    {useSessionStore.getState().availableModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div className={rowClassName} style={rowBaseStyle}>
                  <div className="flex items-center gap-3">
                    <Brain size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Reasoning Level</span>
                  </div>
                  <select
                    value={appSettings.defaultReasoning}
                    onChange={(e) => updateAppSetting('defaultReasoning', e.target.value)}
                    className="h-7 rounded-md px-2 text-[10px] outline-none"
                    style={{ minWidth: 120, background: colors.surfacePrimary, color: colors.textPrimary, border: `1px solid ${colors.containerBorder}` }}
                  >
                    {getReasoningLevelsForModel({
                      availableModels: useSessionStore.getState().availableModels,
                      preferredModel: appSettings.defaultModel,
                    }).map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div className={rowClassName} style={{ ...rowBaseStyle, borderBottom: 'none' }}>
                  <div className="flex items-center gap-3">
                    <FolderOpen size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Default Directory</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[180px] truncate text-[10px]" style={{ color: colors.textSecondary }}>
                      {appSettings.defaultDirectory}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const dir = await window.oco.selectDirectory()
                        if (dir) updateAppSetting('defaultDirectory', dir)
                      }}
                      className="h-7 rounded-md px-2 text-[10px]"
                      style={{ background: colors.surfacePrimary, color: colors.textSecondary, border: `1px solid ${colors.containerBorder}` }}
                    >
                      Browse
                    </button>
                   </div>
                </div>

                <VoiceInputRow
                  enabled={appSettings.micEnabled}
                  voiceKey={appSettings.voiceKey || 'Alt'}
                  onChange={(v) => updateAppSetting('micEnabled', v)}
                  colors={colors}
                  rowClassName={rowClassName}
                  rowBaseStyle={rowBaseStyle}
                />

                <div className={rowClassName} style={rowBaseStyle}>
                  <div className="flex items-center gap-3">
                    <span className="w-4 text-center text-[12px]" style={{ color: colors.textTertiary }}>あ</span>
                    <span className="text-[11px]">Voice Language</span>
                  </div>
                  <select
                    value={appSettings.voiceLanguage}
                    onChange={(e) => updateAppSetting('voiceLanguage', e.target.value)}
                    disabled={!appSettings.micEnabled}
                    className="h-7 rounded-md px-2 text-[10px] outline-none"
                    style={{ minWidth: 120, background: colors.surfacePrimary, color: colors.textPrimary, border: `1px solid ${colors.containerBorder}`, opacity: appSettings.micEnabled ? 1 : 0.4 }}
                  >
                    {VOICE_LANGUAGES.map((lang) => (
                      <option key={lang.id} value={lang.id}>{lang.label}</option>
                    ))}
                  </select>
                </div>

                <VoiceKeyRow
                  currentKey={appSettings.voiceKey || 'Alt'}
                  disabled={!appSettings.micEnabled}
                  onChange={(key) => updateAppSetting('voiceKey', key)}
                  colors={colors}
                  rowClassName={rowClassName}
                  rowBaseStyle={{ ...rowBaseStyle, borderBottom: 'none' }}
                />

                {/* YOLO Mode toggle — hidden until upstream bug is resolved.
                   * app-server ignores sandbox params at tool execution level.
                   * See: https://github.com/openai/codex/issues/14068
                   * The underlying code (RunOptions.yoloMode, run-manager sandbox selection)
                   * is kept intact so this can be re-enabled once the fix lands.
                   *
                <div className={rowClassName} style={{ ...rowBaseStyle, borderBottom: 'none' }}>
                  <div className="flex items-center gap-3">
                    <Lightning size={16} weight="fill" style={{ color: appSettings.yoloMode ? '#f59e0b' : colors.textTertiary }} />
                    <div>
                      <span className="text-[11px]">YOLO Mode</span>
                      <div className="text-[9px]" style={{ color: colors.textTertiary }}>Bypass all approvals & sandbox</div>
                    </div>
                  </div>
                  <RowToggle
                    checked={appSettings.yoloMode}
                    onChange={(v) => {
                      updateAppSetting('yoloMode', v)
                      setTimeout(() => window.oco.relaunch(), 300)
                    }}
                    label="Toggle YOLO mode"
                    accent="#f59e0b"
                    background={colors.surfaceSecondary}
                    border={colors.containerBorder}
                  />
                </div>
                */}
              </div>

              <SectionHeader label="Appearance" color={colors.textTertiary} />
              <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${colors.containerBorder}`, background: colors.surfacePrimary }}>
                <div className={rowClassName} style={rowBaseStyle}>
                  <div className="flex items-center gap-3">
                    <MoonStars size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Theme</span>
                  </div>
                  <select
                    value={themeMode}
                    onChange={(e) => setThemeMode(e.target.value as 'system' | 'light' | 'dark')}
                    className="h-7 rounded-md px-2 text-[10px] outline-none"
                    style={{ minWidth: 120, background: colors.surfacePrimary, color: colors.textPrimary, border: `1px solid ${colors.containerBorder}` }}
                  >
                    <option value="system">System</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>

                <div className={rowClassName} style={rowBaseStyle}>
                  <div className="flex items-center gap-3">
                    <Bell size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Notification Sound</span>
                  </div>
                  <RowToggle checked={soundEnabled} onChange={setSoundEnabled} label="Toggle notification sound" accent={colors.accent} background={colors.surfaceSecondary} border={colors.containerBorder} />
                </div>

                <div className={rowClassName} style={rowBaseStyle}>
                  <div className="flex items-center gap-3">
                    <Brain size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Show Thinking</span>
                  </div>
                  <RowToggle checked={showReasoningStream} onChange={setShowReasoningStream} label="Toggle streamed model thinking" accent={colors.accent} background={colors.surfaceSecondary} border={colors.containerBorder} />
                </div>

                <div className={rowClassName} style={rowBaseStyle}>
                  <div className="flex items-center gap-3">
                    <ArrowsOutSimple size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Full Width</span>
                  </div>
                  <RowToggle checked={expandedUI} onChange={setExpandedUI} label="Toggle full width" accent={colors.accent} background={colors.surfaceSecondary} border={colors.containerBorder} />
                </div>

                <div className={rowClassName} style={rowBaseStyle}>
                  <div className="flex items-center gap-3">
                    <Crosshair size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Remember Position</span>
                  </div>
                  <RowToggle checked={appSettings.rememberPosition} onChange={(v) => updateAppSetting('rememberPosition', v)} label="Toggle remember position" accent={colors.accent} background={colors.surfaceSecondary} border={colors.containerBorder} />
                </div>

                <div className={rowClassName} style={rowBaseStyle}>
                  <div className="flex items-center gap-3">
                    <Keyboard size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Font</span>
                  </div>
                  <select
                    value={FONT_PRESETS.find((f) => f.value === fontFamily)?.id || 'system'}
                    onChange={(e) => {
                      const preset = FONT_PRESETS.find((f) => f.id === e.target.value)
                      if (preset) setFontFamily(preset.value)
                    }}
                    className="h-7 rounded-md px-2 text-[10px] outline-none"
                    style={{ minWidth: 140, background: colors.surfacePrimary, color: colors.textPrimary, border: `1px solid ${colors.containerBorder}` }}
                  >
                    {FONT_PRESETS.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div className={rowClassName} style={{ ...rowBaseStyle, borderBottom: 'none' }}>
                  <div className="flex items-center gap-3">
                    <Drop size={16} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Overlay Opacity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.3}
                      max={1}
                      step={0.01}
                      value={overlayOpacity}
                      onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                      className="h-1 w-24 cursor-pointer accent-[var(--oco-accent)]"
                    />
                    <span className="w-8 text-right text-[10px]" style={{ color: colors.textSecondary }}>
                      {Math.round(overlayOpacity * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              <SectionHeader label="Global Shortcuts" color={colors.textTertiary} />
              <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${colors.containerBorder}`, background: colors.surfacePrimary }}>
                <div className={rowClassName} style={{ ...rowBaseStyle, minHeight: 56 }}>
                  <div className="flex items-center gap-3">
                    <Keyboard size={18} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Primary Shortcut</span>
                  </div>
                  {shortcutControl(primaryShortcut, setPrimaryShortcut, 'primary', 'Alt+Space')}
                </div>

                <div className={rowClassName} style={{ ...rowBaseStyle, minHeight: 56, borderBottom: 'none' }}>
                  <div className="flex items-center gap-3">
                    <Keyboard size={18} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Secondary Shortcut</span>
                  </div>
                  {shortcutControl(secondaryShortcut, setSecondaryShortcut, 'secondary', 'CommandOrControl+Shift+K')}
                </div>
              </div>

              {recordingTarget && recordingPreview && (
                <div className="mt-2 text-[9px]" style={{ color: colors.accent }}>
                  {recordingPreview}
                </div>
              )}
              {shortcutSettingsError && (
                <div className="mt-2 text-[9px]" style={{ color: colors.statusError }}>
                  {shortcutSettingsError}
                </div>
              )}
              {!shortcutSettingsError && saveMessage && (
                <div className="mt-2 text-[9px]" style={{ color: colors.accent }}>
                  {saveMessage}
                </div>
              )}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveShortcuts}
                  disabled={shortcutSettingsSaving}
                  className="h-8 rounded-md px-3 text-[10px] font-medium"
                  style={{ background: colors.accent, color: '#fff', opacity: shortcutSettingsSaving ? 0.65 : 1 }}
                >
                  {shortcutSettingsSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrimaryShortcut(DEFAULT_SHORTCUT_SETTINGS.primaryShortcut || '')
                    setSecondaryShortcut(DEFAULT_SHORTCUT_SETTINGS.secondaryShortcut || '')
                    setSaveMessage(null)
                  }}
                  className="h-8 rounded-md px-3 text-[10px] font-medium"
                  style={{ background: colors.surfacePrimary, color: colors.textSecondary, border: `1px solid ${colors.containerBorder}` }}
                >
                  Reset
                </button>
              </div>
            </>
          )}

          {activeTab === 'shortcuts' && (
            <>
              {KEYBINDING_SECTIONS.map((section) => (
                <React.Fragment key={section.label}>
                  <SectionHeader label={section.label} color={colors.textTertiary} />
                  <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${colors.containerBorder}`, background: colors.surfacePrimary }}>
                    {section.actions.map((action, idx) => {
                      const isLast = idx === section.actions.length - 1
                      const isRecording = recordingKeybinding === action
                      const currentValue = keybindings[action]
                      const displayValue = isRecording && keybindingPreview ? keybindingPreview : formatShortcutLabel(currentValue)

                      return (
                        <div
                          key={action}
                          className={rowClassName}
                          style={{ ...rowBaseStyle, minHeight: 40, borderBottom: isLast ? 'none' : rowBaseStyle.borderBottom }}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Keyboard size={14} style={{ color: colors.textTertiary, flexShrink: 0 }} />
                            <span className="text-[11px] truncate">{KEYBINDING_LABELS[action]}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (isRecording) {
                                  setRecordingKeybinding(null)
                                  setKeybindingPreview('')
                                } else {
                                  setRecordingKeybinding(action)
                                  setKeybindingPreview('')
                                }
                              }}
                              onBlur={() => {
                                if (recordingKeybinding === action) {
                                  setRecordingKeybinding(null)
                                  setKeybindingPreview('')
                                }
                              }}
                              onKeyDown={handleKeybindingKeyDown(action)}
                              className="flex h-7 items-center rounded-md px-2.5 text-[10px] font-mono"
                              style={{
                                background: isRecording ? colors.accent : colors.surfacePrimary,
                                color: isRecording ? '#fff' : colors.textSecondary,
                                border: `1px solid ${isRecording ? colors.accent : colors.containerBorder}`,
                                minWidth: 60,
                                justifyContent: 'center',
                              }}
                            >
                              {isRecording ? (keybindingPreview || '...') : displayValue}
                            </button>
                            {currentValue !== DEFAULT_KEYBINDINGS[action] && (
                              <button
                                type="button"
                                onClick={() => {
                                  setKeybindings((prev) => ({ ...prev, [action]: DEFAULT_KEYBINDINGS[action] }))
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-md"
                                style={{ background: colors.surfacePrimary, color: colors.textTertiary, border: `1px solid ${colors.containerBorder}` }}
                                title="Reset to default"
                                aria-label="Reset to default"
                              >
                                <X size={10} weight="bold" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </React.Fragment>
              ))}

              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleResetKeybindings}
                  className="h-8 rounded-md px-3 text-[10px] font-medium"
                  style={{ background: colors.surfacePrimary, color: colors.textSecondary, border: `1px solid ${colors.containerBorder}` }}
                >
                  Reset All
                </button>
              </div>
            </>
          )}

          {activeTab === 'about' && (
            <>
              <SectionHeader label="About" color={colors.textTertiary} />
              <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${colors.containerBorder}`, background: colors.surfacePrimary }}>
                <div className={rowClassName} style={{ ...rowBaseStyle, borderBottom: 'none' }}>
                  <div className="flex items-center gap-3">
                    <Info size={18} style={{ color: colors.textTertiary }} />
                    <span className="text-[11px]">Version</span>
                  </div>
                  <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                    2026.03.20
                  </span>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
