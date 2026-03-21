import { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut, Tray, Menu, nativeImage, nativeTheme, shell, systemPreferences } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, statSync, createReadStream, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { createInterface } from 'readline'
import { homedir, tmpdir } from 'os'
import { execSync, execFile, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
import { ControlPlane } from './codex/control-plane'
import { log as _log, LOG_FILE, flushLogs } from './logger'
import { DEFAULT_SHORTCUT_SETTINGS, IPC } from '../shared/types'
import type { RunOptions, NormalizedEvent, EnrichedError, ShortcutSettings, ModelInfo, RateLimitInfo, TokenUsageInfo } from '../shared/types'
import { loadShortcutSettings, registerShortcutSettings, saveShortcutSettings } from './shortcut-settings'

const DEBUG_MODE = process.env.OCO_DEBUG === '1'

function log(msg: string): void {
  _log('main', msg)
}

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let screenshotCounter = 0
let currentShortcutSettings: ShortcutSettings = DEFAULT_SHORTCUT_SETTINGS
const controlPlane = new ControlPlane()

const BAR_WIDTH = 1040
const PILL_HEIGHT = 620
const MIN_WIDTH = 360
const MIN_HEIGHT = 120
const PILL_BOTTOM_MARGIN = 24

let lastWindowX: number | null = null
let lastWindowY: number | null = null

function broadcast(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

controlPlane.on('event', (tabId: string, event: NormalizedEvent) => {
  broadcast('oco:normalized-event', tabId, event)
})

controlPlane.on('tab-status-change', (tabId: string, newStatus: string, oldStatus: string) => {
  broadcast('oco:tab-status-change', tabId, newStatus, oldStatus)
})

controlPlane.on('error', (tabId: string, error: EnrichedError) => {
  broadcast('oco:enriched-error', tabId, error)
})

controlPlane.on('tokenUsageUpdated', (params: unknown) => {
  const p = params as { threadId?: string; turnId?: string; tokenUsage?: { total?: { totalTokens?: number; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; reasoningOutputTokens?: number }; modelContextWindow?: number | null } }
  if (!p.tokenUsage?.total) return
  const t = p.tokenUsage.total
  broadcast(IPC.TOKEN_USAGE_UPDATED, {
    threadId: p.threadId || '',
    turnId: p.turnId || '',
    totalTokens: t.totalTokens || 0,
    inputTokens: t.inputTokens || 0,
    outputTokens: t.outputTokens || 0,
    cachedInputTokens: t.cachedInputTokens || 0,
    reasoningOutputTokens: t.reasoningOutputTokens || 0,
    modelContextWindow: p.tokenUsage.modelContextWindow ?? null,
  } satisfies TokenUsageInfo)
})

controlPlane.on('rateLimitsUpdated', (params: unknown) => {
  const p = params as { rateLimits?: { primary?: { usedPercent?: number; windowDurationMins?: number | null; resetsAt?: number | null }; planType?: string | null; credits?: { hasCredits?: boolean; unlimited?: boolean } } }
  if (!p.rateLimits) return
  const s = p.rateLimits
  broadcast(IPC.RATE_LIMITS_UPDATED, {
    usedPercent: s.primary?.usedPercent ?? 0,
    windowDurationMins: s.primary?.windowDurationMins ?? null,
    resetsAt: s.primary?.resetsAt ?? null,
    planType: s.planType ?? null,
    hasCredits: s.credits?.hasCredits ?? true,
    unlimited: s.credits?.unlimited ?? false,
  } satisfies RateLimitInfo)
})

function createWindow(): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width: screenWidth, height: screenHeight } = display.workAreaSize
  const { x: dx, y: dy } = display.workArea
  const x = dx + Math.round((screenWidth - BAR_WIDTH) / 2)
  const y = dy + screenHeight - PILL_HEIGHT - PILL_BOTTOM_MARGIN

  mainWindow = new BrowserWindow({
    width: BAR_WIDTH,
    height: PILL_HEIGHT,
    x,
    y,
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: true,
    backgroundColor: '#00000000',
    show: false,
    icon: join(__dirname, '../../resources/icon.icns'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  mainWindow.setAlwaysOnTop(true, 'screen-saver')

  mainWindow.on('moved', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [x, y] = mainWindow.getPosition()
    lastWindowX = x
    lastWindowY = y
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.setIgnoreMouseEvents(true, { forward: true })
    if (process.env.OCO_DEBUG === '1') {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  let forceQuit = false
  app.on('before-quit', () => { forceQuit = true })
  mainWindow.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 600,
    title: 'Settings',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#212121',
    resizable: true,
    minimizable: false,
    maximizable: false,
    movable: true,
    minWidth: 520,
    minHeight: 400,
    maxWidth: 800,
    maxHeight: 900,
    icon: join(__dirname, '../../resources/icon.icns'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    const normalizedBase = rendererUrl.endsWith('/') ? rendererUrl : `${rendererUrl}/`
    settingsWindow.loadURL(new URL('settings.html', normalizedBase).toString())
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'))
  }
}

function showWindow(): void {
  if (!mainWindow) return
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width: sw, height: sh } = display.workAreaSize
  const { x: dx, y: dy } = display.workArea
  const defaultX = dx + Math.round((sw - BAR_WIDTH) / 2)
  const defaultY = dy + sh - PILL_HEIGHT - PILL_BOTTOM_MARGIN
  const useLastPos = lastWindowX != null && lastWindowY != null
  mainWindow.setBounds({
    x: useLastPos ? lastWindowX! : defaultX,
    y: useLastPos ? lastWindowY! : defaultY,
    width: BAR_WIDTH,
    height: PILL_HEIGHT,
  })
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  mainWindow.show()
  mainWindow.webContents.focus()
  broadcast(IPC.WINDOW_SHOWN)
}

function toggleWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible()) mainWindow.hide()
  else showWindow()
}

ipcMain.on(IPC.RESIZE_HEIGHT, (_event, height: number) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const zoom = mainWindow.webContents.getZoomFactor()
  const bounds = mainWindow.getBounds()
  const clamped = Math.max(MIN_HEIGHT, Math.round(height * zoom))
  const dy = bounds.height - clamped
  mainWindow.setBounds({ x: bounds.x, y: bounds.y + dy, width: bounds.width, height: clamped })
})
ipcMain.on(IPC.SET_WINDOW_WIDTH, (_event, width: number) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const zoom = mainWindow.webContents.getZoomFactor()
  const bounds = mainWindow.getBounds()
  const clamped = Math.max(MIN_WIDTH, Math.round(width * zoom))
  const dx = Math.round((bounds.width - clamped) / 2)
  mainWindow.setBounds({ x: bounds.x + dx, y: bounds.y, width: clamped, height: bounds.height })
})
ipcMain.on(IPC.SET_WINDOW_BOUNDS, (_event, payload: { width: number; height: number }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const zoom = mainWindow.webContents.getZoomFactor()
  const bounds = mainWindow.getBounds()
  const clampedWidth = Math.max(MIN_WIDTH, Math.round(payload.width * zoom))
  const clampedHeight = Math.max(MIN_HEIGHT, Math.round(payload.height * zoom))
  const dx = bounds.width - clampedWidth
  const dy = bounds.height - clampedHeight
  mainWindow.setBounds({
    x: bounds.x + dx,
    y: bounds.y + dy,
    width: clampedWidth,
    height: clampedHeight,
  })
})
ipcMain.handle(IPC.ANIMATE_HEIGHT, () => {})
ipcMain.on(IPC.HIDE_WINDOW, () => mainWindow?.hide())
ipcMain.handle(IPC.IS_VISIBLE, () => mainWindow?.isVisible() ?? false)

