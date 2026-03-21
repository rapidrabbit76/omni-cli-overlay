import React, { useEffect, useCallback, useRef, useState, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Paperclip, Camera } from '@phosphor-icons/react'
import { TabStrip } from './components/TabStrip'
import { ConversationView } from './components/ConversationView'
import { InputBar } from './components/InputBar'
import { StatusBar } from './components/StatusBar'
import { CommandPalette, type PaletteMode, type PaletteItem } from './components/CommandPalette'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { useCodexEvents } from './hooks/useCodexEvents'
import { FLOAT_LAYOUT_EVENT } from './hooks/useFloatTransition'
import { useHealthReconciliation } from './hooks/useHealthReconciliation'
import { useKeybindings } from './hooks/useKeybindings'
import { useSessionStore, initSessionDefaults, getReasoningLevelsForModel } from './stores/sessionStore'
import { useColors, useThemeStore, spacing, initSettingsFromFile } from './theme'
import { HISTORY_PICKER_OPEN_EVENT } from './components/HistoryPicker'
import type { KeybindingAction } from '../shared/types'

const TRANSITION = { duration: 0.26, ease: [0.4, 0, 0.1, 1] as const }
const WINDOW_PAD = 32

function measureAllUI(): { width: number; height: number } {
  const els = document.querySelectorAll('[data-oco-ui]')
  if (els.length === 0) return { width: 400, height: 200 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  // Track width bounds separately: non-interactive floats (hover tooltips
  // with pointer-events:none) must NOT widen the window, but real interactive
  // popovers should.
  let wMinX = Infinity, wMaxX = -Infinity
  els.forEach((el) => {
    const element = el as HTMLElement
    const isFloat = element.hasAttribute('data-oco-float')
    const measureWhenHidden = element.hasAttribute('data-oco-measure-when-hidden')
    const style = window.getComputedStyle(element)
    if (style.visibility === 'hidden' && !measureWhenHidden) return
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return
    minY = Math.min(minY, r.top)
    maxY = Math.max(maxY, r.bottom)
    minX = Math.min(minX, r.left)
    maxX = Math.max(maxX, r.right)
    // Include in width measurement if it's a non-float element, OR an
    // interactive float (pointer-events !== 'none'), OR explicitly marked
    // for measurement during the hidden-measuring phase.
    if (!isFloat || measureWhenHidden || style.pointerEvents !== 'none') {
      wMinX = Math.min(wMinX, r.left)
      wMaxX = Math.max(wMaxX, r.right)
    }
  })
  if (!isFinite(minX)) return { width: 400, height: 200 }
  const finalMinX = isFinite(wMinX) ? wMinX : minX
  const finalMaxX = isFinite(wMaxX) ? wMaxX : maxX
  return {
    width: Math.round(finalMaxX - finalMinX + WINDOW_PAD * 2),
    height: Math.round(maxY - minY + WINDOW_PAD * 2),
  }
}

const SHRINK_DELAY_MS = 180

function useAutoWindowSize(ref: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let rafId = 0
    let prevW = 0
    let prevH = 0
    let shrinkTimer = 0
    let mutDebounceTimer = 0
    let floatBoundsFrozen = false

    const applySize = (width: number, height: number) => {
      prevW = width
      prevH = height
      window.oco.setWindowBounds(width, height)
    }

    const runSync = (force = false) => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const hasFloats = !!document.querySelector('[data-oco-float]')
        if (!hasFloats) floatBoundsFrozen = false
        if (hasFloats && floatBoundsFrozen && !force) return
        const { width, height } = measureAllUI()
        // Deadband: ignore sub-pixel changes while floats are visible.
        // Transform-based entrance animations (y: 4 → 0) shift
        // getBoundingClientRect() by a few px per frame, causing
        // setWindowBounds() thrash without meaningful layout change.
        const FLOAT_DEADBAND = 4
        const dw = Math.abs(width - prevW)
        const dh = Math.abs(height - prevH)
        if (hasFloats && dw <= FLOAT_DEADBAND && dh <= FLOAT_DEADBAND) {
          if (force) floatBoundsFrozen = true
          return
        }
        if (!hasFloats && width === prevW && height === prevH) return
        const isGrowing = width > prevW || height > prevH
        if (isGrowing) {
          clearTimeout(shrinkTimer)
          applySize(width, height)
          if (hasFloats) floatBoundsFrozen = true
        } else if (hasFloats) {
          clearTimeout(shrinkTimer)
          if (force) floatBoundsFrozen = true
        } else {
          clearTimeout(shrinkTimer)
          shrinkTimer = window.setTimeout(() => applySize(width, height), SHRINK_DELAY_MS)
        }
      })
    }

    const sync = () => runSync(false)

    const observer = new ResizeObserver(sync)
    observer.observe(el)

    const mutObserver = new MutationObserver((mutations) => {
      const hasFloatMutation = mutations.some((mutation) => {
        const added = Array.from(mutation.addedNodes)
        const removed = Array.from(mutation.removedNodes)
        return [...added, ...removed].some((node) => {
          if (!(node instanceof HTMLElement)) return false
          return node.matches('[data-oco-float]') || !!node.querySelector('[data-oco-float]')
        })
      })
      if (!hasFloatMutation) return
      clearTimeout(mutDebounceTimer)
      mutDebounceTimer = window.setTimeout(() => runSync(true), 60)
    })
    mutObserver.observe(document.body, { childList: true, subtree: true })

    const onFloatLayout = () => runSync(true)
    window.addEventListener(FLOAT_LAYOUT_EVENT, onFloatLayout)

    const zoomMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    zoomMql.addEventListener('change', sync)

    return () => {
      observer.disconnect()
      mutObserver.disconnect()
      window.removeEventListener(FLOAT_LAYOUT_EVENT, onFloatLayout)
      zoomMql.removeEventListener('change', sync)
      cancelAnimationFrame(rafId)
      clearTimeout(mutDebounceTimer)
      clearTimeout(shrinkTimer)
    }
  }, [ref])
}

