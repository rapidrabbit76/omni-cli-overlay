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
  GET_SHORTCUT_SETTINGS: 'oco:get-shortcut-settings',
  SET_SHORTCUT_SETTINGS: 'oco:set-shortcut-settings',

  STREAM_EVENT: 'oco:stream-event',
  RUN_COMPLETE: 'oco:run-complete',
  RUN_ERROR: 'oco:run-error',
} as const