const APP_SETTINGS_PATH = join(homedir(), '.config', 'oco', 'settings.json')

function readAppSettings(): Record<string, unknown> {
  try {
    if (existsSync(APP_SETTINGS_PATH)) return JSON.parse(readFileSync(APP_SETTINGS_PATH, 'utf-8'))
  } catch {}
  return {}
}

function writeAppSettings(settings: Record<string, unknown>): void {
  try {
    mkdirSync(join(homedir(), '.config', 'oco'), { recursive: true })
    writeFileSync(APP_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
  } catch {}
}

ipcMain.handle(IPC.GET_APP_SETTINGS, () => readAppSettings())

ipcMain.handle(IPC.SET_APP_SETTINGS, (_event, settings: Record<string, unknown>) => {
  writeAppSettings(settings)
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send(IPC.APP_SETTINGS_CHANGED, settings)
  })
  return true
})

ipcMain.handle(IPC.RELAUNCH, () => {
  app.relaunch()
  app.quit()
})

ipcMain.handle(IPC.TRANSCRIBE_AUDIO, async (_event, { audioBase64, language }: { audioBase64: string; language?: string }) => {
  const candidates = [
    '/opt/homebrew/bin/whisperkit-cli',
    '/usr/local/bin/whisperkit-cli',
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
    '/opt/homebrew/bin/whisper',
    '/usr/local/bin/whisper',
    join(homedir(), '.local/bin/whisper'),
  ]

  let whisperBin = ''
  for (const c of candidates) {
    if (existsSync(c)) { whisperBin = c; break }
  }

  if (!whisperBin) {
    for (const name of ['whisperkit-cli', 'whisper-cli', 'whisper']) {
      try {
        const { stdout } = await execAsync(`/bin/zsh -lc "whence -p ${name}"`)
        whisperBin = stdout.trim()
        if (whisperBin) break
      } catch {}
    }
  }

  if (!whisperBin) {
    const hint = process.arch === 'arm64'
      ? 'brew install whisperkit-cli   (or: brew install whisper-cpp)'
      : 'brew install whisper-cpp'
    return { error: `Whisper not found. Install with:\n  ${hint}`, transcript: null }
  }

  if (!audioBase64) {
    return { error: null, transcript: null }
  }

  const tmpWav = join(tmpdir(), `oco-voice-${Date.now()}.wav`)
  try {
    const buf = Buffer.from(audioBase64, 'base64')
    writeFileSync(tmpWav, buf)

    const isWhisperKit = whisperBin.includes('whisperkit-cli')
    const isWhisperCpp = !isWhisperKit && whisperBin.includes('whisper-cli')

    log(`Transcribing with: ${whisperBin} (${isWhisperKit ? 'WhisperKit' : isWhisperCpp ? 'whisper-cpp' : 'Python whisper'})`)

    let output: string
    const langArg = language ? ` --language ${language}` : ''

    if (isWhisperKit) {
      const reportDir = tmpdir()
      await execAsync(
        `"${whisperBin}" transcribe --audio-path "${tmpWav}" --model base${langArg} --without-timestamps --skip-special-tokens --report --report-path "${reportDir}"`,
        { timeout: 60000 },
      )
      const wavBasename = require('path').basename(tmpWav, '.wav')
      const reportPath = join(reportDir, `${wavBasename}.json`)
      if (existsSync(reportPath)) {
        try {
          const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
          const transcript = (report.text || '').trim()
          try { unlinkSync(reportPath) } catch {}
          try { unlinkSync(join(reportDir, `${wavBasename}.srt`)) } catch {}
          return { error: null, transcript }
        } catch {
          try { unlinkSync(reportPath) } catch {}
        }
      }
      const { stdout } = await execAsync(
        `"${whisperBin}" transcribe --audio-path "${tmpWav}" --model base${langArg} --without-timestamps --skip-special-tokens`,
        { timeout: 60000 },
      )
      output = stdout
    } else if (isWhisperCpp) {
      const modelCandidates = [
        join(homedir(), '.local/share/whisper/ggml-base.bin'),
        join(homedir(), '.local/share/whisper/ggml-tiny.bin'),
        '/opt/homebrew/share/whisper-cpp/models/ggml-base.bin',
        '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.bin',
        join(homedir(), '.local/share/whisper/ggml-base.en.bin'),
        join(homedir(), '.local/share/whisper/ggml-tiny.en.bin'),
        '/opt/homebrew/share/whisper-cpp/models/ggml-base.en.bin',
        '/opt/homebrew/share/whisper-cpp/models/ggml-tiny.en.bin',
      ]
      let modelPath = ''
      for (const m of modelCandidates) {
        if (existsSync(m)) { modelPath = m; break }
      }
      if (!modelPath) {
        return {
          error: 'Whisper model not found. Download with:\n  mkdir -p ~/.local/share/whisper && curl -L -o ~/.local/share/whisper/ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
          transcript: null,
        }
      }
      const langFlag = language ? `-l ${language}` : modelPath.includes('.en.') ? '-l en' : '-l auto'
      const { stdout } = await execAsync(
        `"${whisperBin}" -m "${modelPath}" -f "${tmpWav}" --no-timestamps ${langFlag}`,
        { timeout: 30000 },
      )
      output = stdout
    } else {
      await execAsync(
        `"${whisperBin}" "${tmpWav}" --model base --output_format txt --output_dir "${tmpdir()}"`,
        { timeout: 30000 },
      )
      const txtPath = tmpWav.replace('.wav', '.txt')
      if (existsSync(txtPath)) {
        const transcript = readFileSync(txtPath, 'utf-8').trim()
        try { unlinkSync(txtPath) } catch {}
        return { error: null, transcript }
      }
      return { error: 'Whisper output file not found.', transcript: null }
    }

    const HALLUCINATIONS = /^\s*(\[BLANK_AUDIO\]|you\.?|thank you\.?|thanks\.?)\s*$/i
    const transcript = output.replace(/\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/g, '').trim()
    if (HALLUCINATIONS.test(transcript)) return { error: null, transcript: '' }
    return { error: null, transcript: transcript || '' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`Transcription error: ${msg}`)
    return { error: `Transcription failed: ${msg}`, transcript: null }
  } finally {
    try { unlinkSync(tmpWav) } catch {}
  }
})

