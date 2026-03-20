export interface CodexUsage {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
}

export type TabStatus = 'connecting' | 'idle' | 'running' | 'completed' | 'failed' | 'dead'

export interface Attachment {
  id: string
  type: 'image' | 'file'
  name: string
  path: string
  mimeType?: string
  dataUrl?: string
  size?: number
}

export interface TabState {
  id: string
  sessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  hasUnread: boolean
  currentActivity: string
  attachments: Attachment[]
  messages: Message[]
  title: string
  lastResult: RunResult | null
  sessionModel: string | null
  sessionTools: string[]
  sessionVersion: string | null
  queuedPrompts: string[]
  workingDirectory: string
  hasChosenDirectory: boolean
  additionalDirs: string[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolName?: string
  toolInput?: string
  toolStatus?: 'running' | 'completed' | 'error'
  timestamp: number
}

export interface RunResult {
  totalCostUsd: number
  durationMs: number
  numTurns: number
  usage: CodexUsage
  sessionId: string
}

export type NormalizedEvent =
  | { type: 'session_init'; sessionId: string; tools: string[]; model: string; version: string; isWarmup?: boolean }
  | { type: 'text_chunk'; text: string }
  | { type: 'tool_call'; toolName: string; toolId: string; index: number; input?: string }
  | { type: 'tool_call_update'; toolId: string; partialInput: string }
  | { type: 'tool_call_complete'; index: number; toolId?: string; success?: boolean }
  | { type: 'task_complete'; result: string; costUsd: number; durationMs: number; numTurns: number; usage: CodexUsage; sessionId: string }
  | { type: 'error'; message: string; isError: boolean; sessionId?: string }
  | { type: 'session_dead'; exitCode: number | null; signal: string | null; stderrTail: string[] }

export interface RunOptions {
  prompt: string
  projectPath: string
  sessionId?: string
  model?: string
  reasoningEffort?: string
  autoApprove?: boolean
  yoloMode?: boolean
  addDirs?: string[]
}

export interface TabRegistryEntry {
  tabId: string
  sessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  runPid: number | null
  createdAt: number
  lastActivityAt: number
  promptCount: number
}

export interface HealthReport {
  tabs: Array<{
    tabId: string
    status: TabStatus
    activeRequestId: string | null
    sessionId: string | null
    alive: boolean
  }>
  queueDepth: number
}

export interface EnrichedError {
  message: string
  stderrTail: string[]
  stdoutTail?: string[]
  exitCode: number | null
  elapsedMs: number
  toolCallCount: number
}

export interface SessionMeta {
  sessionId: string
  slug: string | null
  firstMessage: string | null
  lastTimestamp: string
  size: number
}

export interface SessionLoadMessage {
  role: string
  content: string
  toolName?: string
  timestamp: number
}

export interface ShortcutSettings {
  primaryShortcut: string | null
  secondaryShortcut: string | null
}

export interface ShortcutSettingsUpdateResult {
  ok: boolean
  settings: ShortcutSettings
  error?: string
}

export const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
  primaryShortcut: 'Alt+Space',
  secondaryShortcut: 'CommandOrControl+Shift+K',
}

export interface KeybindingMap {
  'tab.1': string
  'tab.2': string
  'tab.3': string
  'tab.4': string
  'tab.5': string
  'tab.6': string
  'tab.7': string
  'tab.8': string
  'tab.9': string

  'tab.new': string
  'tab.close': string
  'tab.prev': string
  'tab.next': string

  'chord.prefix': string
  'chord.reasoning': string
  'chord.model': string

  'picker.history': string
  'picker.down': string
  'picker.up': string
  'picker.confirm': string
  'picker.cancel': string

  'action.send': string
  'action.clear': string
  'action.focus': string
  'action.hide': string
  'action.toggleExpand': string
  'action.voiceInput': string
}

export type KeybindingAction = keyof KeybindingMap

export const DEFAULT_KEYBINDINGS: KeybindingMap = {
  'tab.1': 'Meta+1',
  'tab.2': 'Meta+2',
  'tab.3': 'Meta+3',
  'tab.4': 'Meta+4',
  'tab.5': 'Meta+5',
  'tab.6': 'Meta+6',
  'tab.7': 'Meta+7',
  'tab.8': 'Meta+8',
  'tab.9': 'Meta+9',

  'tab.new': 'Meta+T',
  'tab.close': 'Meta+W',
  'tab.prev': 'Meta+[',
  'tab.next': 'Meta+]',

  'chord.prefix': 'Control+X',
  'chord.reasoning': 'T',
  'chord.model': 'M',

  'picker.history': 'Control+H',
  'picker.down': 'Control+N',
  'picker.up': 'Control+P',
  'picker.confirm': 'Enter',
  'picker.cancel': 'Escape',

  'action.send': 'Enter',
  'action.clear': 'Meta+K',
  'action.focus': 'Meta+L',
  'action.hide': 'Escape',
  'action.toggleExpand': 'Meta+E',
  'action.voiceInput': 'Alt',
}

