import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useColors } from '../theme'

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-oco-ui
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 320,
            maxHeight: 400,
            zIndex: 100,
            background: colors.popoverBg,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: `1px solid ${colors.popoverBorder}`,
            borderRadius: 14,
            boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '12px 16px 8px',
              borderBottom: `1px solid ${colors.containerBorder}`,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>
              {title || MODE_TITLES[mode]}
            </div>
            <div style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>
              {hintText}
            </div>
          </div>

          <div
            ref={listRef}
            style={{
              overflowY: 'auto',
              padding: '4px 0',
              maxHeight: 320,
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
                    gap: 10,
                    padding: '8px 16px',
                    background: isSelected ? colors.accentSoft : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.08s',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: item.active ? colors.accent : 'transparent',
                      border: item.active ? 'none' : `1.5px solid ${colors.textTertiary}`,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: isSelected ? 500 : 400,
                        color: isSelected ? colors.textPrimary : colors.textSecondary,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.label}
                    </div>
                    {item.description && (
                      <div
                        style={{
                          fontSize: 10,
                          color: colors.textTertiary,
                          marginTop: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.description}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <span
                      style={{
                        fontSize: 10,
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
              <div style={{ padding: '16px', textAlign: 'center', fontSize: 11, color: colors.textTertiary }}>
                No items available
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
