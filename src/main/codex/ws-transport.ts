import { EventEmitter } from 'events'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

type NotificationHandler = (method: string, params: unknown) => void
type ServerRequestHandler = (id: string, method: string, params: unknown) => void

type JsonRpcInbound = {
  id?: unknown
  method?: unknown
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown } | unknown
}

export class WsTransport {
  private ws: WebSocket | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private nextId = 1
  private notificationEmitter = new EventEmitter()
  private serverRequestEmitter = new EventEmitter()
  private disconnectEmitter = new EventEmitter()
  private desiredUrl: string | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manuallyDisconnected = false

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  async connect(url: string): Promise<void> {
    this.desiredUrl = url
    this.manuallyDisconnected = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.isConnected) return
    await this.establishAndHandshake(url)
  }

  disconnect(): void {
    this.manuallyDisconnected = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.onopen = null
      this.ws.onclose = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }

    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error('WebSocket disconnected'))
    }
    this.pendingRequests.clear()
  }

  request<T>(method: string, params: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket is not connected'))
    }

    const id = `req-${this.nextId++}`
    const payload = { id, method, params }

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject })
      try {
        this.ws?.send(JSON.stringify(payload))
      } catch (err) {
        this.pendingRequests.delete(id)
        reject(err)
      }
    })
  }

  notify(method: string, params?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    const payload = params === undefined ? { method } : { method, params }
    this.ws.send(JSON.stringify(payload))
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationEmitter.on('notification', handler)
  }

  onServerRequest(handler: ServerRequestHandler): void {
    this.serverRequestEmitter.on('server-request', handler)
  }

  onDisconnect(handler: () => void): void {
    this.disconnectEmitter.on('disconnect', handler)
  }

  respondToServerRequest(id: string, result: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }
    this.ws.send(JSON.stringify({ id, result }))
  }

  private async establishAndHandshake(url: string): Promise<void> {
    const ws = await this.openSocket(url)
    this.ws = ws
    ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data)
    }

    ws.onclose = () => {
      this.ws = null
      if (!this.manuallyDisconnected) {
        this.rejectAllPending(new Error('WebSocket connection closed'))
        this.disconnectEmitter.emit('disconnect')
        this.scheduleReconnect()
      }
    }

    ws.onerror = () => {
      if (!this.manuallyDisconnected) {
        this.rejectAllPending(new Error('WebSocket connection error'))
      }
    }

    const initResult = await this.request('initialize', {
      clientInfo: { name: 'oco', version: '0.1.0' },
      capabilities: { experimentalApi: true, optOutNotificationMethods: [] },
    })

    if (!initResult || typeof initResult !== 'object') {
      throw new Error('Invalid initialize response')
    }

    this.notify('initialized')
  }

  private openSocket(url: string): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url)
      const onOpen = () => {
        ws.onerror = null
        resolve(ws)
      }
      const onError = () => {
        ws.onopen = null
        reject(new Error('Failed to open WebSocket connection'))
      }
      ws.onopen = onOpen
      ws.onerror = onError
    })
  }

  private handleMessage(rawData: unknown): void {
    let message: JsonRpcInbound
    try {
      if (typeof rawData !== 'string') {
        return
      }
      const text = rawData
      message = JSON.parse(text) as JsonRpcInbound
    } catch {
      return
    }

    const hasId = typeof message.id === 'string'
    const hasMethod = typeof message.method === 'string'

    if (hasId && !hasMethod) {
      const id = message.id as string
      const pending = this.pendingRequests.get(id)
      if (!pending) return
      this.pendingRequests.delete(id)

      if (message.error !== undefined) {
        pending.reject(this.toRpcError(message.error))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (hasMethod && !hasId) {
      this.notificationEmitter.emit('notification', message.method as string, message.params)
      return
    }

    if (hasMethod && hasId) {
      this.serverRequestEmitter.emit('server-request', message.id as string, message.method as string, message.params)
    }
  }

  private toRpcError(error: unknown): Error {
    if (error && typeof error === 'object' && 'message' in error) {
      const maybeMessage = (error as { message?: unknown }).message
      if (typeof maybeMessage === 'string' && maybeMessage.length > 0) {
        return new Error(maybeMessage)
      }
    }
    return new Error('JSON-RPC error')
  }

  private rejectAllPending(err: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(err)
    }
    this.pendingRequests.clear()
  }

  private scheduleReconnect(): void {
    if (!this.desiredUrl || this.manuallyDisconnected || this.reconnectTimer) {
      return
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.desiredUrl || this.manuallyDisconnected) return

      this.establishAndHandshake(this.desiredUrl)
        .catch(() => {
          this.scheduleReconnect()
        })
    }, 750)
  }
}