export const KEYBINDING_LABELS: Record<KeybindingAction, string> = {
  'tab.1': 'Switch to Tab 1',
  'tab.2': 'Switch to Tab 2',
  'tab.3': 'Switch to Tab 3',
  'tab.4': 'Switch to Tab 4',
  'tab.5': 'Switch to Tab 5',
  'tab.6': 'Switch to Tab 6',
  'tab.7': 'Switch to Tab 7',
  'tab.8': 'Switch to Tab 8',
  'tab.9': 'Switch to Tab 9',

  'tab.new': 'New Tab',
  'tab.close': 'Close Tab',
  'tab.prev': 'Previous Tab',
  'tab.next': 'Next Tab',

  'chord.prefix': 'Chord Prefix',
  'chord.reasoning': 'Switch Reasoning (after chord)',
  'chord.model': 'Switch Model (after chord)',

  'picker.history': 'Open History',
  'picker.down': 'Selection Down',
  'picker.up': 'Selection Up',
  'picker.confirm': 'Confirm Selection',
  'picker.cancel': 'Cancel / Close',

  'action.send': 'Send Message',
  'action.clear': 'Clear Conversation',
  'action.focus': 'Focus Input',
  'action.hide': 'Hide Window',
  'action.toggleExpand': 'Toggle Expanded View',
  'action.voiceInput': 'Voice Input (Hold)',
}

export const IPC = {
  START: 'oco:start',
  CREATE_TAB: 'oco:create-tab',
  PROMPT: 'oco:prompt',
  CANCEL: 'oco:cancel',
  STOP_TAB: 'oco:stop-tab',
  RETRY: 'oco:retry',
  STATUS: 'oco:status',
  TAB_HEALTH: 'oco:tab-health',
  CLOSE_TAB: 'oco:close-tab',
  SELECT_DIRECTORY: 'oco:select-directory',
  OPEN_EXTERNAL: 'oco:open-external',
  OPEN_IN_TERMINAL: 'oco:open-in-terminal',
  ATTACH_FILES: 'oco:attach-files',
  TAKE_SCREENSHOT: 'oco:take-screenshot',
  PASTE_IMAGE: 'oco:paste-image',
  GET_DIAGNOSTICS: 'oco:get-diagnostics',
  INIT_SESSION: 'oco:init-session',
  RESET_TAB_SESSION: 'oco:reset-tab-session',
  ANIMATE_HEIGHT: 'oco:animate-height',
  LIST_SESSIONS: 'oco:list-sessions',
  LOAD_SESSION: 'oco:load-session',

  TEXT_CHUNK: 'oco:text-chunk',
  TOOL_CALL: 'oco:tool-call',
  TOOL_CALL_UPDATE: 'oco:tool-call-update',
  TOOL_CALL_COMPLETE: 'oco:tool-call-complete',
  TASK_COMPLETE: 'oco:task-complete',
  SESSION_DEAD: 'oco:session-dead',
  SESSION_INIT: 'oco:session-init',
  ERROR: 'oco:error',

  RESIZE_HEIGHT: 'oco:resize-height',
  SET_WINDOW_WIDTH: 'oco:set-window-width',
  HIDE_WINDOW: 'oco:hide-window',
  WINDOW_SHOWN: 'oco:window-shown',
  SET_IGNORE_MOUSE_EVENTS: 'oco:set-ignore-mouse-events',
  IS_VISIBLE: 'oco:is-visible',

  GET_THEME: 'oco:get-theme',
  THEME_CHANGED: 'oco:theme-changed',
  OPEN_SETTINGS: 'oco:open-settings',
  GET_SHORTCUT_SETTINGS: 'oco:get-shortcut-settings',
  SET_SHORTCUT_SETTINGS: 'oco:set-shortcut-settings',
  GET_APP_SETTINGS: 'oco:get-app-settings',
  SET_APP_SETTINGS: 'oco:set-app-settings',
  APP_SETTINGS_CHANGED: 'oco:app-settings-changed',

  RELAUNCH: 'oco:relaunch',
  TRANSCRIBE_AUDIO: 'oco:transcribe-audio',
  LIST_SKILLS: 'oco:list-skills',
  LIST_MODELS: 'oco:list-models',
  DRAG_MOVE: 'oco:drag-move',

  STREAM_EVENT: 'oco:stream-event',
  RUN_COMPLETE: 'oco:run-complete',
  RUN_ERROR: 'oco:run-error',
} as const

/**
 * Convert an Electron-style shortcut string (e.g. "Alt+Space", "CommandOrControl+Shift+K")
 * into a human-readable label with platform symbols (e.g. "⌥ Space", "⌘ ⇧ K").
 */
export interface ModelInfo {
  id: string
  label: string
  description: string
  hidden: boolean
  isDefault: boolean
  supportedReasoningEfforts: string[]
  defaultReasoningEffort: string
}

export function formatShortcutLabel(shortcut: string): string {
  return shortcut
    .replace(/CommandOrControl/g, '⌘')
    .replace(/Meta/g, '⌘')
    .replace(/Control/g, '⌃')
    .replace(/Alt/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, ' ')
}
