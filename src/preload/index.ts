import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type {
  RunOptions,
  NormalizedEvent,
  HealthReport,
  EnrichedError,
  Attachment,
  SessionMeta,
  SessionLoadMessage,
  ShortcutSettings,
  ShortcutSettingsUpdateResult,
} from '../shared/types'

export interface OcoAPI {
  start(): Promise<{ version: string; projectPath: string; homePath: string }>
  createTab(): Promise<{ tabId: string }>
  prompt(tabId: string, requestId: string, options: RunOptions): Promise<void>
  cancel(requestId: string): Promise<boolean>
  stopTab(tabId: string): Promise<boolean>
  retry(tabId: string, requestId: string, options: RunOptions): Promise<void>
  status(): Promise<HealthReport>
  tabHealth(): Promise<HealthReport>
  closeTab(tabId: string): Promise<void>
  selectDirectory(): Promise<string | null>
  openExternal(url: string): Promise<boolean>
  openInTerminal(sessionId: string | null, projectPath?: string): Promise<boolean>
  attachFiles(): Promise<Attachment[] | null>
  takeScreenshot(): Promise<Attachment | null>
  pasteImage(dataUrl: string): Promise<Attachment | null>
  getDiagnostics(): Promise<unknown>
  initSession(tabId: string): void
  resetTabSession(tabId: string): void
  listSessions(projectPath?: string): Promise<SessionMeta[]>
  loadSession(sessionId: string, projectPath?: string): Promise<SessionLoadMessage[]>
  listSkills(): Promise<Array<{ name: string; description: string }>>
  getTheme(): Promise<{ isDark: boolean }>
  onThemeChange(callback: (isDark: boolean) => void): () => void
  openSettings(): void
  getShortcutSettings(): Promise<ShortcutSettings>
  setShortcutSettings(settings: ShortcutSettings): Promise<ShortcutSettingsUpdateResult>
  getAppSettings(): Promise<Record<string, unknown>>
  setAppSettings(settings: Record<string, unknown>): Promise<boolean>
  onAppSettingsChanged(callback: (settings: Record<string, unknown>) => void): () => void
  resizeHeight(height: number): void
  setWindowWidth(width: number): void
  animateHeight(from: number, to: number, durationMs: number): Promise<void>
  hideWindow(): void
  isVisible(): Promise<boolean>
  relaunch(): Promise<void>
  transcribeAudio(audioBase64: string, language?: string): Promise<{ error: string | null; transcript: string | null }>
  dragMove(deltaX: number, deltaY: number): void
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void
  onEvent(callback: (tabId: string, event: NormalizedEvent) => void): () => void
  onTabStatusChange(callback: (tabId: string, newStatus: string, oldStatus: string) => void): () => void
  onError(callback: (tabId: string, error: EnrichedError) => void): () => void
  onWindowShown(callback: () => void): () => void
}

