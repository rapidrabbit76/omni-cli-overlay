import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import {
  ArrowsIn,
  ClockCounterClockwise,
  Copy,
  Cpu,
  CurrencyDollar,
  GitBranch,
  GitDiff,
  HardDrives,
  Info,
  Paperclip,
  Plus,
  Question,
  RocketLaunch,
  ShieldCheck,
  SignOut,
  SlidersHorizontal,
  Sparkle,
  Trash,
  WarningCircle,
  Wrench,
  X,
} from '@phosphor-icons/react'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'
import { useFloatTransition } from '../hooks/useFloatTransition'

export interface SlashCommand {
  command: string
  description: string
  icon: React.ReactNode
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/clear', description: 'Clear conversation history', icon: <Trash size={13} /> },
  { command: '/new', description: 'Start a new conversation tab', icon: <Plus size={13} /> },
  { command: '/exit', description: 'Hide OCO overlay window', icon: <SignOut size={13} /> },
  { command: '/quit', description: 'Hide OCO overlay window', icon: <X size={13} /> },
  { command: '/copy', description: 'Copy latest assistant response', icon: <Copy size={13} /> },
  { command: '/cost', description: 'Show token usage and cost', icon: <CurrencyDollar size={13} /> },
  { command: '/help', description: 'Show all available commands', icon: <Question size={13} /> },
  { command: '/model', description: 'Show or switch active model', icon: <Cpu size={13} /> },
  { command: '/status', description: 'Show current session status', icon: <Info size={13} /> },
  { command: '/diff', description: 'Ask Codex to show git diff', icon: <GitDiff size={13} /> },
  { command: '/resume', description: 'Resume from saved session history', icon: <ClockCounterClockwise size={13} /> },
  { command: '/fork', description: 'Fork current session into new tab', icon: <GitBranch size={13} /> },
  { command: '/mention', description: 'Attach files to the prompt', icon: <Paperclip size={13} /> },
  { command: '/compact', description: 'Compact/summarize conversation context', icon: <ArrowsIn size={13} /> },
  { command: '/review', description: 'Ask Codex to review working tree', icon: <Sparkle size={13} /> },
  { command: '/plan', description: 'Ask Codex to enter plan mode', icon: <SlidersHorizontal size={13} /> },
  { command: '/init', description: 'Ask Codex to generate AGENTS.md', icon: <RocketLaunch size={13} /> },
  { command: '/fast', description: 'Toggle fast mode preset', icon: <RocketLaunch size={13} /> },
  { command: '/personality', description: 'Show communication personality options', icon: <Sparkle size={13} /> },
  { command: '/permissions', description: 'Show approval policy settings', icon: <ShieldCheck size={13} /> },
  { command: '/mcp', description: 'Show MCP server configuration hint', icon: <HardDrives size={13} /> },
  { command: '/agent', description: 'Switch agent threads (unavailable)', icon: <WarningCircle size={13} /> },
  { command: '/apps', description: 'Browse apps (unavailable)', icon: <WarningCircle size={13} /> },
  { command: '/sandbox-add-read-dir', description: 'Windows-only sandbox helper (unavailable)', icon: <WarningCircle size={13} /> },
  { command: '/feedback', description: 'CLI feedback workflow (unavailable)', icon: <WarningCircle size={13} /> },
  { command: '/logout', description: 'CLI auth logout flow (unavailable)', icon: <WarningCircle size={13} /> },
  { command: '/debug-config', description: 'CLI debug config view (unavailable)', icon: <Wrench size={13} /> },
  { command: '/statusline', description: 'CLI statusline controls (unavailable)', icon: <WarningCircle size={13} /> },
  { command: '/experimental', description: 'CLI experimental controls (unavailable)', icon: <WarningCircle size={13} /> },
  { command: '/ps', description: 'Background terminal manager (unavailable)', icon: <WarningCircle size={13} /> },
]

interface Props {
  filter: string
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
  anchorRect: DOMRect | null
  extraCommands?: SlashCommand[]
}

export function getFilteredCommands(filter: string): SlashCommand[] {
  return getFilteredCommandsWithExtras(filter, [])
}

export function getFilteredCommandsWithExtras(filter: string, extraCommands: SlashCommand[]): SlashCommand[] {
  const q = filter.toLowerCase()
  const merged: SlashCommand[] = [...SLASH_COMMANDS]
  for (const cmd of extraCommands) {
    if (!merged.some((c) => c.command === cmd.command)) {
      merged.push(cmd)
    }
  }
  return merged.filter((c) => c.command.startsWith(q))
}

export function SlashCommandMenu({ filter, selectedIndex, onSelect, anchorRect, extraCommands = [] }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const popoverLayer = usePopoverLayer()
  const filtered = getFilteredCommandsWithExtras(filter, extraCommands)
  const colors = useColors()

  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const { mounted, visible } = useFloatTransition(filtered.length > 0 && !!anchorRect && !!popoverLayer)

  if (!mounted || !anchorRect || !popoverLayer) return null

  return createPortal(
    <motion.div
      data-oco-ui
      data-oco-float
      initial={{ opacity: 0, y: 4 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.12 }}
      style={{
        position: 'fixed',
        bottom: window.innerHeight - anchorRect.top + 4,
        left: anchorRect.left + 12,
        right: window.innerWidth - anchorRect.right + 12,
        pointerEvents: 'auto',
        visibility: visible ? 'visible' as const : 'hidden' as const,
      }}
    >
      <div
        ref={listRef}
        className="overflow-y-auto rounded-xl py-1"
        style={{
          maxHeight: 220,
          background: colors.popoverBg,
          backdropFilter: visible ? 'blur(20px)' : 'none',
          border: `1px solid ${colors.popoverBorder}`,
          boxShadow: colors.popoverShadow,
        }}
      >
        {filtered.map((cmd, i) => {
          const isSelected = i === selectedIndex
          return (
            <button
              type="button"
              key={cmd.command}
              onClick={() => onSelect(cmd)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors"
              style={{
                background: isSelected ? colors.accentLight : 'transparent',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = colors.accentLight
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                }
              }}
            >
              <span
                className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
                style={{
                  background: isSelected ? colors.accentSoft : colors.surfaceHover,
                  color: isSelected ? colors.accent : colors.textTertiary,
                }}
              >
                {cmd.icon}
              </span>
              <div className="min-w-0 flex-1">
                <span
                  className="text-[12px] font-mono font-medium"
                  style={{ color: isSelected ? colors.accent : colors.textPrimary }}
                >
                  {cmd.command}
                </span>
                <span
                  className="text-[11px] ml-2"
                  style={{ color: colors.textTertiary }}
                >
                  {cmd.description}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </motion.div>,
    popoverLayer,
  )
}
