import { EventEmitter } from 'events'
import { AppServerManager } from './app-server-manager'
import { RunManager } from './run-manager'
import { WsTransport } from './ws-transport'
import { normalizeNotification } from './event-normalizer'
import { log as _log } from '../logger'
import type { TabStatus, TabRegistryEntry, HealthReport, RunOptions, EnrichedError } from '../../shared/types'

const MAX_QUEUE_DEPTH = 32

function log(msg: string): void {
  _log('ControlPlane', msg)
}

interface QueuedRequest {
  requestId: string
  tabId: string
  options: RunOptions
  resolve: (value: void) => void
  reject: (reason: Error) => void
  extraWaiters: Array<{ resolve: (value: void) => void; reject: (reason: Error) => void }>
}

interface InflightRequest {
  requestId: string
  tabId: string
  threadId: string
  turnId: string
  promise: Promise<void>
  resolve: (value: void) => void
  reject: (reason: Error) => void
}

export class ControlPlane extends EventEmitter {
  private tabs = new Map<string, TabRegistryEntry>()
  private inflightRequests = new Map<string, InflightRequest>()
  private requestQueue: QueuedRequest[] = []
  private initRequestIds = new Set<string>()
  private appServerManager: AppServerManager
  private wsTransport: WsTransport
  private runManager: RunManager
  private initialized = false

  constructor() {
    super()
    this.appServerManager = new AppServerManager()
    this.wsTransport = new WsTransport()
    this.runManager = new RunManager(this.wsTransport)

    this.wsTransport.onNotification((method, params) => {
      this.handleNotification(method, params)
    })

    this.wsTransport.onServerRequest((id, method) => {
      if (
        method === 'item/commandExecution/requestApproval'
        || method === 'item/fileChange/requestApproval'
        || method === 'applyPatchApproval'
      ) {
        this.wsTransport.respondToServerRequest(id, { decision: 'approve' })
        return
      }

      this.wsTransport.respondToServerRequest(id, { decision: 'approve' })
    })

    this.wsTransport.onDisconnect(() => {
      this.handleDisconnect()
    })
  }

  async initialize(): Promise<void> {
    if (this.initialized && this.wsTransport.isConnected) return
    const wsUrl = await this.appServerManager.start()
    await this.wsTransport.connect(wsUrl)
    this.initialized = true
  }

  createTab(): string {
    const tabId = crypto.randomUUID()
    this.tabs.set(tabId, {
      tabId,
      sessionId: null,
      status: 'idle',
      activeRequestId: null,
      runPid: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      promptCount: 0,
    })
    return tabId
  }

  initSession(tabId: string): void {
    const requestId = `init-${tabId}`
    this.initRequestIds.add(requestId)
    this.submitPrompt(tabId, requestId, {
      prompt: 'hi',
      projectPath: process.cwd(),
      autoApprove: true,
    }).catch((err) => {
      this.initRequestIds.delete(requestId)
      log(`Init session failed for ${tabId}: ${(err as Error).message}`)
    })
  }

  resetTabSession(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.sessionId = null
  }

  closeTab(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    if (tab.activeRequestId) {
      this.cancel(tab.activeRequestId)
      const inflight = this.inflightRequests.get(tab.activeRequestId)
      if (inflight) {
        inflight.reject(new Error('Tab closed'))
        this.inflightRequests.delete(tab.activeRequestId)
      }
    }

    this.requestQueue = this.requestQueue.filter((req) => {
      if (req.tabId !== tabId) return true
      const reason = new Error('Tab closed')
      req.reject(reason)
      for (const waiter of req.extraWaiters) waiter.reject(reason)
      return false
    })

    this.tabs.delete(tabId)
  }

