import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useColors } from '../theme'
import { useFloatTransition } from '../hooks/useFloatTransition'

export type PaletteMode = 'model' | 'reasoning' | 'history'

export interface PaletteItem {
  id: string
  label: string
  description?: string
  active?: boolean
}

interface CommandPaletteProps {
  open: boolean
  mode: PaletteMode
  items: PaletteItem[]
  selectedIndex: number
  title: string
  onSelect: (item: PaletteItem) => void
  onClose: () => void
}

const MODE_TITLES: Record<PaletteMode, string> = {
  model: 'Switch Model',
  reasoning: 'Reasoning Level',
  history: 'Session History',
}

export function CommandPalette({ open, mode, items, selectedIndex, title, onSelect, onClose }: CommandPaletteProps) {
  const colors = useColors()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.children[selectedIndex] as HTMLElement
    if (selected) selected.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const hintText = mode === 'history' ? 'Ctrl+N/P navigate · Enter select · Esc close' : 'Ctrl+N/P navigate · Enter select · Esc close'

  const { mounted, visible, measuring } = useFloatTransition(open)

  return (
    <AnimatePresence>
      {mounted && (
        <motion.div
          data-oco-ui
          data-oco-float
          data-oco-measure-when-hidden={measuring ? 'true' : undefined}
          initial={{ opacity: 0 }}
          animate={visible ? { opacity: 1 } : { opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.08, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            bottom: 80,
            right: 24,
            width: 220,
            zIndex: 100,
            background: colors.popoverBg,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            visibility: visible ? 'visible' as const : 'hidden' as const,
            pointerEvents: visible ? 'auto' as const : 'none' as const,
            border: `1px solid ${colors.popoverBorder}`,
            borderRadius: 10,
            boxShadow: '0 12px 36px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.15)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '6px 10px 4px',
              borderBottom: `1px solid ${colors.containerBorder}`,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>
              {title || MODE_TITLES[mode]}
            </div>
          </div>

          <div
            ref={listRef}
            style={{
              overflowY: 'auto',
              padding: '2px 0',
            }}
          >
            {items.map((item, i) => {
              const isSelected = i === selectedIndex
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  onMouseEnter={() => {}}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    background: isSelected ? colors.accentSoft : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.08s',
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: item.active ? colors.accent : 'transparent',
                      border: item.active ? 'none' : `1px solid ${colors.textTertiary}`,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: isSelected ? 500 : 400,
                        color: isSelected ? colors.textPrimary : colors.textSecondary,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.label}
                    </div>
                  </div>
                  {isSelected && (
                    <span
                      style={{
                        fontSize: 9,
                        color: colors.accent,
                        flexShrink: 0,
                        fontWeight: 500,
                      }}
                    >
                      ↵
                    </span>
                  )}
                </button>
              )
            })}

            {items.length === 0 && (
              <div style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: colors.textTertiary }}>
                No items available
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
