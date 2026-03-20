import { homedir } from 'os'
import { WsTransport } from './ws-transport'
import type { RunOptions } from '../../shared/types'
import type { ThreadStartResponse } from '../../shared/codex-protocol/v2/ThreadStartResponse'
import type { ThreadResumeResponse } from '../../shared/codex-protocol/v2/ThreadResumeResponse'
import type { TurnStartResponse } from '../../shared/codex-protocol/v2/TurnStartResponse'
import type { UserInput } from '../../shared/codex-protocol/v2/UserInput'

function resolveHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return `${homedir()}/${path.slice(2)}`
  return path
}

export class RunManager {
  private loadedThreadIds = new Set<string>()

  constructor(private transport: WsTransport) {}

  async startThread(options: RunOptions): Promise<string> {
    const approvalPolicy = options.autoApprove ? 'on-request' : 'unless-allow-listed'
    const sandbox = options.yoloMode ? 'danger-full-access' : 'workspace-write'
    const result = await this.transport.request<ThreadStartResponse>('thread/start', {
      model: options.model || undefined,
      cwd: resolveHomePath(options.projectPath),
      approvalPolicy,
      sandbox,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
      config: options.reasoningEffort
        ? { model_reasoning_effort: options.reasoningEffort }
        : undefined,
    })
    this.loadedThreadIds.add(result.thread.id)
    return result.thread.id
  }

  async resumeThread(threadId: string, options: RunOptions): Promise<string> {
    const approvalPolicy = options.autoApprove ? 'on-request' : 'unless-allow-listed'
    const sandbox = options.yoloMode ? 'danger-full-access' : 'workspace-write'
    const result = await this.transport.request<ThreadResumeResponse>('thread/resume', {
      threadId,
      model: options.model || undefined,
      cwd: resolveHomePath(options.projectPath),
      approvalPolicy,
      sandbox,
      persistExtendedHistory: false,
      config: options.reasoningEffort
        ? { model_reasoning_effort: options.reasoningEffort }
        : undefined,
    })
    this.loadedThreadIds.add(result.thread.id)
    return result.thread.id
  }

  isThreadLoaded(threadId: string): boolean {
    return this.loadedThreadIds.has(threadId)
  }

  async startTurn(threadId: string, prompt: string, images?: string[]): Promise<string> {
    const input: UserInput[] = [{ type: 'text', text: prompt, text_elements: [] }]
    if (images) {
      for (const imagePath of images) {
        input.push({ type: 'localImage', path: imagePath })
      }
    }

    const result = await this.transport.request<TurnStartResponse>('turn/start', {
      threadId,
      input,
    })
    return result.turn.id
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.transport.request('turn/interrupt', { threadId, turnId })
  }
}
