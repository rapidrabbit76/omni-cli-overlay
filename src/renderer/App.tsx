import React, { useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Paperclip, Camera } from '@phosphor-icons/react'
import { TabStrip } from './components/TabStrip'
import { ConversationView } from './components/ConversationView'
import { InputBar } from './components/InputBar'
import { StatusBar } from './components/StatusBar'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { useCodexEvents } from './hooks/useCodexEvents'
import { useHealthReconciliation } from './hooks/useHealthReconciliation'
import { useSessionStore, initSessionDefaults } from './stores/sessionStore'
import { useColors, useThemeStore, spacing, initSettingsFromFile } from './theme'

const TRANSITION = { duration: 0.26, ease: [0.4, 0, 0.1, 1] as const }

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

    // Listen for OS theme changes
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
        // Set working directory to home by default (user hasn't chosen yet)
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
      const isUI = !!(el && el.closest('[data-oco-ui]'))
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


  // Layout dimensions — expandedUI widens and heightens the panel
  const contentWidth = expandedUI ? 700 : spacing.contentWidth
  const cardExpandedWidth = expandedUI ? 700 : 460
  const cardCollapsedWidth = expandedUI ? 670 : 430
  const cardCollapsedMargin = expandedUI ? 15 : 15
  const bodyMaxHeight = expandedUI ? 520 : 400

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

  return (
    <PopoverLayerProvider>
      <div className="flex flex-col justify-end h-full" style={{ background: 'transparent', opacity: overlayOpacity }}>

        {/* ─── 460px content column, centered. Circles overflow left. ─── */}
        <div style={{ width: contentWidth, position: 'relative', margin: '0 auto', transition: 'width 0.26s cubic-bezier(0.4, 0, 0.1, 1)' }}>

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
            {/* Tab strip — always mounted */}
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

          {/* ─── Input row — circles float outside left ─── */}
          {/* marginBottom: shadow buffer so the glass-surface drop shadow isn't clipped at the native window edge */}
          <div data-oco-ui className="relative" style={{ minHeight: 46, zIndex: 15, marginBottom: 10 }}>
            {/* Stacked circle buttons — expand on hover */}
            <div
              data-oco-ui
              className="circles-out"
            >
              <div className="btn-stack">
                {/* btn-1: Attach (front, rightmost) */}
                <button
                  type="button"
                  className="stack-btn stack-btn-1 glass-surface"
                  title="Attach file"
                  onClick={handleAttachFile}
                  disabled={isRunning}
                >
                  <Paperclip size={17} />
                </button>
                {/* btn-2: Screenshot (middle) */}
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

            {/* Input pill */}
            <div
              data-oco-ui
              className="glass-surface w-full"
              style={{ minHeight: 50, borderRadius: 25, padding: '0 6px 0 16px', background: colors.inputPillBg }}
            >
              <InputBar />
            </div>
          </div>
        </div>
      </div>
    </PopoverLayerProvider>
  )
}
