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
import { useHealthReconciliation } from './hooks/useHealthReconciliation'
import { useKeybindings } from './hooks/useKeybindings'
import { useSessionStore, initSessionDefaults, AVAILABLE_MODELS, REASONING_LEVELS } from './stores/sessionStore'
import { useColors, useThemeStore, spacing, initSettingsFromFile } from './theme'
import { HISTORY_PICKER_OPEN_EVENT } from './components/HistoryPicker'
import type { KeybindingAction } from '../shared/types'

const TRANSITION = { duration: 0.26, ease: [0.4, 0, 0.1, 1] as const }
const WINDOW_PAD = 32

function measureAllUI(): { width: number; height: number } {
  const els = document.querySelectorAll('[data-oco-ui]:not([data-oco-float])')
  if (els.length === 0) return { width: 400, height: 200 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  els.forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return
    minX = Math.min(minX, r.left)
    minY = Math.min(minY, r.top)
    maxX = Math.max(maxX, r.right)
    maxY = Math.max(maxY, r.bottom)
  })
  if (!isFinite(minX)) return { width: 400, height: 200 }
  return {
    width: Math.round(maxX - minX + WINDOW_PAD * 2),
    height: Math.round(maxY - minY + WINDOW_PAD * 2),
  }
}

function useAutoWindowSize(ref: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let rafId = 0
    let prevW = 0
    let prevH = 0

    const sync = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const { width, height } = measureAllUI()
        if (width === prevW && height === prevH) return
        prevW = width
        prevH = height
        window.oco.setWindowWidth(width)
        window.oco.resizeHeight(height)
      })
    }

    const observer = new ResizeObserver(sync)
    observer.observe(el)

    const mutObserver = new MutationObserver(sync)
    mutObserver.observe(document.body, { childList: true, subtree: true })

    const zoomMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    zoomMql.addEventListener('change', sync)

    return () => {
      observer.disconnect()
      mutObserver.disconnect()
      zoomMql.removeEventListener('change', sync)
      cancelAnimationFrame(rafId)
    }
  }, [ref])
}

function modelItems(currentModel: string | null): PaletteItem[] {
  return AVAILABLE_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    description: m.id,
    active: m.id === currentModel,
  }))
}

function reasoningItems(currentLevel: string | null): PaletteItem[] {
  return REASONING_LEVELS.map((r) => ({
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
      items = modelItems(store.preferredModel || store.tabs.find((t) => t.id === store.activeTabId)?.sessionModel || null)
      title = 'Switch Model'
      initialIndex = Math.max(0, items.findIndex((item) => item.active))
    } else if (mode === 'reasoning') {
      items = reasoningItems(store.preferredReasoning)
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
              className="circles-out"
            >
              <div className="btn-stack">
                <button
                  type="button"
                  className="stack-btn stack-btn-1 glass-surface"
                  title="Attach file"
                  onClick={handleAttachFile}
                  disabled={isRunning}
                >
                  <Paperclip size={17} />
                </button>
                <button
                  type="button"
                  className="stack-btn stack-btn-2 glass-surface"
                  title="Take screenshot"
                  onClick={handleScreenshot}
                  disabled={isRunning}
                >
                  <Camera size={17} />
                </button>
              </div>
            </div>

            <div
              data-oco-ui
              className="glass-surface w-full"
              style={{ minHeight: 50, borderRadius: 25, padding: '0 6px 0 16px', background: colors.inputPillBg }}
            >
              <InputBar />
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
