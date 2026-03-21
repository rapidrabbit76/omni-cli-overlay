import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Sparkle } from '@phosphor-icons/react'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'
import { FLOAT_LAYOUT_EVENT, useFloatTransition } from '../hooks/useFloatTransition'

interface SkillEntry {
  name: string
  description: string
  scope?: string
  enabled?: boolean
  path?: string
}

interface Props {
  items: SkillEntry[]
  selectedIndex: number
  onSelect: (skill: SkillEntry) => void
  anchorEl: HTMLElement | null
}

export function SkillMenu({ items, selectedIndex, onSelect, anchorEl }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null)

  useEffect(() => {
    if (!listRef.current) return
    if (selectedIndex >= items.length) return
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, items.length])

  const { mounted, visible, measuring } = useFloatTransition(items.length > 0 && !!anchorEl && !!popoverLayer)

  useEffect(() => {
    if (!anchorEl) {
      setAnchorRect(null)
      return
    }
    const updateAnchorRect = () => setAnchorRect(anchorEl.getBoundingClientRect())
    updateAnchorRect()
    if (!mounted) return
    window.addEventListener('resize', updateAnchorRect)
    window.addEventListener(FLOAT_LAYOUT_EVENT, updateAnchorRect)
    return () => {
      window.removeEventListener('resize', updateAnchorRect)
      window.removeEventListener(FLOAT_LAYOUT_EVENT, updateAnchorRect)
    }
  }, [anchorEl, mounted])

  if (!mounted || !anchorRect || !popoverLayer) return null

  return createPortal(
    <motion.div
      data-oco-ui
      data-oco-float
      data-oco-measure-when-hidden={measuring ? 'true' : undefined}
      initial={{ opacity: 0, y: 4 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.12 }}
      style={{
        position: 'fixed',
        bottom: window.innerHeight - anchorRect.top + 4,
        left: anchorRect.left + 12,
        right: window.innerWidth - anchorRect.right + 12,
        pointerEvents: visible ? 'auto' as const : 'none' as const,
        visibility: visible ? 'visible' as const : 'hidden' as const,
      }}
    >
      <div
        ref={listRef}
        className="overflow-y-auto rounded-xl py-1"
        style={{
          maxHeight: 220,
          background: colors.popoverBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${colors.popoverBorder}`,
          boxShadow: colors.popoverShadow,
        }}
      >
        {items.map((skill, i) => {
          const isSelected = i === selectedIndex
          const skillKey = `${skill.scope ?? 'user'}:${skill.path ?? skill.name}:${skill.name}`
          return (
            <button
              key={skillKey}
              type="button"
              onClick={() => onSelect(skill)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors"
              style={{ background: isSelected ? colors.accentLight : 'transparent' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.accentLight }}
              onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span
                className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
                style={{
                  background: isSelected ? colors.accentSoft : colors.surfaceHover,
                  color: isSelected ? colors.accent : colors.textTertiary,
                }}
              >
                <Sparkle size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <span
                  className="text-[12px] font-mono font-medium"
                  style={{ color: isSelected ? colors.accent : colors.textPrimary }}
                >
                  ${skill.name}
                </span>
                {skill.scope && skill.scope !== 'user' && (
                  <span
                    className="text-[9px] font-medium ml-1.5 px-1 py-px rounded"
                    style={{
                      background: skill.scope === 'repo' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                      color: skill.scope === 'repo' ? '#60a5fa' : '#c084fc',
                    }}
                  >
                    {skill.scope}
                  </span>
                )}
                {skill.description && (
                  <span className="text-[11px] ml-2" style={{ color: colors.textTertiary }}>
                    {skill.description}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </motion.div>,
    popoverLayer,
  )
}