ipcMain.on(IPC.DRAG_MOVE, (event, deltaX: number, deltaY: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return
  const [x, y] = win.getPosition()
  win.setPosition(x + deltaX, y + deltaY)
})

ipcMain.on(IPC.SET_IGNORE_MOUSE_EVENTS, (event, ignore: boolean, options?: { forward?: boolean }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(ignore, options || {})
})

ipcMain.handle(IPC.START, async () => {
  return { version: app.getVersion(), projectPath: process.cwd(), homePath: homedir() }
})

ipcMain.handle(IPC.CREATE_TAB, () => ({ tabId: controlPlane.createTab() }))
ipcMain.on(IPC.INIT_SESSION, (_event, tabId: string) => controlPlane.initSession(tabId))
ipcMain.on(IPC.RESET_TAB_SESSION, (_event, tabId: string) => controlPlane.resetTabSession(tabId))

ipcMain.handle(IPC.PROMPT, async (_event, { tabId, requestId, options }: { tabId: string; requestId: string; options: RunOptions }) => {
  if (DEBUG_MODE) log(`PROMPT tab=${tabId} req=${requestId}`)
  await controlPlane.submitPrompt(tabId, requestId, options)
})

ipcMain.handle(IPC.CANCEL, (_event, requestId: string) => controlPlane.cancel(requestId))
ipcMain.handle(IPC.STOP_TAB, (_event, tabId: string) => controlPlane.cancelTab(tabId))
ipcMain.handle(IPC.RETRY, async (_event, { tabId, requestId, options }: { tabId: string; requestId: string; options: RunOptions }) => controlPlane.retry(tabId, requestId, options))
ipcMain.handle(IPC.STATUS, () => controlPlane.getHealth())
ipcMain.handle(IPC.TAB_HEALTH, () => controlPlane.getHealth())
ipcMain.handle(IPC.CLOSE_TAB, (_event, tabId: string) => controlPlane.closeTab(tabId))

