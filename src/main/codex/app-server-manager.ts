import { spawn, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getCliEnv, findCodexBinary } from '../cli-env'
import { log as _log } from '../logger'

const PORT_BASE = 14200
const PORT_SPAN = 101
const READY_TIMEOUT_MS = 15000
const HEALTH_POLL_INTERVAL_MS = 150

function log(msg: string): void {
  _log('AppServerManager', msg)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

function makePortOrder(): number[] {
  const offset = Math.floor(Math.random() * PORT_SPAN)
  const ports: number[] = []
  for (let i = 0; i < PORT_SPAN; i += 1) {
    ports.push(PORT_BASE + ((offset + i) % PORT_SPAN))
  }
  return ports
}

function readYoloMode(): boolean {
  try {
    const settingsPath = join(homedir(), '.config', 'oco', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      return settings.yoloMode !== false
    }
  } catch {}
  return true
}

export class AppServerManager {
  private process: ChildProcess | null = null
  private currentWsUrl: string | null = null

  get wsUrl(): string | null {
    return this.currentWsUrl
  }

  async start(): Promise<string> {
    if (this.currentWsUrl && this.process && this.process.exitCode === null) {
      return this.currentWsUrl
    }

    const codexBinary = findCodexBinary()
    const env = getCliEnv()
    const ports = makePortOrder()
    const yolo = readYoloMode()
    let lastError: string | null = null

    if (yolo) {
      log('YOLO mode enabled — all approvals and sandbox bypassed')
    }

    for (const port of ports) {
      const available = await isPortAvailable(port)
      if (!available) continue

      const wsUrl = `ws://127.0.0.1:${port}`
      const args = [
        'app-server',
        '--listen',
        wsUrl,
        '-c',
        'suppress_unstable_features_warning=true',
        '--disable',
        'child_agents_md',
        ...(yolo ? ['--dangerously-bypass-approvals-and-sandbox'] : []),
      ]
      const child = spawn(codexBinary, args, {
        stdio: ['ignore', 'ignore', 'pipe'],
        env,
      })

      try {
        await this.waitUntilReady(child, wsUrl, port)
        this.process = child
        this.currentWsUrl = wsUrl
        log(`App-server ready at ${wsUrl}`)
        return wsUrl
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        child.kill('SIGTERM')
      }
    }

    throw new Error(lastError ? `Failed to start app-server: ${lastError}` : 'Failed to find available app-server port')
  }

  stop(): void {
    if (this.process && this.process.exitCode === null) {
      this.process.kill('SIGTERM')
    }
    this.process = null
    this.currentWsUrl = null
  }

  private async waitUntilReady(child: ChildProcess, wsUrl: string, port: number): Promise<void> {
    const startedAt = Date.now()
    let sawListenLine = false

    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (chunk: string | Buffer) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
      const lines = text.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (trimmed.includes(`listening on: ${wsUrl}`)) {
          sawListenLine = true
        }
      }
    })

    while (Date.now() - startedAt < READY_TIMEOUT_MS) {
      if (child.exitCode !== null) {
        throw new Error(`app-server exited with code ${child.exitCode}`)
      }

      const ready = await this.checkReadyz(port)
      if (sawListenLine && ready) {
        return
      }

      await sleep(HEALTH_POLL_INTERVAL_MS)
    }

    throw new Error('Timed out waiting for app-server readiness')
  }

  private async checkReadyz(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/readyz`)
      return response.ok
    } catch {
      return false
    }
  }
}
