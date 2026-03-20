import { create } from 'zustand'
import type {
  TabStatus,
  NormalizedEvent,
  EnrichedError,
  Message,
  TabState,
  Attachment,
  ShortcutSettings,
  ModelInfo,
} from '../../shared/types'
import { useThemeStore } from '../theme'
import notificationSrc from '../../../resources/notification.mp3'

const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'gpt-5.4', label: 'GPT-5.4', description: '', hidden: false, isDefault: true, supportedReasoningEfforts: ['low', 'medium', 'high'], defaultReasoningEffort: 'medium' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', description: '', hidden: false, isDefault: false, supportedReasoningEfforts: ['low', 'medium', 'high'], defaultReasoningEffort: 'medium' },
  { id: 'o3', label: 'o3', description: '', hidden: false, isDefault: false, supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'], defaultReasoningEffort: 'medium' },
  { id: 'o4-mini', label: 'o4-mini', description: '', hidden: false, isDefault: false, supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'], defaultReasoningEffort: 'medium' },
]

export const REASONING_LEVELS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Med' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'XHigh' },
] as const

interface StaticInfo {
  version: string
  projectPath: string
  homePath: string
}

interface State {
  tabs: TabState[]
  activeTabId: string
  isExpanded: boolean
  staticInfo: StaticInfo | null
  preferredModel: string | null
  preferredReasoning: string | null
  yoloMode: boolean
  micEnabled: boolean
  voiceLanguage: string
  voiceKey: string
  shortcutSettings: ShortcutSettings | null
  shortcutSettingsSaving: boolean
  shortcutSettingsError: string | null
  availableModels: ModelInfo[]
  initStaticInfo: () => Promise<void>
  fetchModels: () => Promise<void>
  loadShortcutSettings: () => Promise<void>
  saveShortcutSettings: (settings: ShortcutSettings) => Promise<boolean>
  setPreferredModel: (model: string | null) => void
  setPreferredReasoning: (level: string | null) => void
  createTab: () => Promise<string>
  selectTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  clearTab: () => void
  toggleExpanded: () => void
  resumeSession: (sessionId: string, title?: string, projectPath?: string) => Promise<string>
  addSystemMessage: (content: string) => void
  sendMessage: (prompt: string, projectPath?: string) => void
  addDirectory: (dir: string) => void
  removeDirectory: (dir: string) => void
  setBaseDirectory: (dir: string) => void
  addAttachments: (attachments: Attachment[]) => void
  removeAttachment: (attachmentId: string) => void
  clearAttachments: () => void
  handleNormalizedEvent: (tabId: string, event: NormalizedEvent) => void
  handleStatusChange: (tabId: string, newStatus: string, oldStatus: string) => void
  handleError: (tabId: string, error: EnrichedError) => void
}

let msgCounter = 0
const nextMsgId = () => `msg-${++msgCounter}`

const notificationAudio = new Audio(notificationSrc)
notificationAudio.volume = 1.0

const SHORTCUT_SETTINGS_KEY = 'oco-shortcut-settings'

function normalizeShortcutValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readShortcutSettingsCache(): ShortcutSettings | null {
  try {
    const raw = localStorage.getItem(SHORTCUT_SETTINGS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      primaryShortcut: normalizeShortcutValue(parsed.primaryShortcut),
      secondaryShortcut: normalizeShortcutValue(parsed.secondaryShortcut),
    }
  } catch {
    return null
  }
}