ipcMain.handle(IPC.LIST_SESSIONS, async (_event, projectPath?: string) => {
  try {
    return await controlPlane.listThreads(projectPath || undefined)
  } catch (err) {
    log(`listThreads RPC failed: ${(err as Error).message}`)
    return []
  }
})

function locateCodexRollout(sessionId: string): string | null {
  const base = join(homedir(), '.codex', 'sessions')
  if (!existsSync(base)) return null
  const years = readdirSync(base)
  for (const year of years) {
    const yearPath = join(base, year)
    if (!statSync(yearPath).isDirectory()) continue
    const months = readdirSync(yearPath)
    for (const month of months) {
      const monthPath = join(yearPath, month)
      if (!statSync(monthPath).isDirectory()) continue
      const days = readdirSync(monthPath)
      for (const day of days) {
        const dayPath = join(monthPath, day)
        if (!statSync(dayPath).isDirectory()) continue
        for (const file of readdirSync(dayPath)) {
          if (!file.endsWith('.jsonl')) continue
          if (!file.includes(sessionId)) continue
          return join(dayPath, file)
        }
      }
    }
  }
  return null
}

ipcMain.handle(IPC.LOAD_SESSION, async (_e, arg: { sessionId: string } | string) => {
  const sessionId = typeof arg === 'string' ? arg : arg.sessionId
  const filePath = locateCodexRollout(sessionId)
  if (!filePath || !existsSync(filePath)) return []

  const messages: Array<{ role: string; content: string; toolName?: string; timestamp: number }> = []
  await new Promise<void>((resolve) => {
    const rl = createInterface({ input: createReadStream(filePath) })
    rl.on('line', (line) => {
      try {
        const obj = JSON.parse(line)
        const timestamp = obj?.timestamp ? new Date(obj.timestamp).getTime() : Date.now()
        const payload = obj?.payload

        if (obj.type === 'response_item' && payload?.type === 'message') {
          const role = payload.role
          if (role === 'developer') return
          const contentArr = Array.isArray(payload.content) ? payload.content : []
          const text = contentArr
            .filter((c: Record<string, unknown>) => c.type === 'input_text' || c.type === 'output_text')
            .map((c: Record<string, unknown>) => c.text || '')
            .join('\n')
            .trim()
          if (text && (role === 'user' || role === 'assistant')) {
            messages.push({ role, content: text, timestamp })
          }
        }

        if (obj.type === 'event_msg' && payload?.role === 'user') {
          const text = typeof payload?.text === 'string' ? payload.text : ''
          if (text) messages.push({ role: 'user', content: text, timestamp })
        }

        if (obj.type === 'response_item' && payload?.item) {
          const item = payload.item
          if (item.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
            messages.push({ role: 'assistant', content: item.text, timestamp })
          }
          if (item.type === 'command_execution') {
            messages.push({ role: 'tool', content: item.aggregated_output || '', toolName: 'Shell', timestamp })
          }
        }

        if (obj.type === 'response_item' && payload?.type === 'function_call') {
          messages.push({ role: 'tool', content: payload.arguments || '', toolName: payload.name || 'Tool', timestamp })
        }
      } catch {}
    })
    rl.on('close', () => resolve())
  })
  return messages
})