const api: OcoAPI = {
  start: () => ipcRenderer.invoke(IPC.START),
  createTab: () => ipcRenderer.invoke(IPC.CREATE_TAB),
  prompt: (tabId, requestId, options) => ipcRenderer.invoke(IPC.PROMPT, { tabId, requestId, options }),
  cancel: (requestId) => ipcRenderer.invoke(IPC.CANCEL, requestId),
  stopTab: (tabId) => ipcRenderer.invoke(IPC.STOP_TAB, tabId),
  retry: (tabId, requestId, options) => ipcRenderer.invoke(IPC.RETRY, { tabId, requestId, options }),
  status: () => ipcRenderer.invoke(IPC.STATUS),
  tabHealth: () => ipcRenderer.invoke(IPC.TAB_HEALTH),
  closeTab: (tabId) => ipcRenderer.invoke(IPC.CLOSE_TAB, tabId),
  selectDirectory: () => ipcRenderer.invoke(IPC.SELECT_DIRECTORY),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  openInTerminal: (sessionId, projectPath) => ipcRenderer.invoke(IPC.OPEN_IN_TERMINAL, { sessionId, projectPath }),
  attachFiles: () => ipcRenderer.invoke(IPC.ATTACH_FILES),
  takeScreenshot: () => ipcRenderer.invoke(IPC.TAKE_SCREENSHOT),
  pasteImage: (dataUrl) => ipcRenderer.invoke(IPC.PASTE_IMAGE, dataUrl),
  getDiagnostics: () => ipcRenderer.invoke(IPC.GET_DIAGNOSTICS),
  initSession: (tabId) => ipcRenderer.send(IPC.INIT_SESSION, tabId),
  resetTabSession: (tabId) => ipcRenderer.send(IPC.RESET_TAB_SESSION, tabId),
  listSessions: (projectPath) => ipcRenderer.invoke(IPC.LIST_SESSIONS, projectPath),
  loadSession: (sessionId, projectPath) => ipcRenderer.invoke(IPC.LOAD_SESSION, { sessionId, projectPath }),
  listSkills: () => ipcRenderer.invoke(IPC.LIST_SKILLS),
  getTheme: () => ipcRenderer.invoke(IPC.GET_THEME),
  openSettings: () => ipcRenderer.send(IPC.OPEN_SETTINGS),
  getShortcutSettings: () => ipcRenderer.invoke(IPC.GET_SHORTCUT_SETTINGS),
  setShortcutSettings: (settings) => ipcRenderer.invoke(IPC.SET_SHORTCUT_SETTINGS, settings),
  relaunch: () => ipcRenderer.invoke(IPC.RELAUNCH),
  transcribeAudio: (audioBase64, language) => ipcRenderer.invoke(IPC.TRANSCRIBE_AUDIO, { audioBase64, language }),
  getAppSettings: () => ipcRenderer.invoke(IPC.GET_APP_SETTINGS),
  setAppSettings: (settings) => ipcRenderer.invoke(IPC.SET_APP_SETTINGS, settings),
  onAppSettingsChanged: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, settings: Record<string, unknown>) => callback(settings)
    ipcRenderer.on(IPC.APP_SETTINGS_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.APP_SETTINGS_CHANGED, handler)
  },
  onThemeChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark)
    ipcRenderer.on(IPC.THEME_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.THEME_CHANGED, handler)
  },
  resizeHeight: (height) => ipcRenderer.send(IPC.RESIZE_HEIGHT, height),
  animateHeight: (from, to, durationMs) => ipcRenderer.invoke(IPC.ANIMATE_HEIGHT, { from, to, durationMs }),
  hideWindow: () => ipcRenderer.send(IPC.HIDE_WINDOW),
  isVisible: () => ipcRenderer.invoke(IPC.IS_VISIBLE),
  dragMove: (deltaX, deltaY) => ipcRenderer.send(IPC.DRAG_MOVE, deltaX, deltaY),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send(IPC.SET_IGNORE_MOUSE_EVENTS, ignore, options || {}),
  setWindowWidth: (width) => ipcRenderer.send(IPC.SET_WINDOW_WIDTH, width),
  onEvent: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, event: NormalizedEvent) => callback(tabId, event)
    ipcRenderer.on('oco:normalized-event', handler)
    return () => ipcRenderer.removeListener('oco:normalized-event', handler)
  },
  onTabStatusChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, newStatus: string, oldStatus: string) => callback(tabId, newStatus, oldStatus)
    ipcRenderer.on('oco:tab-status-change', handler)
    return () => ipcRenderer.removeListener('oco:tab-status-change', handler)
  },
  onError: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, error: EnrichedError) => callback(tabId, error)
    ipcRenderer.on('oco:enriched-error', handler)
    return () => ipcRenderer.removeListener('oco:enriched-error', handler)
  },
  onWindowShown: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.WINDOW_SHOWN, handler)
    return () => ipcRenderer.removeListener(IPC.WINDOW_SHOWN, handler)
  },
}

contextBridge.exposeInMainWorld('oco', api)
