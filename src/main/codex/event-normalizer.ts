import type { NormalizedEvent } from '../../shared/types'

export function normalizeNotification(method: string, params: unknown): NormalizedEvent[] {
  switch (method) {
    case 'thread/started': {
      const p = params as { thread: { id: string } }
      return [{ type: 'session_init', sessionId: p.thread.id, tools: [], model: '', version: 'unknown' }]
    }

    case 'item/agentMessage/delta': {
      const p = params as { delta: string }
      return [{ type: 'text_chunk', text: p.delta }]
    }

    case 'item/started': {
      const p = params as { item: { type: string; id: string; command?: string; tool?: string; changes?: unknown[] } }
      const item = p.item
      if (item.type === 'commandExecution') {
        return [{ type: 'tool_call', toolName: 'Shell', toolId: item.id, index: 0, input: item.command || '' }]
      }
      if (item.type === 'fileChange') {
        return [{ type: 'tool_call', toolName: 'Edit', toolId: item.id, index: 0, input: JSON.stringify(item.changes || []) }]
      }
      if (item.type === 'mcpToolCall') {
        return [{ type: 'tool_call', toolName: item.tool || 'MCP', toolId: item.id, index: 0, input: '' }]
      }
      return []
    }

    case 'item/completed': {
      const p = params as { item: { type: string; id: string; status?: string; exitCode?: number; text?: string } }
      const item = p.item
      if (item.type === 'commandExecution') {
        const success = item.status === 'completed' || item.exitCode === 0
        return [{ type: 'tool_call_complete', index: 0, toolId: item.id, success }]
      }
      if (item.type === 'fileChange' || item.type === 'mcpToolCall') {
        return [{ type: 'tool_call_complete', index: 0, toolId: item.id, success: true }]
      }
      return []
    }

    case 'turn/completed': {
      const p = params as { turn: { id: string; status: string; error?: { message: string } | null } }
      if (p.turn.status === 'failed' && p.turn.error) {
        return [{ type: 'error', message: p.turn.error.message, isError: true }]
      }
      return [{ type: 'task_complete', result: '', costUsd: 0, durationMs: 0, numTurns: 1, usage: {}, sessionId: '' }]
    }

    case 'error': {
      const p = params as { error: { message: string } }
      return [{ type: 'error', message: p.error?.message || 'Unknown error', isError: true }]
    }

    default:
      return []
  }
}
