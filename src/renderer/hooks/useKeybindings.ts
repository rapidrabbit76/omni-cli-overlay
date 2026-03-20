import { useEffect, useRef, useCallback } from 'react'
import { DEFAULT_KEYBINDINGS } from '../../shared/types'
import type { KeybindingMap, KeybindingAction } from '../../shared/types'

const CHORD_TIMEOUT_MS = 2000

function eventToKey(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.metaKey) parts.push('Meta')
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  const key = e.key
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return parts.join('+')

  if (key === ' ') parts.push('Space')
  else if (key.length === 1) parts.push(key.toUpperCase())
  else if (key === 'ArrowUp') parts.push('Up')
  else if (key === 'ArrowDown') parts.push('Down')
  else if (key === 'ArrowLeft') parts.push('Left')
  else if (key === 'ArrowRight') parts.push('Right')
  else parts.push(key)

  return parts.join('+')
}

function bareKey(e: KeyboardEvent): string {
  const key = e.key
  if (key.length === 1) return key.toUpperCase()
  return key
}

type ActionHandler = (action: KeybindingAction) => void

export function useKeybindings(
  keybindings: KeybindingMap = DEFAULT_KEYBINDINGS,
  onAction: ActionHandler,
  paletteOpen: boolean,
): void {
  const chordActiveRef = useRef(false)
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearChord = useCallback(() => {
    chordActiveRef.current = false
    if (chordTimerRef.current) {
      clearTimeout(chordTimerRef.current)
      chordTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT'
      const combo = eventToKey(e)

      if (chordActiveRef.current) {
        e.preventDefault()
        e.stopPropagation()
        clearChord()

        const key = bareKey(e)
        if (key === keybindings['chord.reasoning'].toUpperCase()) {
          onAction('chord.reasoning')
          return
        }
        if (key === keybindings['chord.model'].toUpperCase()) {
          onAction('chord.model')
          return
        }
        return
      }

      if (paletteOpen) {
        if (combo === keybindings['picker.down']) {
          e.preventDefault()
          onAction('picker.down')
          return
        }
        if (combo === keybindings['picker.up']) {
          e.preventDefault()
          onAction('picker.up')
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onAction('picker.down')
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          onAction('picker.up')
          return
        }
        if (combo === keybindings['picker.confirm'] || e.key === 'Enter') {
          e.preventDefault()
          onAction('picker.confirm')
          return
        }
        if (combo === keybindings['picker.cancel'] || e.key === 'Escape') {
          e.preventDefault()
          onAction('picker.cancel')
          return
        }
        return
      }

      if (combo === keybindings['chord.prefix']) {
        e.preventDefault()
        chordActiveRef.current = true
        chordTimerRef.current = setTimeout(clearChord, CHORD_TIMEOUT_MS)
        return
      }

      if (combo === keybindings['picker.history']) {
        e.preventDefault()
        onAction('picker.history')
        return
      }

      for (let i = 1; i <= 9; i++) {
        const action = `tab.${i}` as KeybindingAction
        if (combo === keybindings[action]) {
          e.preventDefault()
          onAction(action)
          return
        }
      }

      if (combo === keybindings['tab.new']) {
        e.preventDefault()
        onAction('tab.new')
        return
      }
      if (combo === keybindings['tab.close']) {
        e.preventDefault()
        onAction('tab.close')
        return
      }
      if (combo === keybindings['tab.prev']) {
        e.preventDefault()
        onAction('tab.prev')
        return
      }
      if (combo === keybindings['tab.next']) {
        e.preventDefault()
        onAction('tab.next')
        return
      }

      if (combo === keybindings['action.clear']) {
        e.preventDefault()
        onAction('action.clear')
        return
      }
      if (combo === keybindings['action.focus']) {
        e.preventDefault()
        onAction('action.focus')
        return
      }
      if (combo === keybindings['action.toggleExpand']) {
        if (!isInput) {
          e.preventDefault()
          onAction('action.toggleExpand')
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      clearChord()
    }
  }, [keybindings, onAction, paletteOpen, clearChord])
}