ipcMain.handle(IPC.SELECT_DIRECTORY, async () => {
  if (!mainWindow) return null
  if (process.platform === 'darwin') app.focus()
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url: string) => {
  try {
    if (!/^https?:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  } catch {
    return false
  }
})

ipcMain.handle(IPC.ATTACH_FILES, async () => {
  if (!mainWindow) return null
  if (process.platform === 'darwin') app.focus()
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      { name: 'Code', extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'md', 'json', 'yaml', 'toml'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const { basename, extname } = require('path')
  const { readFileSync, statSync } = require('fs')
  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
  const mimeMap: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.yaml': 'text/yaml', '.toml': 'text/toml',
  }

  return result.filePaths.map((fp: string) => {
    const ext = extname(fp).toLowerCase()
    const mime = mimeMap[ext] || 'application/octet-stream'
    const stat = statSync(fp)
    let dataUrl: string | undefined
    if (IMAGE_EXTS.has(ext) && stat.size < 2 * 1024 * 1024) {
      try {
        const buf = readFileSync(fp)
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      } catch {}
    }
    return {
      id: crypto.randomUUID(),
      type: IMAGE_EXTS.has(ext) ? 'image' : 'file',
      name: basename(fp),
      path: fp,
      mimeType: mime,
      dataUrl,
      size: stat.size,
    }
  })
})

ipcMain.handle(IPC.TAKE_SCREENSHOT, async () => {
  if (!mainWindow) return null
  mainWindow.hide()
  await new Promise((r) => setTimeout(r, 300))
  try {
    const { join } = require('path')
    const { tmpdir } = require('os')
    const { readFileSync, existsSync } = require('fs')
    const screenshotPath = join(tmpdir(), `oco-screenshot-${Date.now()}.png`)
    execSync(`/usr/sbin/screencapture -i "${screenshotPath}"`, { timeout: 30000, stdio: 'ignore' })
    if (!existsSync(screenshotPath)) return null
    const buf = readFileSync(screenshotPath)
    return {
      id: crypto.randomUUID(),
      type: 'image',
      name: `screenshot ${++screenshotCounter}.png`,
      path: screenshotPath,
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
      size: buf.length,
    }
  } catch {
    return null
  } finally {
    mainWindow.show()
    mainWindow.webContents.focus()
    broadcast(IPC.WINDOW_SHOWN)
  }
})

ipcMain.handle(IPC.PASTE_IMAGE, async (_event, dataUrl: string) => {
  try {
    const { writeFileSync } = require('fs')
    const { join } = require('path')
    const { tmpdir } = require('os')
    const match = dataUrl.match(/^data:(image\/(\w+));base64,(.+)$/)
    if (!match) return null
    const [, mimeType, ext, base64Data] = match
    const buf = Buffer.from(base64Data, 'base64')
    const filePath = join(tmpdir(), `oco-paste-${Date.now()}.${ext}`)
    writeFileSync(filePath, buf)
    return {
      id: crypto.randomUUID(),
      type: 'image',
      name: `pasted image.${ext}`,
      path: filePath,
      mimeType,
      dataUrl,
      size: buf.length,
    }
  } catch {
    return null
  }
})

ipcMain.handle(IPC.GET_DIAGNOSTICS, () => {
  const health = controlPlane.getHealth()
  let recentLogs = ''
  if (existsSync(LOG_FILE)) {
    try {
      const content = readFileSync(LOG_FILE, 'utf-8')
      recentLogs = content.split('\n').slice(-100).join('\n')
    } catch {}
  }
  return {
    health,
    logPath: LOG_FILE,
    recentLogs,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    appVersion: app.getVersion(),
    transport: 'websocket',
  }
})

ipcMain.handle(IPC.OPEN_IN_TERMINAL, (_event, arg: string | null | { sessionId?: string | null; projectPath?: string }) => {
  const codexBin = 'codex'
  let sessionId: string | null = null
  let projectPath: string = process.cwd()
  if (typeof arg === 'string') sessionId = arg
  else if (arg && typeof arg === 'object') {
    sessionId = arg.sessionId ?? null
    projectPath = arg.projectPath && arg.projectPath !== '~' ? arg.projectPath : process.cwd()
  }

  const projectDir = projectPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const cmd = sessionId
    ? `cd \\"${projectDir}\\" && ${codexBin} resume ${sessionId}`
    : `cd \\"${projectDir}\\" && ${codexBin}`
  const script = `tell application "Terminal"\n  activate\n  do script "${cmd}"\nend tell`

  try {
    execFile('/usr/bin/osascript', ['-e', script], (err: Error | null) => {
      if (err) log(`Failed to open terminal: ${err.message}`)
    })
    return true
  } catch {
    return false
  }
})

const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'gpt-5.4', label: 'GPT-5.4', description: '', hidden: false, isDefault: true, supportedReasoningEfforts: ['low', 'medium', 'high'], defaultReasoningEffort: 'medium' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', description: '', hidden: false, isDefault: false, supportedReasoningEfforts: ['low', 'medium', 'high'], defaultReasoningEffort: 'medium' },
  { id: 'o3', label: 'o3', description: '', hidden: false, isDefault: false, supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'], defaultReasoningEffort: 'medium' },
  { id: 'o4-mini', label: 'o4-mini', description: '', hidden: false, isDefault: false, supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'], defaultReasoningEffort: 'medium' },
]

ipcMain.handle(IPC.LIST_MODELS, async (): Promise<ModelInfo[]> => {
  try {
    const models = await controlPlane.listModels()
    return models
      .filter((m) => !m.hidden)
      .map((m) => ({
        id: m.id,
        label: m.displayName || m.id,
        description: m.description,
        hidden: m.hidden,
        isDefault: m.isDefault,
        supportedReasoningEfforts: m.supportedReasoningEfforts.map((r) => r.reasoningEffort),
        defaultReasoningEffort: m.defaultReasoningEffort,
      }))
  } catch (err) {
    log(`model/list RPC failed, using fallback: ${(err as Error).message}`)
    return FALLBACK_MODELS
  }
})

ipcMain.handle(IPC.GET_RATE_LIMITS, async (): Promise<RateLimitInfo | null> => {
  try {
    const resp = await controlPlane.getRateLimits()
    const s = resp.rateLimits
    return {
      usedPercent: s.primary?.usedPercent ?? 0,
      windowDurationMins: s.primary?.windowDurationMins ?? null,
      resetsAt: s.primary?.resetsAt ?? null,
      planType: s.planType ?? null,
      hasCredits: s.credits?.hasCredits ?? true,
      unlimited: s.credits?.unlimited ?? false,
    }
  } catch (err) {
    log(`account/rateLimits/read RPC failed: ${(err as Error).message}`)
    return null
  }
})

ipcMain.handle(IPC.LIST_SKILLS, async () => {
  try {
    const skills = await controlPlane.listSkills()
    return skills
      .filter((s) => s.enabled)
      .map((s) => ({
        name: s.name,
        description: s.description,
        scope: s.scope,
        enabled: s.enabled,
        path: s.path,
      }))
  } catch (err) {
    log(`skills/list RPC failed, falling back to filesystem: ${(err as Error).message}`)
    const skillsDir = join(homedir(), '.codex', 'skills')
    if (!existsSync(skillsDir)) return []
    try {
      return readdirSync(skillsDir)
        .filter((name) => {
          const skillMd = join(skillsDir, name, 'SKILL.md')
          return existsSync(skillMd)
        })
        .map((name) => {
          const content = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf-8')
          const descMatch = content.match(/^description:\s*(.+)$/m)
          return { name, description: descMatch?.[1]?.trim() || '', scope: 'user' as const, enabled: true, path: join(skillsDir, name) }
        })
    } catch {
      return []
    }
  }
})

ipcMain.handle(IPC.GET_THEME, () => ({ isDark: nativeTheme.shouldUseDarkColors }))
ipcMain.on(IPC.OPEN_SETTINGS, () => createSettingsWindow())
ipcMain.handle(IPC.GET_SHORTCUT_SETTINGS, () => currentShortcutSettings)
ipcMain.handle(IPC.SET_SHORTCUT_SETTINGS, (_event, settings: ShortcutSettings) => {
  const previous = currentShortcutSettings
  try {
    const registration = registerShortcutSettings(settings, toggleWindow)
    if (!registration.ok) {
      registerShortcutSettings(previous, toggleWindow)
      return { ok: false, error: registration.error, settings: previous }
    }
    currentShortcutSettings = registration.settings
    saveShortcutSettings(currentShortcutSettings)
    return { ok: true, settings: currentShortcutSettings }
  } catch (err) {
    registerShortcutSettings(previous, toggleWindow)
    return { ok: false, error: err instanceof Error ? err.message : String(err), settings: previous }
  }
})

nativeTheme.on('updated', () => broadcast(IPC.THEME_CHANGED, nativeTheme.shouldUseDarkColors))

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide()
  if (process.platform === 'darwin') {
    try {
      const micStatus = systemPreferences.getMediaAccessStatus('microphone')
      if (micStatus === 'not-determined') await systemPreferences.askForMediaAccess('microphone')
    } catch (err: unknown) {
      log(`Microphone permission preflight failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  await controlPlane.initialize().catch((err) => {
    log(`Failed to initialize app-server transport: ${err instanceof Error ? err.message : String(err)}`)
  })
  createWindow()

  currentShortcutSettings = loadShortcutSettings()
  let shortcutRegistration = registerShortcutSettings(currentShortcutSettings, toggleWindow)
  if (!shortcutRegistration.ok) {
    currentShortcutSettings = DEFAULT_SHORTCUT_SETTINGS
    shortcutRegistration = registerShortcutSettings(currentShortcutSettings, toggleWindow)
    if (shortcutRegistration.ok) saveShortcutSettings(currentShortcutSettings)
  }

  globalShortcut.register('CommandOrControl+,', () => {
    createSettingsWindow()
  })

  const trayIconPath = join(__dirname, '../../resources/trayTemplate.png')
  const trayIcon = nativeImage.createFromPath(trayIconPath).resize({ height: 16 })
  trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  tray.setToolTip('OCO')
  tray.on('click', () => toggleWindow())
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show OCO', click: () => showWindow() },
    { label: 'Settings', accelerator: 'CommandOrControl+,', click: () => createSettingsWindow() },
    { label: 'Quit', click: () => app.quit() },
  ]))

  app.on('activate', () => showWindow())
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  controlPlane.shutdown()
  flushLogs()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