function modelItems(models: Array<{ id: string; label: string }>, currentModel: string | null): PaletteItem[] {
  return models.map((m) => ({
    id: m.id,
    label: m.label,
    description: m.id,
    active: m.id === currentModel,
  }))
}

function reasoningItems(levels: Array<{ id: string; label: string }>, currentLevel: string | null): PaletteItem[] {
  return levels.map((r) => ({
    id: r.id,
    label: r.label,
    active: r.id === currentLevel,
  }))
}

export default function App() {
  useCodexEvents()
  useHealthReconciliation()

  const activeTabStatus = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.status)
  const addAttachments = useSessionStore((s) => s.addAttachments)
  const colors = useColors()
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme)
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const overlayOpacity = useThemeStore((s) => s.overlayOpacity)

  useEffect(() => { initSettingsFromFile(); initSessionDefaults() }, [])

  useEffect(() => {
    window.oco.getTheme().then(({ isDark }) => {
      setSystemTheme(isDark)
    }).catch(() => {})

    const unsub = window.oco.onThemeChange((isDark) => {
      setSystemTheme(isDark)
    })
    return unsub
  }, [setSystemTheme])

  useEffect(() => {
    useSessionStore.getState().initStaticInfo().then(() => {
      const homeDir = useSessionStore.getState().staticInfo?.homePath || '~'
      const tab = useSessionStore.getState().tabs[0]
      if (tab) {
        useSessionStore.setState((s) => ({
          tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, workingDirectory: homeDir, hasChosenDirectory: false } : t)),
        }))
        window.oco.createTab().then(({ tabId }) => {
          useSessionStore.setState((s) => ({
            tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, id: tabId } : t)),
            activeTabId: tabId,
          }))
        }).catch(() => {})
      }
    })
  }, [])

  const isDraggingRef = useRef(false)

  useEffect(() => {
    if (!window.oco?.setIgnoreMouseEvents) return
    let lastIgnored: boolean | null = null

    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const isUI = !!(el && (el.closest('[data-oco-ui]') || el.closest('[data-oco-float]')))
      const shouldIgnore = !isUI
      if (shouldIgnore !== lastIgnored) {
        lastIgnored = shouldIgnore
        if (shouldIgnore) {
          window.oco.setIgnoreMouseEvents(true, { forward: true })
        } else {
          window.oco.setIgnoreMouseEvents(false)
        }
      }
    }

    const onMouseLeave = () => {
      if (isDraggingRef.current) return
      if (lastIgnored !== true) {
        lastIgnored = true
        window.oco.setIgnoreMouseEvents(true, { forward: true })
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  const isExpanded = useSessionStore((s) => s.isExpanded)
  const isRunning = activeTabStatus === 'running' || activeTabStatus === 'connecting'

  const contentWidth = expandedUI ? 700 : spacing.contentWidth
  const cardExpandedWidth = expandedUI ? 700 : 460
  const cardCollapsedWidth = expandedUI ? 670 : 430
  const cardCollapsedMargin = expandedUI ? 15 : 15
  const bodyMaxHeight = expandedUI ? 520 : 400

  const contentRef = useRef<HTMLDivElement>(null)
  useAutoWindowSize(contentRef)

  const handleScreenshot = useCallback(async () => {
    const result = await window.oco.takeScreenshot()
    if (!result) return
    addAttachments([result])
  }, [addAttachments])

  const handleAttachFile = useCallback(async () => {
    const files = await window.oco.attachFiles()
    if (!files || files.length === 0) return
    addAttachments(files)
  }, [addAttachments])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('model')
  const [paletteItems, setPaletteItems] = useState<PaletteItem[]>([])
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [paletteTitle, setPaletteTitle] = useState('')
  const openPalette = useCallback((mode: PaletteMode) => {
    const store = useSessionStore.getState()
    let items: PaletteItem[] = []
    let title = ''
    let initialIndex = 0

    if (mode === 'model') {
      items = modelItems(store.availableModels, store.preferredModel || store.tabs.find((t) => t.id === store.activeTabId)?.sessionModel || null)
      title = 'Switch Model'
      initialIndex = Math.max(0, items.findIndex((item) => item.active))
    } else if (mode === 'reasoning') {
      const levels = getReasoningLevelsForModel({ availableModels: store.availableModels, preferredModel: store.preferredModel })
      items = reasoningItems(levels, store.preferredReasoning)
      title = 'Reasoning Level'
      initialIndex = Math.max(0, items.findIndex((item) => item.active))
    } else if (mode === 'history') {
      window.dispatchEvent(new Event(HISTORY_PICKER_OPEN_EVENT))
      return
    }

    setPaletteMode(mode)
    setPaletteItems(items)
    setPaletteTitle(title)
    setPaletteIndex(initialIndex)
    setPaletteOpen(true)
  }, [])

  const closePalette = useCallback(() => {
    setPaletteOpen(false)
  }, [])

  const handlePaletteSelect = useCallback((item: PaletteItem) => {
    const store = useSessionStore.getState()
    if (paletteMode === 'model') {
      store.setPreferredModel(item.id)
      store.addSystemMessage(`Model → ${item.label}`)
    } else if (paletteMode === 'reasoning') {
      store.setPreferredReasoning(item.id)
      store.addSystemMessage(`Reasoning → ${item.label}`)
    }
    closePalette()
  }, [paletteMode, closePalette])

  const handleAction = useCallback((action: KeybindingAction) => {
    const store = useSessionStore.getState()

    if (action === 'picker.down') {
      setPaletteIndex((i) => Math.min(i + 1, paletteItems.length - 1))
      return
    }
    if (action === 'picker.up') {
      setPaletteIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (action === 'picker.confirm') {
      if (paletteItems[paletteIndex]) handlePaletteSelect(paletteItems[paletteIndex])
      return
    }
    if (action === 'picker.cancel') {
      closePalette()
      return
    }

    if (action === 'chord.model') {
      openPalette('model')
      return
    }
    if (action === 'chord.reasoning') {
      openPalette('reasoning')
      return
    }
    if (action === 'picker.history') {
      openPalette('history')
      return
    }

    if (action.startsWith('tab.') && !isNaN(Number(action.split('.')[1]))) {
      const idx = Number(action.split('.')[1]) - 1
      if (idx < store.tabs.length) {
        store.selectTab(store.tabs[idx].id)
      }
      return
    }
    if (action === 'tab.new') {
      void store.createTab()
      return
    }
    if (action === 'tab.close') {
      store.closeTab(store.activeTabId)
      return
    }
    if (action === 'tab.prev') {
      const idx = store.tabs.findIndex((t) => t.id === store.activeTabId)
      if (idx > 0) store.selectTab(store.tabs[idx - 1].id)
      return
    }
    if (action === 'tab.next') {
      const idx = store.tabs.findIndex((t) => t.id === store.activeTabId)
      if (idx < store.tabs.length - 1) store.selectTab(store.tabs[idx + 1].id)
      return
    }

    if (action === 'action.clear') {
      store.clearTab()
      store.addSystemMessage('Conversation cleared.')
      return
    }
    if (action === 'action.focus') {
      const textarea = document.querySelector<HTMLTextAreaElement>('[data-oco-ui] textarea')
      textarea?.focus()
      return
    }
    if (action === 'action.toggleExpand') {
      store.toggleExpanded()
      return
    }
    if (action === 'action.hide') {
      window.oco.hideWindow()
      return
    }
  }, [paletteItems, paletteIndex, handlePaletteSelect, openPalette, closePalette])

  useKeybindings(undefined, handleAction, paletteOpen)

  return (
    <PopoverLayerProvider>
      <div className="flex flex-col justify-end h-full" style={{ background: 'transparent', opacity: overlayOpacity }}>

        <div ref={contentRef} style={{ width: contentWidth, position: 'relative', margin: '0 auto', transition: 'width 0.26s cubic-bezier(0.4, 0, 0.1, 1)' }}>

          <AnimatePresence initial={false} />

          <motion.div
            data-oco-ui
            className="overflow-hidden flex flex-col"
            onMouseDown={(e: React.MouseEvent) => {
              const target = e.target as HTMLElement
              if (target.closest('button, input, select, textarea, [data-no-drag]')) return
              e.preventDefault()
              isDraggingRef.current = true
              window.oco.setIgnoreMouseEvents(false)
              let lastX = e.screenX
              let lastY = e.screenY
              const onMove = (ev: MouseEvent) => {
                const dx = ev.screenX - lastX
                const dy = ev.screenY - lastY
                if (dx !== 0 || dy !== 0) {
                  window.oco.dragMove(dx, dy)
                  lastX = ev.screenX
                  lastY = ev.screenY
                }
              }
              const onUp = () => {
                isDraggingRef.current = false
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
              }
              document.addEventListener('mousemove', onMove)
              document.addEventListener('mouseup', onUp)
            }}
            animate={{
              width: isExpanded ? cardExpandedWidth : cardCollapsedWidth,
              marginBottom: isExpanded ? 10 : -14,
              marginLeft: isExpanded ? 0 : cardCollapsedMargin,
              marginRight: isExpanded ? 0 : cardCollapsedMargin,
              background: isExpanded ? colors.containerBg : colors.containerBgCollapsed,
              borderColor: colors.containerBorder,
              boxShadow: isExpanded ? colors.cardShadow : colors.cardShadowCollapsed,
            }}
            transition={TRANSITION}
            style={{
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: 20,
              position: 'relative',
              zIndex: isExpanded ? 20 : 10,
            }}
          >
            <div className="no-drag">
              <TabStrip />
            </div>

            <motion.div
              initial={false}
              animate={{
                height: isExpanded ? 'auto' : 0,
                opacity: isExpanded ? 1 : 0,
              }}
              transition={TRANSITION}
              className="overflow-hidden no-drag"
            >
              <div style={{ maxHeight: bodyMaxHeight }}>
                <ConversationView />
                <StatusBar />
              </div>
            </motion.div>
          </motion.div>

          <div data-oco-ui className="relative" style={{ minHeight: 46, zIndex: 15, marginBottom: 10 }}>
            <div
              data-oco-ui
              className="glass-surface w-full"
              style={{ minHeight: 50, borderRadius: 25, padding: '0 6px 0 16px', background: colors.inputPillBg }}
            >
              <InputBar />
            </div>

            <div data-oco-ui className="quick-action-bar">
              <button
                type="button"
                className="quick-action-chip"
                style={{ background: colors.surfacePrimary, color: colors.textSecondary, border: `1px solid ${colors.containerBorder}` }}
                onClick={handleAttachFile}
                disabled={isRunning}
              >
                <Paperclip size={14} weight="bold" />
              </button>
              <button
                type="button"
                className="quick-action-chip"
                style={{ background: colors.surfacePrimary, color: colors.textSecondary, border: `1px solid ${colors.containerBorder}` }}
                onClick={handleScreenshot}
                disabled={isRunning}
              >
                <Camera size={14} weight="bold" />
              </button>

            </div>
          </div>
        </div>

        <CommandPalette
          open={paletteOpen}
          mode={paletteMode}
          items={paletteItems}
          selectedIndex={paletteIndex}
          title={paletteTitle}
          onSelect={handlePaletteSelect}
          onClose={closePalette}
        />
      </div>
    </PopoverLayerProvider>
  )
}
