import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp } from '@phosphor-icons/react'
import { useSessionStore, AVAILABLE_MODELS } from '../stores/sessionStore'
import { AttachmentChips } from './AttachmentChips'
import { SlashCommandMenu, getFilteredCommandsWithExtras, type SlashCommand } from './SlashCommandMenu'
import { useColors } from '../theme'

const INPUT_MIN_HEIGHT = 20
const INPUT_MAX_HEIGHT = 140
const MULTILINE_ENTER_HEIGHT = 52
const MULTILINE_EXIT_HEIGHT = 50
const INLINE_CONTROLS_RESERVED_WIDTH = 72

export function InputBar() {
  const [input, setInput] = useState('')
  const [slashFilter, setSlashFilter] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [isMultiLine, setIsMultiLine] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLTextAreaElement | null>(null)

  const sendMessage = useSessionStore((s) => s.sendMessage)
  const clearTab = useSessionStore((s) => s.clearTab)
  const addSystemMessage = useSessionStore((s) => s.addSystemMessage)
  const addAttachments = useSessionStore((s) => s.addAttachments)
  const removeAttachment = useSessionStore((s) => s.removeAttachment)
  const setPreferredModel = useSessionStore((s) => s.setPreferredModel)
  const preferredModel = useSessionStore((s) => s.preferredModel)
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const colors = useColors()
  const isBusy = tab?.status === 'running' || tab?.status === 'connecting'
  const isConnecting = tab?.status === 'connecting'
  const attachments = tab?.attachments || []
  const hasContent = input.trim().length > 0 || attachments.length > 0
  const canSend = !!tab && !isConnecting && hasContent
  const showSlashMenu = slashFilter !== null && !isConnecting

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    const unsub = window.oco.onWindowShown(() => {
      textareaRef.current?.focus()
    })
    return unsub
  }, [])

  const measureInlineHeight = useCallback((value: string): number => {
    if (!measureRef.current) {
      const m = document.createElement('textarea')
      m.setAttribute('aria-hidden', 'true')
      m.tabIndex = -1
      m.style.position = 'absolute'
      m.style.top = '-99999px'
      m.style.left = '0'
      m.style.height = '0'
      m.style.minHeight = '0'
      m.style.overflow = 'hidden'
      m.style.visibility = 'hidden'
      m.style.pointerEvents = 'none'
      m.style.zIndex = '-1'
      m.style.resize = 'none'
      m.style.border = '0'
      m.style.outline = '0'
      m.style.boxSizing = 'border-box'
      document.body.appendChild(m)
      measureRef.current = m
    }
    const m = measureRef.current
    const hostWidth = wrapperRef.current?.clientWidth ?? 0
    const inlineWidth = Math.max(120, hostWidth - INLINE_CONTROLS_RESERVED_WIDTH)
    m.style.width = `${inlineWidth}px`
    m.style.fontSize = '14px'
    m.style.lineHeight = '20px'
    m.style.paddingTop = '15px'
    m.style.paddingBottom = '15px'
    const computed = textareaRef.current ? window.getComputedStyle(textareaRef.current) : null
    if (computed) {
      m.style.fontFamily = computed.fontFamily
      m.style.letterSpacing = computed.letterSpacing
      m.style.fontWeight = computed.fontWeight
    }
    m.value = value || ' '
    return m.scrollHeight
  }, [])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = `${INPUT_MIN_HEIGHT}px`
    const naturalHeight = el.scrollHeight
    const clampedHeight = Math.min(naturalHeight, INPUT_MAX_HEIGHT)
    el.style.height = `${clampedHeight}px`
    el.style.overflowY = naturalHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
    if (naturalHeight <= INPUT_MAX_HEIGHT) el.scrollTop = 0
    const inlineHeight = measureInlineHeight(input)
    setIsMultiLine((prev) => (!prev ? inlineHeight > MULTILINE_ENTER_HEIGHT : inlineHeight > MULTILINE_EXIT_HEIGHT))
  }, [input, measureInlineHeight])

  useLayoutEffect(() => { autoResize() }, [autoResize])
  useEffect(() => () => { if (measureRef.current) measureRef.current.remove() }, [])

  const updateSlashFilter = useCallback((value: string) => {
    const match = value.match(/^(\/[a-zA-Z-]*)$/)
    if (match) {
      setSlashFilter(match[1])
      setSlashIndex(0)
    } else {
      setSlashFilter(null)
    }
  }, [])

  const executeCommand = useCallback((cmd: SlashCommand) => {
    switch (cmd.command) {
      case '/clear':
        clearTab()
        addSystemMessage('Conversation cleared.')
        break
      case '/cost': {
        if (tab?.lastResult) {
          const r = tab.lastResult
          const parts = [`$${r.totalCostUsd.toFixed(4)}`, `${(r.durationMs / 1000).toFixed(1)}s`, `${r.numTurns} turn${r.numTurns !== 1 ? 's' : ''}`]
          if (r.usage.input_tokens) {
            parts.push(`${r.usage.input_tokens.toLocaleString()} in / ${(r.usage.output_tokens || 0).toLocaleString()} out`)
          }
          addSystemMessage(parts.join(' · '))
        } else {
          addSystemMessage('No usage data yet.')
        }
        break
      }
      case '/model': {
        const current = preferredModel || tab?.sessionModel || 'default'
        const lines = AVAILABLE_MODELS.map((m) => `  ${m.id === current ? '●' : '○'} ${m.label} (${m.id})`)
        addSystemMessage(`Codex model\n\n${lines.join('\n')}\n\nSwitch model: /model <name>`)
        break
      }
      case '/help':
        addSystemMessage('/clear\n/cost\n/model\n/help')
        break
    }
  }, [tab, clearTab, addSystemMessage, preferredModel])

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    setInput('')
    setSlashFilter(null)
    executeCommand(cmd)
  }, [executeCommand])

  const handleSend = useCallback(() => {
    if (showSlashMenu) {
      const filtered = getFilteredCommandsWithExtras(slashFilter!, [])
      if (filtered.length > 0) {
        handleSlashSelect(filtered[slashIndex])
        return
      }
    }
    const prompt = input.trim()
    const modelMatch = prompt.match(/^\/model\s+(\S+)/i)
    if (modelMatch) {
      const query = modelMatch[1].toLowerCase()
      const match = AVAILABLE_MODELS.find((m) => m.id.toLowerCase().includes(query) || m.label.toLowerCase().includes(query))
      if (match) {
        setPreferredModel(match.id)
        addSystemMessage(`Model switched to ${match.label} (${match.id})`)
      } else {
        addSystemMessage(`Unknown model "${modelMatch[1]}"`)
      }
      setInput('')
      setSlashFilter(null)
      return
    }
    if (!prompt && attachments.length === 0) return
    if (isConnecting) return
    setInput('')
    setSlashFilter(null)
    if (textareaRef.current) textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`
    sendMessage(prompt || 'See attached files')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [showSlashMenu, slashFilter, slashIndex, handleSlashSelect, input, attachments.length, isConnecting, sendMessage, setPreferredModel, addSystemMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      const filtered = getFilteredCommandsWithExtras(slashFilter!, [])
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex((i) => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex((i) => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Tab') { e.preventDefault(); if (filtered.length > 0) handleSlashSelect(filtered[slashIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSlashFilter(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape' && !showSlashMenu) window.oco.hideWindow()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    updateSlashFilter(value)
  }

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) return
        const reader = new FileReader()
        reader.onload = async () => {
          const dataUrl = reader.result as string
          const attachment = await window.oco.pasteImage(dataUrl)
          if (attachment) addAttachments([attachment])
        }
        reader.readAsDataURL(blob)
        return
      }
    }
  }, [addAttachments])

  const hasAttachments = attachments.length > 0

  return (
    <div ref={wrapperRef} data-oco-ui className="flex flex-col w-full relative">
      <AnimatePresence>
        {showSlashMenu && (
          <SlashCommandMenu
            filter={slashFilter!}
            selectedIndex={slashIndex}
            onSelect={handleSlashSelect}
            anchorRect={wrapperRef.current?.getBoundingClientRect() ?? null}
            extraCommands={[]}
          />
        )}
      </AnimatePresence>

      {hasAttachments && (
        <div style={{ paddingTop: 6, marginLeft: -6 }}>
          <AttachmentChips attachments={attachments} onRemove={removeAttachment} />
        </div>
      )}

      <div className="w-full" style={{ minHeight: 50 }}>
        <div className="flex items-center w-full" style={{ minHeight: isMultiLine ? 74 : 50 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isConnecting
                ? 'Initializing...'
                : isBusy
                  ? 'Type to queue a message...'
                  : 'Ask Codex anything...'
            }
            rows={1}
            className="flex-1 bg-transparent resize-none"
            style={{
              fontSize: 14,
              lineHeight: '20px',
              color: colors.textPrimary,
              minHeight: 20,
              maxHeight: INPUT_MAX_HEIGHT,
              paddingTop: 15,
              paddingBottom: 15,
            }}
          />

          <div className="flex items-center gap-1 shrink-0 ml-2">
            <AnimatePresence>
              {canSend && (
                <motion.div key="send" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleSend}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                    style={{ background: colors.sendBg, color: colors.textOnAccent }}
                    title={isBusy ? 'Queue message' : 'Send (Enter)'}
                  >
                    <ArrowUp size={16} weight="bold" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