function writeShortcutSettingsCache(settings: ShortcutSettings): void {
  try {
    localStorage.setItem(SHORTCUT_SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}

async function playNotificationIfHidden(): Promise<void> {
  if (!useThemeStore.getState().soundEnabled) return
  try {
    const visible = await window.oco.isVisible()
    if (!visible) {
      notificationAudio.currentTime = 0
      notificationAudio.play().catch(() => {})
    }
  } catch {}
}

function makeLocalTab(): TabState {
  return {
    id: crypto.randomUUID(),
    sessionId: null,
    status: 'idle',
    activeRequestId: null,
    hasUnread: false,
    currentActivity: '',
    attachments: [],
    messages: [],
    title: 'New Tab',
    lastResult: null,
    sessionModel: null,
    sessionTools: [],
    sessionVersion: null,
    queuedPrompts: [],
    workingDirectory: '~',
    hasChosenDirectory: false,
    additionalDirs: [],
  }
}

const initialTab = makeLocalTab()
const cachedShortcutSettings = readShortcutSettingsCache()

function applyAppSettings(raw: Record<string, unknown>): void {
  const model = typeof raw.defaultModel === 'string' ? raw.defaultModel : null
  const reasoning = typeof raw.defaultReasoning === 'string' ? raw.defaultReasoning : null
  const yoloMode = raw.yoloMode === true
  const micEnabled = raw.micEnabled !== false
  const voiceLanguage = typeof raw.voiceLanguage === 'string' ? raw.voiceLanguage : ''
  const voiceKey = typeof raw.voiceKey === 'string' ? raw.voiceKey : 'Alt'
  useSessionStore.setState({ preferredModel: model, preferredReasoning: reasoning, yoloMode, micEnabled, voiceLanguage, voiceKey })
}

export function initSessionDefaults(): void {
  if (!window.oco?.getAppSettings) return
  window.oco.getAppSettings().then(applyAppSettings).catch(() => {})
  if (window.oco.onAppSettingsChanged) {
    window.oco.onAppSettingsChanged(applyAppSettings)
  }
  useSessionStore.getState().fetchModels()
}

export const useSessionStore = create<State>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  isExpanded: false,
  staticInfo: null,
  preferredModel: null,
  preferredReasoning: null,
  yoloMode: true,
  micEnabled: true,
  voiceLanguage: '',
  voiceKey: 'Alt',
  shortcutSettings: cachedShortcutSettings,
  shortcutSettingsSaving: false,
  shortcutSettingsError: null,
  availableModels: FALLBACK_MODELS,

  fetchModels: async () => {
    try {
      const models = await window.oco.listModels()
      if (models.length > 0) set({ availableModels: models })
    } catch {}
  },

  initStaticInfo: async () => {
    try {
      const result = await window.oco.start()
      set({ staticInfo: { version: result.version || 'unknown', projectPath: result.projectPath || '~', homePath: result.homePath || '~' } })
    } catch {}
  },

  loadShortcutSettings: async () => {
    try {
      const settings = await window.oco.getShortcutSettings()
      writeShortcutSettingsCache(settings)
      set({ shortcutSettings: settings, shortcutSettingsError: null })
    } catch (err) {
      set({ shortcutSettingsError: err instanceof Error ? err.message : String(err) })
    }
  },

  saveShortcutSettings: async (settings) => {
    set({ shortcutSettingsSaving: true, shortcutSettingsError: null })
    try {
      const result = await window.oco.setShortcutSettings(settings)
      set({
        shortcutSettingsSaving: false,
        shortcutSettingsError: result.ok ? null : (result.error || 'Failed to update shortcuts'),
        shortcutSettings: result.settings,
      })
      writeShortcutSettingsCache(result.settings)
      return result.ok
    } catch (err) {
      set({ shortcutSettingsSaving: false, shortcutSettingsError: err instanceof Error ? err.message : String(err) })
      return false
    }
  },

  setPreferredModel: (model) => set({ preferredModel: model }),
  setPreferredReasoning: (level) => set({ preferredReasoning: level }),

  createTab: async () => {
    const homeDir = get().staticInfo?.homePath || '~'
    try {
      const { tabId } = await window.oco.createTab()
      const tab: TabState = { ...makeLocalTab(), id: tabId, workingDirectory: homeDir }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      return tabId
    } catch {
      const tab = makeLocalTab()
      tab.workingDirectory = homeDir
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
      return tab.id
    }
  },

  selectTab: (tabId) => {
    const s = get()
    if (tabId === s.activeTabId) {
      const willExpand = !s.isExpanded
      set((prev) => ({
        isExpanded: willExpand,
        tabs: willExpand ? prev.tabs.map((t) => t.id === tabId ? { ...t, hasUnread: false } : t) : prev.tabs,
      }))
    } else {
      set((prev) => ({
        activeTabId: tabId,
        tabs: prev.tabs.map((t) => t.id === tabId ? { ...t, hasUnread: false } : t),
      }))
    }
  },

  toggleExpanded: () => {
    const { activeTabId, isExpanded } = get()
    const willExpand = !isExpanded
    set((s) => ({
      isExpanded: willExpand,
      tabs: willExpand ? s.tabs.map((t) => t.id === activeTabId ? { ...t, hasUnread: false } : t) : s.tabs,
    }))
  },

  closeTab: (tabId) => {
    window.oco.closeTab(tabId).catch(() => {})
    const s = get()
    const remaining = s.tabs.filter((t) => t.id !== tabId)
    if (s.activeTabId === tabId) {
      if (remaining.length === 0) {
        const newTab = makeLocalTab()
        set({ tabs: [newTab], activeTabId: newTab.id })
        return
      }
      const closedIndex = s.tabs.findIndex((t) => t.id === tabId)
      const newActive = remaining[Math.min(closedIndex, remaining.length - 1)]
      set({ tabs: remaining, activeTabId: newActive.id })
    } else {
      set({ tabs: remaining })
    }
  },

  clearTab: () => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) => t.id === activeTabId ? { ...t, messages: [], lastResult: null, currentActivity: '', queuedPrompts: [] } : t),
    }))
  },

  resumeSession: async (sessionId, title, projectPath) => {
    const defaultDir = projectPath || get().staticInfo?.homePath || '~'
    try {
      const { tabId } = await window.oco.createTab()
      const history = await window.oco.loadSession(sessionId, defaultDir).catch(() => [])
      const messages: Message[] = history.map((m) => ({
        id: nextMsgId(),
        role: m.role as Message['role'],
        content: m.content,
        toolName: m.toolName,
        toolStatus: m.toolName ? 'completed' : undefined,
        timestamp: m.timestamp,
      }))
      const tab: TabState = { ...makeLocalTab(), id: tabId, sessionId, title: title || 'Resumed Session', workingDirectory: defaultDir, hasChosenDirectory: !!projectPath, messages }
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, isExpanded: true }))
      return tabId
    } catch {
      const tab = makeLocalTab()
      tab.sessionId = sessionId
      tab.title = title || 'Resumed Session'
      tab.workingDirectory = defaultDir
      tab.hasChosenDirectory = !!projectPath
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id, isExpanded: true }))
      return tab.id
    }
  },

  addSystemMessage: (content) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) => t.id === activeTabId ? { ...t, messages: [...t.messages, { id: nextMsgId(), role: 'system', content, timestamp: Date.now() }] } : t),
    }))
  },

  addDirectory: (dir) => {
    const { activeTabId } = get()
    set((s) => ({ tabs: s.tabs.map((t) => t.id === activeTabId ? { ...t, additionalDirs: t.additionalDirs.includes(dir) ? t.additionalDirs : [...t.additionalDirs, dir] } : t) }))
  },

  removeDirectory: (dir) => {
    const { activeTabId } = get()
    set((s) => ({ tabs: s.tabs.map((t) => t.id === activeTabId ? { ...t, additionalDirs: t.additionalDirs.filter((d) => d !== dir) } : t) }))
  },

  setBaseDirectory: (dir) => {
    const { activeTabId } = get()
    window.oco.resetTabSession(activeTabId)
    set((s) => ({
      tabs: s.tabs.map((t) => t.id === activeTabId ? { ...t, workingDirectory: dir, hasChosenDirectory: true, sessionId: null, additionalDirs: [] } : t),
    }))
  },

  addAttachments: (attachments) => {
    const { activeTabId } = get()
    set((s) => ({ tabs: s.tabs.map((t) => t.id === activeTabId ? { ...t, attachments: [...t.attachments, ...attachments] } : t) }))
  },

  removeAttachment: (attachmentId) => {
    const { activeTabId } = get()
    set((s) => ({ tabs: s.tabs.map((t) => t.id === activeTabId ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) } : t) }))
  },

  clearAttachments: () => {
    const { activeTabId } = get()
    set((s) => ({ tabs: s.tabs.map((t) => t.id === activeTabId ? { ...t, attachments: [] } : t) }))
  },

  sendMessage: (prompt, projectPath) => {
    const { activeTabId, tabs, staticInfo } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    const resolvedPath = projectPath || (tab?.hasChosenDirectory ? tab.workingDirectory : (staticInfo?.homePath || tab?.workingDirectory || '~'))
    if (!tab) return
    if (tab.status === 'connecting') return

    const isBusy = tab.status === 'running'
    const requestId = crypto.randomUUID()
    let fullPrompt = prompt
    if (tab.attachments.length > 0) {
      const attachmentCtx = tab.attachments.map((a) => `[Attached ${a.type}: ${a.path}]`).join('\n')
      fullPrompt = `${attachmentCtx}\n\n${prompt}`
    }

    const title = tab.messages.length === 0 ? (prompt.length > 30 ? `${prompt.substring(0, 27)}...` : prompt) : tab.title

    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== activeTabId) return t
        const normalizedTab = t.hasChosenDirectory ? t : { ...t, hasChosenDirectory: true, workingDirectory: resolvedPath }
        if (isBusy) {
          return { ...normalizedTab, title, attachments: [], queuedPrompts: [...normalizedTab.queuedPrompts, prompt] }
        }
        return {
          ...normalizedTab,
          status: 'connecting',
          activeRequestId: requestId,
          currentActivity: 'Starting...',
          title,
          attachments: [],
          messages: [...normalizedTab.messages, { id: nextMsgId(), role: 'user', content: prompt, timestamp: Date.now() }],
        }
      }),
    }))

    const { preferredModel, preferredReasoning, yoloMode } = get()
    window.oco.prompt(activeTabId, requestId, {
      prompt: fullPrompt,
      projectPath: resolvedPath,
      sessionId: tab.sessionId || undefined,
      model: preferredModel || undefined,
      reasoningEffort: preferredReasoning || undefined,
      autoApprove: true,
      yoloMode,
      addDirs: tab.additionalDirs.length > 0 ? tab.additionalDirs : undefined,
    }).catch((err: Error) => {
      get().handleError(activeTabId, { message: err.message, stderrTail: [], exitCode: null, elapsedMs: 0, toolCallCount: 0 })
    })
  },

  handleNormalizedEvent: (tabId, event) => {
    set((s) => {
      const tabs = s.tabs.map((tab) => {
        if (tab.id !== tabId) return tab
        const updated = { ...tab }
        switch (event.type) {
          case 'session_init':
            updated.sessionId = event.sessionId
            updated.sessionModel = event.model || null
            updated.sessionTools = event.tools
            updated.sessionVersion = event.version
            if (!event.isWarmup) {
              updated.status = 'running'
              updated.currentActivity = 'Thinking...'
              if (updated.queuedPrompts.length > 0) {
                const [nextPrompt, ...rest] = updated.queuedPrompts
                updated.queuedPrompts = rest
                updated.messages = [...updated.messages, { id: nextMsgId(), role: 'user', content: nextPrompt, timestamp: Date.now() }]
              }
            }
            break
          case 'text_chunk': {
            updated.currentActivity = 'Writing...'
            const lastMsg = updated.messages[updated.messages.length - 1]
            if (lastMsg?.role === 'assistant' && !lastMsg.toolName) {
              updated.messages = [...updated.messages.slice(0, -1), { ...lastMsg, content: lastMsg.content + event.text }]
            } else {
              updated.messages = [...updated.messages, { id: nextMsgId(), role: 'assistant', content: event.text, timestamp: Date.now() }]
            }
            break
          }
          case 'tool_call':
            updated.currentActivity = `Running ${event.toolName}...`
            updated.messages = [...updated.messages, { id: nextMsgId(), role: 'tool', content: '', toolName: event.toolName, toolInput: event.input || '', toolStatus: 'running', timestamp: Date.now() }]
            break
          case 'tool_call_update': {
            const msgs = [...updated.messages]
            const lastTool = [...msgs].reverse().find((m) => m.role === 'tool' && m.toolStatus === 'running')
            if (lastTool) lastTool.toolInput = (lastTool.toolInput || '') + event.partialInput
            updated.messages = msgs
            break
          }
          case 'tool_call_complete': {
            const msgs = [...updated.messages]
            const runningTool = [...msgs].reverse().find((m) => m.role === 'tool' && m.toolStatus === 'running')
            if (runningTool) runningTool.toolStatus = event.success === false ? 'error' : 'completed'
            updated.messages = msgs
            break
          }
          case 'task_complete':
            updated.status = 'completed'
            updated.activeRequestId = null
            updated.currentActivity = ''
            updated.lastResult = {
              totalCostUsd: event.costUsd,
              durationMs: event.durationMs,
              numTurns: event.numTurns,
              usage: event.usage,
              sessionId: updated.sessionId || event.sessionId,
            }
            if (tabId !== s.activeTabId || !s.isExpanded) updated.hasUnread = true
            playNotificationIfHidden()
            break
          case 'error':
            updated.status = 'failed'
            updated.activeRequestId = null
            updated.currentActivity = ''
            updated.messages = [...updated.messages, { id: nextMsgId(), role: 'system', content: `Error: ${event.message}`, timestamp: Date.now() }]
            break
          case 'session_dead':
            updated.status = 'dead'
            updated.activeRequestId = null
            updated.currentActivity = ''
            updated.messages = [...updated.messages, { id: nextMsgId(), role: 'system', content: `Session ended unexpectedly (exit ${event.exitCode})`, timestamp: Date.now() }]
            break
        }
        return updated
      })
      return { tabs }
    })
  },

  handleStatusChange: (tabId, newStatus) => {
    set((s) => ({ tabs: s.tabs.map((t) => t.id === tabId ? { ...t, status: newStatus as TabStatus, ...(newStatus === 'idle' ? { currentActivity: '' } : {}) } : t) }))
  },

  handleError: (tabId, error) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        const lastMsg = t.messages[t.messages.length - 1]
        const alreadyHasError = lastMsg?.role === 'system' && lastMsg.content.startsWith('Error:')
        return {
          ...t,
          status: 'failed',
          activeRequestId: null,
          currentActivity: '',
          messages: alreadyHasError
            ? t.messages
            : [...t.messages, { id: nextMsgId(), role: 'system', content: `Error: ${error.message}${error.stderrTail.length > 0 ? `\n\n${error.stderrTail.slice(-5).join('\n')}` : ''}`, timestamp: Date.now() }],
        }
      }),
    }))
  },
}))

if (typeof window !== 'undefined') {
  const globalWindow = window as Window & { __ocoShortcutStorageSyncBound?: boolean }
  if (!globalWindow.__ocoShortcutStorageSyncBound) {
    globalWindow.__ocoShortcutStorageSyncBound = true
    window.addEventListener('storage', (event) => {
      if (event.key !== SHORTCUT_SETTINGS_KEY || !event.newValue) return
      const settings = readShortcutSettingsCache()
      if (!settings) return
      useSessionStore.setState({ shortcutSettings: settings, shortcutSettingsError: null })
    })
  }
}