  async submitPrompt(tabId: string, requestId: string, options: RunOptions): Promise<void> {
    if (!tabId) throw new Error('No targetSession (tabId) provided')
    const tab = this.tabs.get(tabId)
    if (!tab) throw new Error(`Tab ${tabId} does not exist`)

    const existing = this.inflightRequests.get(requestId)
    if (existing) return existing.promise

    const queued = this.requestQueue.find((r) => r.requestId === requestId)
    if (queued) {
      return new Promise<void>((resolve, reject) => {
        queued.extraWaiters.push({ resolve, reject })
      })
    }

    if (tab.activeRequestId) {
      if (this.requestQueue.length >= MAX_QUEUE_DEPTH) {
        throw new Error('Request queue full')
      }
      return new Promise<void>((resolve, reject) => {
        this.requestQueue.push({ requestId, tabId, options, resolve, reject, extraWaiters: [] })
      })
    }

    return this.dispatch(tabId, requestId, options)
  }

  cancel(requestId: string): boolean {
    const queueIdx = this.requestQueue.findIndex((r) => r.requestId === requestId)
    if (queueIdx !== -1) {
      const req = this.requestQueue.splice(queueIdx, 1)[0]
      const reason = new Error('Request cancelled')
      req.reject(reason)
      for (const waiter of req.extraWaiters) waiter.reject(reason)
      return true
    }

    const inflight = this.inflightRequests.get(requestId)
    if (!inflight) return false
    this.runManager.interruptTurn(inflight.threadId, inflight.turnId).catch(() => {})
    return true
  }

  cancelTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId)
    if (!tab?.activeRequestId) return false
    return this.cancel(tab.activeRequestId)
  }

  async retry(tabId: string, requestId: string, options: RunOptions): Promise<void> {
    const tab = this.tabs.get(tabId)
    if (!tab) throw new Error(`Tab ${tabId} does not exist`)
    if (tab.status === 'dead') {
      tab.sessionId = null
      this.setTabStatus(tabId, 'idle')
    }
    return this.submitPrompt(tabId, requestId, options)
  }

  getHealth(): HealthReport {
    const tabs = Array.from(this.tabs.values()).map((tab) => ({
      tabId: tab.tabId,
      status: tab.status,
      activeRequestId: tab.activeRequestId,
      sessionId: tab.sessionId,
      alive: tab.activeRequestId ? this.wsTransport.isConnected : false,
    }))
    return { tabs, queueDepth: this.requestQueue.length }
  }

  getEnrichedError(requestId: string, exitCode: number | null): EnrichedError {
    const inflight = this.inflightRequests.get(requestId)
    return {
      message: `Run failed with exit code ${exitCode}`,
      stderrTail: [],
      stdoutTail: [],
      exitCode,
      elapsedMs: inflight ? Date.now() - this.tabs.get(inflight.tabId)!.lastActivityAt : 0,
      toolCallCount: 0,
    }
  }

  shutdown(): void {
    for (const tabId of this.tabs.keys()) {
      this.closeTab(tabId)
    }
    this.wsTransport.disconnect()
    this.appServerManager.stop()
    this.initialized = false
  }

  private async dispatch(tabId: string, requestId: string, options: RunOptions): Promise<void> {
    const tab = this.tabs.get(tabId)
    if (!tab) throw new Error(`Tab ${tabId} disappeared`)

    await this.initialize()

    tab.activeRequestId = requestId
    if (!this.initRequestIds.has(requestId)) tab.promptCount += 1
    tab.lastActivityAt = Date.now()
    const newStatus: TabStatus = tab.sessionId ? 'running' : 'connecting'
    this.setTabStatus(tabId, newStatus)

    try {
      let threadId: string
      if (tab.sessionId && this.runManager.isThreadLoaded(tab.sessionId)) {
        threadId = tab.sessionId
      } else if (tab.sessionId) {
        threadId = await this.runManager.resumeThread(tab.sessionId, options)
        tab.sessionId = threadId
      } else {
        threadId = await this.runManager.startThread(options)
        tab.sessionId = threadId
      }

      const turnId = await this.runManager.startTurn(threadId, options.prompt)

      let resolve!: (value: void) => void
      let reject!: (reason: Error) => void
      const promise = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })

      this.inflightRequests.set(requestId, { requestId, tabId, threadId, turnId, promise, resolve, reject })
      return promise
    } catch (err) {
      tab.activeRequestId = null
      this.setTabStatus(tabId, 'dead')
      const error = err instanceof Error ? err : new Error(String(err))
      this.emit('error', tabId, {
        message: error.message,
        stderrTail: [],
        stdoutTail: [],
        exitCode: null,
        elapsedMs: 0,
        toolCallCount: 0,
      } as EnrichedError)
      this.processQueue(tabId)
      throw error
    }
  }

  private handleNotification(method: string, params: unknown): void {
    const threadId = this.extractThreadId(method, params)
    const tabId = threadId ? this.findTabByThreadId(threadId) : this.findAnyRunningTab()
    if (!tabId) return

    const tab = this.tabs.get(tabId)
    if (!tab) return
    tab.lastActivityAt = Date.now()

    const events = normalizeNotification(method, params)
    for (const event of events) {
      if (event.type === 'session_init') {
        tab.sessionId = event.sessionId
        if (this.initRequestIds.has(tab.activeRequestId || '')) {
          this.emit('event', tabId, { ...event, isWarmup: true })
          continue
        }
        if (tab.status === 'connecting') this.setTabStatus(tabId, 'running')
      }

      if (event.type === 'task_complete' && tab.sessionId) {
        event.sessionId = tab.sessionId
      }

      if (!this.initRequestIds.has(tab.activeRequestId || '')) {
        this.emit('event', tabId, event)
      }
    }

    if (method === 'turn/completed') {
      this.finishTabRequest(tabId)
    }
  }

  private finishTabRequest(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab?.activeRequestId) return
    const requestId = tab.activeRequestId
    const inflight = this.inflightRequests.get(requestId)

    tab.activeRequestId = null
    tab.runPid = null

    if (this.initRequestIds.has(requestId)) {
      this.initRequestIds.delete(requestId)
      this.setTabStatus(tabId, 'idle')
    }

    if (inflight) {
      inflight.resolve()
      this.inflightRequests.delete(requestId)
    }

    this.processQueue(tabId)
  }

  private extractThreadId(method: string, params: unknown): string | null {
    if (method === 'thread/started') {
      const p = params as { thread?: { id?: string } }
      return typeof p.thread?.id === 'string' ? p.thread.id : null
    }

    if (params && typeof params === 'object' && 'threadId' in params) {
      const threadId = (params as { threadId?: unknown }).threadId
      return typeof threadId === 'string' ? threadId : null
    }

    return null
  }

  private findTabByThreadId(threadId: string): string | null {
    for (const [tabId, tab] of this.tabs) {
      if (tab.sessionId === threadId) return tabId
    }
    return null
  }

  private findAnyRunningTab(): string | null {
    for (const [tabId, tab] of this.tabs) {
      if (tab.activeRequestId) return tabId
    }
    return null
  }

  private processQueue(tabId: string): void {
    const idx = this.requestQueue.findIndex((r) => r.tabId === tabId)
    if (idx === -1) return
    const req = this.requestQueue.splice(idx, 1)[0]
    this.dispatch(tabId, req.requestId, req.options)
      .then((v) => {
        req.resolve(v)
        for (const waiter of req.extraWaiters) waiter.resolve(v)
      })
      .catch((e) => {
        req.reject(e)
        for (const waiter of req.extraWaiters) waiter.reject(e)
      })
  }

  private handleDisconnect(): void {
    log('WebSocket disconnected — marking inflight tabs as dead')
    this.initialized = false
    for (const [requestId, inflight] of this.inflightRequests) {
      const tab = this.tabs.get(inflight.tabId)
      if (!tab) continue

      this.emit('event', inflight.tabId, {
        type: 'session_dead',
        exitCode: null,
        signal: null,
        stderrTail: ['WebSocket connection lost'],
      })

      tab.activeRequestId = null
      tab.runPid = null
      this.setTabStatus(inflight.tabId, 'dead')
      inflight.reject(new Error('WebSocket connection lost'))
      this.inflightRequests.delete(requestId)
    }
  }

  private setTabStatus(tabId: string, newStatus: TabStatus): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return
    const oldStatus = tab.status
    if (oldStatus === newStatus) return
    tab.status = newStatus
    this.emit('tab-status-change', tabId, newStatus, oldStatus)
  }
}
