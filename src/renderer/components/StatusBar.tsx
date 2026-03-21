import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, CaretDown, Check, FolderOpen, Plus, X, Lightning } from '@phosphor-icons/react'
import { useSessionStore, getReasoningLevelsForModel } from '../stores/sessionStore'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'
import { FLOAT_LAYOUT_EVENT, useFloatTransition } from '../hooks/useFloatTransition'

/* ─── Model Picker (inline — tightly coupled to StatusBar) ─── */

function ModelPicker() {
  const preferredModel = useSessionStore((s) => s.preferredModel)
  const setPreferredModel = useSessionStore((s) => s.setPreferredModel)
  const preferredReasoning = useSessionStore((s) => s.preferredReasoning)
  const setPreferredReasoning = useSessionStore((s) => s.setPreferredReasoning)
  const availableModels = useSessionStore((s) => s.availableModels)
  const tab = useSessionStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId),
    (a, b) => a === b || (!!a && !!b && a.status === b.status && a.sessionModel === b.sessionModel),
  )
  const popoverLayer = usePopoverLayer()
  const colors = useColors()

  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ bottom: 0, left: 0 })
  const { mounted: floatMounted, visible: floatVisible, measuring: floatMeasuring } = useFloatTransition(open)

  const isBusy = tab?.status === 'running' || tab?.status === 'connecting'

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      bottom: window.innerHeight - rect.top + 6,
      left: rect.left,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const update = () => updatePos()
    window.addEventListener('resize', update)
    window.addEventListener(FLOAT_LAYOUT_EVENT, update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener(FLOAT_LAYOUT_EVENT, update)
    }
  }, [open, updatePos])

  const handleToggle = () => {
    if (isBusy) return
    if (!open) updatePos()
    setOpen((o) => !o)
  }

  const activeModelLabel = (() => {
    if (preferredModel) {
      const m = availableModels.find((m) => m.id === preferredModel)
      return m?.label || preferredModel
    }
    if (tab?.sessionModel) {
      const m = availableModels.find((m) => m.id === tab.sessionModel)
      return m?.label || tab.sessionModel
    }
    const defaultModel = availableModels.find((m) => m.isDefault)
    return defaultModel?.label || availableModels[0]?.label || 'Model'
  })()

  const reasoningLevels = getReasoningLevelsForModel({ availableModels, preferredModel })

  const activeReasoningLabel = (() => {
    const r = reasoningLevels.find((r) => r.id === preferredReasoning)
    return r?.label || 'Med'
  })()

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={handleToggle}
        className="flex items-center gap-0.5 text-[10px] rounded-full px-1.5 py-0.5 transition-colors"
        style={{
          color: colors.textTertiary,
          cursor: isBusy ? 'not-allowed' : 'pointer',
        }}
        title={isBusy ? 'Stop the task to change model' : 'Switch model & reasoning'}
      >
        {activeModelLabel}
        <span style={{ color: colors.accent, fontWeight: 600, marginLeft: 2 }}>{activeReasoningLabel}</span>
        <CaretDown size={10} style={{ opacity: 0.6 }} />
      </button>

      {popoverLayer && floatMounted && createPortal(
        <motion.div
          ref={popoverRef}
          data-oco-ui
          data-oco-float
          data-oco-measure-when-hidden={floatMeasuring ? 'true' : undefined}
          initial={{ opacity: 0, y: 4 }}
          animate={floatVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="rounded-xl"
          style={{
            position: 'fixed',
            bottom: pos.bottom,
            left: pos.left,
            width: 220,
            pointerEvents: floatVisible ? 'auto' as const : 'none' as const,
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            visibility: floatVisible ? 'visible' as const : 'hidden' as const,
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
          }}
        >
          <div className="py-1">
            <div className="px-3 py-1 text-[9px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
              Model
            </div>
            {availableModels.map((m) => {
              const defaultModelId = availableModels.find((dm) => dm.isDefault)?.id || availableModels[0]?.id
              const isSelected = preferredModel === m.id || (!preferredModel && m.id === defaultModelId)
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => { setPreferredModel(m.id); setOpen(false) }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors"
                  style={{
                    color: isSelected ? colors.textPrimary : colors.textSecondary,
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {m.label}
                  {isSelected && <Check size={12} style={{ color: colors.accent }} />}
                </button>
              )
            })}

            <div className="mx-2 my-1" style={{ height: 1, background: colors.popoverBorder }} />

            <div className="px-3 py-1 text-[9px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
              Reasoning Effort
            </div>
            <div className="flex gap-1 px-3 py-1.5">
              {reasoningLevels.map((r) => {
                const defaultEffort = availableModels.find((m) => m.id === preferredModel)?.defaultReasoningEffort || 'medium'
                const isActive = preferredReasoning === r.id || (!preferredReasoning && r.id === defaultEffort)
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => { setPreferredReasoning(r.id); setOpen(false) }}
                    className="flex-1 py-1 rounded-md text-[10px] font-medium transition-colors"
                    style={{
                      background: isActive ? colors.accent : colors.surfaceSecondary,
                      color: isActive ? '#fff' : colors.textSecondary,
                      border: `1px solid ${isActive ? colors.accent : colors.containerBorder}`,
                    }}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}

const RING_SIZE = 18
const RING_STROKE = 2.5
const RING_R = (RING_SIZE - RING_STROKE) / 2
const RING_C = 2 * Math.PI * RING_R

function RingGauge({ percent, color }: { percent: number; color: string }) {
  const colors = useColors()
  const clamped = Math.min(100, Math.max(0, percent))
  const offset = RING_C - (clamped / 100) * RING_C
  return (
    <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
      <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke={colors.surfaceSecondary} strokeWidth={RING_STROKE} />
      <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke={color} strokeWidth={RING_STROKE} strokeDasharray={RING_C} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  )
}

function UsageIndicator() {
  const rateLimits = useSessionStore((s) => s.rateLimits)
  const tokenUsage = useSessionStore((s) => {
    const sid = s.tabs.find((t) => t.id === s.activeTabId)?.sessionId
    return sid ? s.tokenUsageByThread[sid] ?? null : null
  })
  const colors = useColors()
  const popoverLayer = usePopoverLayer()
  const [now, setNow] = useState(Date.now())
  const [hover, setHover] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ bottom: 0, left: 0 })

  useEffect(() => {
    if (!hover || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left + rect.width / 2,
    })
  }, [hover])

  useEffect(() => {
    if (!rateLimits?.resetsAt) return
    const interval = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(interval)
  }, [rateLimits?.resetsAt])

  if (!rateLimits) return null

  const pct = rateLimits.usedPercent || 0
  let ringColor = '#4ade80'
  if (pct >= 60) ringColor = '#facc15'
  if (pct >= 85) ringColor = '#f87171'

  const ctxWindow = tokenUsage?.modelContextWindow && tokenUsage.modelContextWindow > 0
    ? tokenUsage.modelContextWindow
    : null
  const ctxPct = ctxWindow && tokenUsage
    ? Math.min(100, (tokenUsage.inputTokens / ctxWindow) * 100)
    : 0
  let ctxColor = '#4ade80'
  if (ctxPct >= 60) ctxColor = '#facc15'
  if (ctxPct >= 85) ctxColor = '#f87171'

  const tooltipLines: string[] = []
  tooltipLines.push(`Rate limit  ${pct.toFixed(1)}%`)
  if (rateLimits.resetsAt) {
    const mins = Math.max(0, Math.ceil((rateLimits.resetsAt - now) / 60000))
    tooltipLines.push(`Resets in ${mins}m`)
  }
  if (rateLimits.planType) tooltipLines.push(`Plan: ${rateLimits.planType}`)
  tooltipLines.push('')
  if (tokenUsage && ctxWindow) {
    tooltipLines.push(`Context  ${Math.round(ctxPct)}%  (${tokenUsage.inputTokens.toLocaleString()} / ${ctxWindow.toLocaleString()})`)
  } else if (tokenUsage) {
    tooltipLines.push(`Context  —`)
  }
  if (tokenUsage) {
    tooltipLines.push(`In: ${tokenUsage.inputTokens.toLocaleString()}  (cached ${tokenUsage.cachedInputTokens.toLocaleString()})`)
    tooltipLines.push(`Out: ${tokenUsage.outputTokens.toLocaleString()}  (reasoning ${tokenUsage.reasoningOutputTokens.toLocaleString()})`)
  }

  return (
    <div
      ref={triggerRef}
      className="relative flex items-center gap-1.5"
      style={{ cursor: 'default' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <RingGauge percent={ctxPct} color={ctxColor} />

      {hover && popoverLayer && createPortal(
        <div
          data-no-drag
          data-oco-ui
          data-oco-float
          style={{
            position: 'fixed',
            bottom: pos.bottom,
            left: pos.left,
            transform: 'translateX(-50%)',
            background: colors.popoverBg,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${colors.popoverBorder}`,
            borderRadius: 8,
            padding: '6px 10px',
            whiteSpace: 'pre',
            fontSize: 10,
            lineHeight: 1.5,
            color: colors.textSecondary,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            zIndex: 200,
            pointerEvents: 'none',
            minWidth: 180,
          }}
        >
          {tooltipLines.map((line, i) =>
            line === '' ? <div key={`empty-${i}`} style={{ height: 4 }} /> : <div key={`line-${i}`}>{line}</div>,
          )}
        </div>,
        popoverLayer
      )}
    </div>
  )
}

/* ─── StatusBar ─── */

/** Get a compact display path: basename for deep paths, ~ for home */
function compactPath(fullPath: string): string {
  if (fullPath === '~') return '~'
  const parts = fullPath.replace(/\/$/, '').split('/')
  return parts[parts.length - 1] || fullPath
}

export function StatusBar() {
  const tab = useSessionStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId),
    (a, b) => a === b || (!!a && !!b
      && a.status === b.status
      && a.additionalDirs === b.additionalDirs
      && a.hasChosenDirectory === b.hasChosenDirectory
      && a.workingDirectory === b.workingDirectory
      && a.sessionId === b.sessionId
    ),
  )
  const addDirectory = useSessionStore((s) => s.addDirectory)
  const removeDirectory = useSessionStore((s) => s.removeDirectory)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()

  const [dirOpen, setDirOpen] = useState(false)
  const dirRef = useRef<HTMLButtonElement>(null)
  const dirPopRef = useRef<HTMLDivElement>(null)
  const [dirPos, setDirPos] = useState({ bottom: 0, left: 0 })

  // Close popover on outside click
  useEffect(() => {
    if (!dirOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (dirRef.current?.contains(target)) return
      if (dirPopRef.current?.contains(target)) return
      setDirOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dirOpen])

  if (!tab) return null

  const isRunning = tab.status === 'running' || tab.status === 'connecting'
  const isEmpty = tab.messages.length === 0
  const hasExtraDirs = tab.additionalDirs.length > 0

  const handleOpenInTerminal = () => {
    window.oco.openInTerminal(tab.sessionId, tab.workingDirectory)
  }

  const handleDirClick = () => {
    if (isRunning) return
    if (!dirOpen && dirRef.current) {
      const rect = dirRef.current.getBoundingClientRect()
      setDirPos({
        bottom: window.innerHeight - rect.top + 6,
        left: rect.left,
      })
    }
    setDirOpen((o) => !o)
  }

  const handleAddDir = async () => {
    const dir = await window.oco.selectDirectory()
    if (dir) {
      addDirectory(dir)
    }
  }

  const dirTooltip = tab.hasChosenDirectory
    ? [tab.workingDirectory, ...tab.additionalDirs].join('\n')
    : 'Using home directory by default — click to choose a folder'

  return (
    <div
      className="flex items-center justify-between px-4 py-1.5"
      style={{ minHeight: 28 }}
    >
      {/* Left — directory + model picker */}
      <div className="flex items-center gap-2 text-[11px] min-w-0" style={{ color: colors.textTertiary }}>
        {/* Directory button */}
        <button
          type="button"
          ref={dirRef}
          onClick={handleDirClick}
          className="flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors flex-shrink-0"
          style={{
            color: colors.textTertiary,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            maxWidth: 140,
          }}
          title={dirTooltip}
          disabled={isRunning}
        >
          <FolderOpen size={11} className="flex-shrink-0" />
          <span className="truncate">{tab.hasChosenDirectory ? compactPath(tab.workingDirectory) : '—'}</span>
          {hasExtraDirs && (
            <span style={{ color: colors.textTertiary, fontWeight: 600 }}>+{tab.additionalDirs.length}</span>
          )}
        </button>

        {/* Directory popover */}
        {popoverLayer && dirOpen && createPortal(
          <motion.div
            ref={dirPopRef}
            data-oco-ui
            data-oco-float
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12 }}
            className="rounded-xl"
            style={{
              position: 'fixed',
              bottom: dirPos.bottom,
              left: dirPos.left,
              width: 220,
              pointerEvents: 'auto',
              background: colors.popoverBg,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: colors.popoverShadow,
              border: `1px solid ${colors.popoverBorder}`,
            }}
          >
            <div className="py-1.5 px-1">
              {/* Base directory */}
              <div className="px-2 py-1">
                <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                  Base directory
                </div>
                <div className="text-[11px] truncate" style={{ color: tab.hasChosenDirectory ? colors.textSecondary : colors.textMuted }} title={tab.hasChosenDirectory ? tab.workingDirectory : 'No folder selected — defaults to home directory'}>
                  {tab.hasChosenDirectory ? tab.workingDirectory : 'None (defaults to ~)'}
                </div>
              </div>

              {/* Additional directories */}
              {hasExtraDirs && (
                <>
                  <div className="mx-2 my-1" style={{ height: 1, background: colors.popoverBorder }} />
                  <div className="px-2 py-1">
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
                      Added directories
                    </div>
                    {tab.additionalDirs.map((dir) => (
                      <div key={dir} className="flex items-center justify-between py-0.5 group">
                        <span className="text-[11px] truncate mr-2" style={{ color: colors.textSecondary }} title={dir}>
                          {compactPath(dir)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDirectory(dir)}
                          className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: colors.textTertiary }}
                          title="Remove directory"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="mx-2 my-1" style={{ height: 1, background: colors.popoverBorder }} />

              {/* Add directory button */}
              <button
                type="button"
                onClick={handleAddDir}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] transition-colors rounded-lg"
                style={{ color: colors.accent }}
              >
                <Plus size={10} />
                Add directory...
              </button>
            </div>
          </motion.div>,
          popoverLayer,
        )}

        <span style={{ color: colors.textMuted, fontSize: 10 }}>|</span>

        <ModelPicker />

        <UsageIndicator />

      </div>

      {/* Right — Open in CLI */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={handleOpenInTerminal}
          className="flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 transition-colors"
          style={{ color: colors.textTertiary }}
          title="Open this session in Terminal"
        >
          Open in CLI
          <Terminal size={11} />
        </button>
      </div>
    </div>
  )
}
