import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Clock, ChatCircle } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'
import type { SessionMeta } from '../../shared/types'

export const HISTORY_PICKER_OPEN_EVENT = 'oco:open-history-picker'

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function HistoryPicker() {
  const resumeSession = useSessionStore((s) => s.resumeSession)
  const isExpanded = useSessionStore((s) => s.isExpanded)
  const activeTab = useSessionStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId),
    (a, b) => a === b || (!!a && !!b && a.hasChosenDirectory === b.hasChosenDirectory && a.workingDirectory === b.workingDirectory),
  )
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()
  const effectiveProjectPath = activeTab?.hasChosenDirectory
    ? activeTab.workingDirectory
    : (staticInfo?.homePath || activeTab?.workingDirectory || '~')

  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number; maxHeight?: number }>({ right: 0 })

  const updatePos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      if (isExpanded) {
        const top = rect.bottom + 6
        setPos({
          top,
          right: window.innerWidth - rect.right,
          maxHeight: window.innerHeight - top - 12,
        })
      } else {
        setPos({
          bottom: window.innerHeight - rect.top + 6,
          right: window.innerWidth - rect.right,
        })
      }
    } else {
      const top = Math.round(window.innerHeight * 0.25)
      setPos({
        top,
        right: Math.round((window.innerWidth - 320) / 2),
        maxHeight: window.innerHeight - top - 24,
      })
    }
  }, [isExpanded])

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.oco.listSessions(effectiveProjectPath)
      setSessions(result)
    } catch {
      setSessions([])
    }
    setLoading(false)
  }, [effectiveProjectPath])

  const openPicker = useCallback(() => {
    if (!open) {
      updatePos()
      void loadSessions()
      setFocusIndex(0)
      setOpen(true)
    }
  }, [open, updatePos, loadSessions])

  const handleSelect = useCallback((session: SessionMeta) => {
    setOpen(false)
    const title = session.slug
      || (session.firstMessage && session.firstMessage.length > 30
        ? session.firstMessage.substring(0, 27) + '...'
        : session.firstMessage)
      || 'Resumed'
    void resumeSession(session.sessionId, title, effectiveProjectPath)
  }, [resumeSession, effectiveProjectPath])

  useEffect(() => {
    const handler = () => openPicker()
    window.addEventListener(HISTORY_PICKER_OPEN_EVENT, handler)
    return () => window.removeEventListener(HISTORY_PICKER_OPEN_EVENT, handler)
  }, [openPicker])

  useEffect(() => {
    if (!open) return
    const handleMouse = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      const isDown = (e.key === 'ArrowDown') || (e.ctrlKey && e.key === 'n')
      const isUp = (e.key === 'ArrowUp') || (e.ctrlKey && e.key === 'p')
      if (isDown) {
        e.preventDefault()
        e.stopPropagation()
        setFocusIndex((i) => {
          const next = Math.min(i + 1, sessions.length - 1)
          itemRefs.current.get(next)?.scrollIntoView({ block: 'nearest' })
          return next
        })
        return
      }
      if (isUp) {
        e.preventDefault()
        e.stopPropagation()
        setFocusIndex((i) => {
          const next = Math.max(i - 1, 0)
          itemRefs.current.get(next)?.scrollIntoView({ block: 'nearest' })
          return next
        })
        return
      }
      if (e.key === 'Enter' && sessions[focusIndex]) {
        e.preventDefault()
        e.stopPropagation()
        handleSelect(sessions[focusIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouse)
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.removeEventListener('mousedown', handleMouse)
      document.removeEventListener('keydown', handleKey, true)
    }
  }, [open, sessions, focusIndex, handleSelect])

  const handleToggle = () => {
    if (!open) {
      openPicker()
    } else {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
        style={{ color: colors.textTertiary }}
        title="Resume a previous session"
      >
        <Clock size={13} />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          ref={popoverRef}
          data-oco-ui
          data-oco-float
          initial={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          transition={{ duration: 0.12 }}
          className="rounded-xl"
          style={{
            position: 'fixed',
            ...(pos.top != null ? { top: pos.top } : {}),
            ...(pos.bottom != null ? { bottom: pos.bottom } : {}),
            right: pos.right,
            width: 320,
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
            ...(pos.maxHeight != null ? { maxHeight: pos.maxHeight } : {}),
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
          }}
        >
          <div className="px-3 py-2 text-[11px] font-medium flex-shrink-0" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.popoverBorder}` }}>
            Recent Sessions
          </div>

          <div className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight != null ? undefined : 320 }}>
            {loading && (
              <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>
                Loading...
              </div>
            )}

            {!loading && sessions.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>
                No previous sessions found
              </div>
            )}

            {!loading && sessions.map((session, idx) => (
              <button
                key={session.sessionId}
                ref={(el) => { if (el) itemRefs.current.set(idx, el); else itemRefs.current.delete(idx) }}
                onClick={() => handleSelect(session)}
                onMouseEnter={() => setFocusIndex(idx)}
                className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors"
                style={idx === focusIndex ? { background: colors.popoverBorder } : undefined}
              >
                <ChatCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: colors.textTertiary }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] truncate" style={{ color: colors.textPrimary }}>
                    {session.slug || session.firstMessage || session.sessionId.substring(0, 8)}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>
                    <span>{formatTimeAgo(session.lastTimestamp)}</span>
                    {session.slug && session.firstMessage && <span className="truncate">{session.firstMessage}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}
