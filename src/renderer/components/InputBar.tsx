import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp, Microphone, SpinnerGap, X, Check } from '@phosphor-icons/react'
import { useSessionStore, AVAILABLE_MODELS } from '../stores/sessionStore'
import { AttachmentChips } from './AttachmentChips'
import { SlashCommandMenu, getFilteredCommandsWithExtras, type SlashCommand } from './SlashCommandMenu'
import { SkillMenu } from './SkillMenu'
import { useColors } from '../theme'

const INPUT_MIN_HEIGHT = 20
const INPUT_MAX_HEIGHT = 140
const MULTILINE_ENTER_HEIGHT = 52
const MULTILINE_EXIT_HEIGHT = 50
const INLINE_CONTROLS_RESERVED_WIDTH = 72
const HELP_TEXT = [
  '/clear - clear conversation history',
  '/new - start a new conversation tab',
  '/exit, /quit - hide OCO window',
  '/copy - copy latest assistant response',
  '/cost - show token usage and cost',
  '/help - show all commands',
  '/model - show or switch active model',
  '/status - show session and app status',
  '/diff - ask Codex for git diff',
  '/resume - open session history picker',
  '/fork - fork current conversation to new tab',
  '/mention - attach files to prompt',
  '/compact - ask Codex to compact context',
  '/review - ask Codex to review changes',
  '/plan - ask Codex to enter plan mode',
  '/init - ask Codex to generate AGENTS.md',
  '/fast - toggle fast preset (gpt-5.4 + low)',
  '/personality - show communication style options',
  '/permissions - show current approval policy',
  '/mcp - show MCP config hint',
  '/agent, /apps, /sandbox-add-read-dir, /feedback, /logout, /debug-config, /statusline, /experimental, /ps - unavailable in OCO',
].join('\n')

type VoiceState = 'idle' | 'recording' | 'transcribing'

interface SkillEntry { name: string; description: string }

interface ActivePrefix {
  type: 'command' | 'skill'
  value: string
  label: string
}

function useSkillCache(): SkillEntry[] {
  const [skills, setSkills] = useState<SkillEntry[]>([])
  useEffect(() => {
    window.oco.listSkills().then(setSkills).catch(() => {})
  }, [])
  return skills
}

function filterSkills(skills: SkillEntry[], filter: string): SkillEntry[] {
  const q = filter.slice(1).toLowerCase()
  return skills.filter((s) => s.name.toLowerCase().startsWith(q))
}

export function InputBar() {
  const [input, setInput] = useState('')
  const [slashFilter, setSlashFilter] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [skillFilter, setSkillFilter] = useState<string | null>(null)
  const [skillIndex, setSkillIndex] = useState(0)
  const [isMultiLine, setIsMultiLine] = useState(false)
  const [activePrefix, setActivePrefix] = useState<ActivePrefix | null>(null)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLTextAreaElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const pttRef = useRef(false)
  const allSkills = useSkillCache()

  const sendMessage = useSessionStore((s) => s.sendMessage)
  const clearTab = useSessionStore((s) => s.clearTab)
  const addSystemMessage = useSessionStore((s) => s.addSystemMessage)
  const addAttachments = useSessionStore((s) => s.addAttachments)
  const removeAttachment = useSessionStore((s) => s.removeAttachment)
  const createTab = useSessionStore((s) => s.createTab)
  const resumeSession = useSessionStore((s) => s.resumeSession)
  const setPreferredModel = useSessionStore((s) => s.setPreferredModel)
  const setPreferredReasoning = useSessionStore((s) => s.setPreferredReasoning)
  const preferredModel = useSessionStore((s) => s.preferredModel)
  const preferredReasoning = useSessionStore((s) => s.preferredReasoning)
  const micEnabled = useSessionStore((s) => s.micEnabled)
  const voiceLanguage = useSessionStore((s) => s.voiceLanguage)
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const tabs = useSessionStore((s) => s.tabs)
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const colors = useColors()
  const isBusy = tab?.status === 'running' || tab?.status === 'connecting'
  const isConnecting = tab?.status === 'connecting'
  const attachments = tab?.attachments || []
  const hasContent = input.trim().length > 0 || attachments.length > 0
  const canSend = !!tab && !isConnecting && hasContent
  const showSlashMenu = slashFilter !== null && !isConnecting
  const filteredSkills = skillFilter !== null ? filterSkills(allSkills, skillFilter) : []
  const showSkillMenu = skillFilter !== null && !isConnecting && filteredSkills.length > 0

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
  useEffect(() => () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    if (measureRef.current) measureRef.current.remove()
  }, [])

  const updateSlashFilter = useCallback((value: string) => {
    if (activePrefix) { setSlashFilter(null); setSkillFilter(null); return }
    const slashMatch = value.match(/^(\/[a-zA-Z-]*)$/)
    if (slashMatch) {
      setSlashFilter(slashMatch[1])
      setSlashIndex(0)
      setSkillFilter(null)
      return
    }

    const skillMatch = value.match(/^(\$[a-zA-Z0-9_-]*)$/)
    if (skillMatch) {
      setSkillFilter(skillMatch[1])
      setSkillIndex(0)
      setSlashFilter(null)
      return
    }

    setSlashFilter(null)
    setSkillFilter(null)
  }, [activePrefix])

  const executeCommand = useCallback((cmd: SlashCommand) => {
    switch (cmd.command) {
      case '/clear':
        clearTab()
        addSystemMessage('Conversation cleared.')
        break
      case '/new':
        createTab().catch(() => addSystemMessage('Failed to create a new tab.'))
        break
      case '/exit':
      case '/quit':
        window.oco.hideWindow()
        break
      case '/copy': {
        const lastAssistant = [...(tab?.messages || [])].reverse().find((m) => m.role === 'assistant' && m.content.trim().length > 0)
        if (!lastAssistant) {
          addSystemMessage('No assistant response to copy yet.')
          break
        }
        navigator.clipboard.writeText(lastAssistant.content)
          .then(() => addSystemMessage('Copied to clipboard.'))
          .catch(() => addSystemMessage('Clipboard access failed.'))
        break
      }
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
      case '/help':
        addSystemMessage(HELP_TEXT)
        break
      case '/model': {
        const current = preferredModel || tab?.sessionModel || 'default'
        const lines = AVAILABLE_MODELS.map((m) => `  ${m.id === current ? '●' : '○'} ${m.label} (${m.id})`)
        addSystemMessage(`Codex model\n\n${lines.join('\n')}\n\nSwitch model: /model <name>`)
        break
      }
      case '/status': {
        const activeModel = preferredModel || tab?.sessionModel || 'default'
        const sessionId = tab?.sessionId || '(none yet)'
        const sessionVersion = tab?.sessionVersion || 'unknown'
        const appVersion = staticInfo?.version || 'unknown'
        addSystemMessage(`Status\n\nModel: ${activeModel}\nSession ID: ${sessionId}\nSession version: ${sessionVersion}\nTabs: ${tabs.length}\nOCO version: ${appVersion}`)
        break
      }
      case '/diff':
        sendMessage('/diff')
        break
      case '/resume':
        addSystemMessage('Open session history with Ctrl+H or click the clock icon.')
        break
      case '/fork':
        if (tab?.sessionId) {
          resumeSession(tab.sessionId, `${tab.title} (fork)`, tab.workingDirectory).catch(() => addSystemMessage('Failed to fork current session.'))
        } else {
          createTab().catch(() => addSystemMessage('Failed to create a fork tab.'))
        }
        break
      case '/mention':
        window.oco.attachFiles()
          .then((selected) => {
            if (selected && selected.length > 0) addAttachments(selected)
          })
          .catch(() => addSystemMessage('Failed to attach files.'))
        break
      case '/compact':
        sendMessage('Please compact/summarize our conversation so far.')
        break
      case '/review':
        sendMessage('/review')
        break
      case '/plan':
        sendMessage('/plan')
        break
      case '/init':
        sendMessage('/init')
        break
      case '/fast':
        if (preferredModel === 'gpt-5.4' && preferredReasoning === 'low') {
          setPreferredModel(null)
          setPreferredReasoning(null)
          addSystemMessage('Fast mode disabled.')
        } else {
          setPreferredModel('gpt-5.4')
          setPreferredReasoning('low')
          addSystemMessage('Fast mode enabled: GPT-5.4 with low reasoning.')
        }
        break
      case '/personality':
        addSystemMessage('Personalities\n\n- concise\n- balanced\n- mentor\n\nUse your preferred style in your next prompt.')
        break
      case '/permissions':
        addSystemMessage('Approval policy: auto-approve (OCO overlay default).')
        break
      case '/mcp':
        addSystemMessage('MCP servers configured in ~/.codex/config.toml')
        break
      case '/agent':
      case '/apps':
      case '/sandbox-add-read-dir':
      case '/feedback':
      case '/logout':
      case '/debug-config':
      case '/statusline':
      case '/experimental':
      case '/ps':
        addSystemMessage('Not available in OCO overlay.')
        break
    }
  }, [
    tab,
    tabs.length,
    staticInfo?.version,
    clearTab,
    addSystemMessage,
    addAttachments,
    sendMessage,
    createTab,
    resumeSession,
    preferredModel,
    preferredReasoning,
    setPreferredModel,
    setPreferredReasoning,
  ])

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    setInput('')
    setSlashFilter(null)
    setSkillFilter(null)
    setActivePrefix({ type: 'command', value: cmd.command, label: cmd.command })
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const handleSkillSelect = useCallback((skill: SkillEntry) => {
    setInput('')
    setSlashFilter(null)
    setSkillFilter(null)
    setActivePrefix({ type: 'skill', value: `$${skill.name}`, label: skill.name })
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

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
    const commandMatch = prompt.match(/^\/[a-zA-Z-]+/)
    if (commandMatch) {
      const command = commandMatch[0]
      const commandMeta = getFilteredCommandsWithExtras(command, []).find((c) => c.command === command)
      if (commandMeta) {
        executeCommand(commandMeta)
        setInput('')
        setSlashFilter(null)
        return
      }
    }
    const hasPrefix = !!activePrefix
    const fullPrompt = hasPrefix ? `${activePrefix!.value} ${prompt}`.trim() : prompt
    if (!fullPrompt && attachments.length === 0) return
    if (isConnecting) return

    if (hasPrefix && activePrefix!.type === 'command' && !prompt) {
      const commandMeta = getFilteredCommandsWithExtras(activePrefix!.value, []).find((c) => c.command === activePrefix!.value)
      if (commandMeta) {
        executeCommand(commandMeta)
        setInput('')
        setSlashFilter(null)
        setActivePrefix(null)
        if (textareaRef.current) textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`
        requestAnimationFrame(() => textareaRef.current?.focus())
        return
      }
    }

    setInput('')
    setSlashFilter(null)
    setActivePrefix(null)
    if (textareaRef.current) textareaRef.current.style.height = `${INPUT_MIN_HEIGHT}px`
    sendMessage(fullPrompt || 'See attached files')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [showSlashMenu, slashFilter, slashIndex, handleSlashSelect, input, attachments.length, isConnecting, sendMessage, setPreferredModel, addSystemMessage, executeCommand, activePrefix])

  const stopRecording = useCallback(() => {
    cancelledRef.current = false
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }, [])

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }, [])

  const startRecording = useCallback(async () => {
    setVoiceError(null)
    chunksRef.current = []
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setVoiceError('Microphone permission denied.')
      return
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => { t.stop() })
      if (cancelledRef.current) { cancelledRef.current = false; setVoiceState('idle'); return }
      if (chunksRef.current.length === 0) { setVoiceState('idle'); return }
      setVoiceState('transcribing')
      try {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const wavBase64 = await blobToWavBase64(blob)
        const result = await window.oco.transcribeAudio(wavBase64, voiceLanguage || undefined)
        if (result.error) setVoiceError(result.error)
        else if (result.transcript) setInput((prev) => (prev ? `${prev} ${result.transcript}` : result.transcript!))
      } catch (err: unknown) {
        setVoiceError(`Voice failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setVoiceState('idle')
      }
    }
    recorder.onerror = () => { stream.getTracks().forEach((t) => { t.stop() }); setVoiceError('Recording failed.'); setVoiceState('idle') }
    mediaRecorderRef.current = recorder
    setVoiceState('recording')
    recorder.start()
  }, [voiceLanguage])

  const handleVoiceToggle = useCallback(() => {
    if (!micEnabled) return
    pttRef.current = false
    if (voiceState === 'recording') stopRecording()
    else if (voiceState === 'idle') void startRecording()
  }, [voiceState, startRecording, stopRecording, micEnabled])

  const voiceStateRef = useRef(voiceState)
  voiceStateRef.current = voiceState
  const startRecordingRef = useRef(startRecording)
  startRecordingRef.current = startRecording
  const stopRecordingRef = useRef(stopRecording)
  stopRecordingRef.current = stopRecording

  const voiceKey = useSessionStore((s) => s.voiceKey)

  // PTT: hold voice key to record, release to stop & transcribe
  useEffect(() => {
    if (!micEnabled) return
    const isModifierOnly = ['Alt', 'Control', 'Shift', 'Meta'].includes(voiceKey)
    let held = false
    const matchDown = (e: KeyboardEvent): boolean => {
      if (isModifierOnly) return e.key === voiceKey && !e.repeat
      const parts = voiceKey.split('+')
      const key = parts[parts.length - 1]
      const needMeta = parts.includes('Meta')
      const needCtrl = parts.includes('Control')
      const needAlt = parts.includes('Alt')
      const needShift = parts.includes('Shift')
      const keyMatch = e.key.length === 1 ? e.key.toUpperCase() === key : e.key === key
      return keyMatch && e.metaKey === needMeta && e.ctrlKey === needCtrl && e.altKey === needAlt && e.shiftKey === needShift && !e.repeat
    }
    const matchUp = (e: KeyboardEvent): boolean => {
      if (isModifierOnly) return e.key === voiceKey
      const parts = voiceKey.split('+')
      const key = parts[parts.length - 1]
      return e.key.length === 1 ? e.key.toUpperCase() === key : e.key === key
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (matchDown(e) && !held && voiceStateRef.current === 'idle') {
        e.preventDefault()
        held = true
        pttRef.current = true
        void startRecordingRef.current()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (matchUp(e) && held) {
        e.preventDefault()
        held = false
        if (pttRef.current) stopRecordingRef.current()
      }
    }
    const onBlur = () => {
      if (held) { held = false; if (pttRef.current) stopRecordingRef.current() }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [micEnabled, voiceKey])

  const isCtrlN = (e: React.KeyboardEvent) => e.ctrlKey && e.key === 'n'
  const isCtrlP = (e: React.KeyboardEvent) => e.ctrlKey && e.key === 'p'

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) {
      const filtered = getFilteredCommandsWithExtras(slashFilter!, [])
      if (e.key === 'ArrowDown' || isCtrlN(e)) { e.preventDefault(); setSlashIndex((i) => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp' || isCtrlP(e)) { e.preventDefault(); setSlashIndex((i) => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Tab') { e.preventDefault(); if (filtered.length > 0) handleSlashSelect(filtered[slashIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSlashFilter(null); return }
    }
    if (showSkillMenu) {
      if (e.key === 'ArrowDown' || isCtrlN(e)) { e.preventDefault(); setSkillIndex((i) => (i + 1) % filteredSkills.length); return }
      if (e.key === 'ArrowUp' || isCtrlP(e)) { e.preventDefault(); setSkillIndex((i) => (i - 1 + filteredSkills.length) % filteredSkills.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); handleSkillSelect(filteredSkills[skillIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setSkillFilter(null); return }
    }
    if (e.key === 'Backspace' && activePrefix && input === '') { e.preventDefault(); setActivePrefix(null); return }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === 'Escape' && !showSlashMenu && !showSkillMenu) { if (activePrefix) { setActivePrefix(null); return } window.oco.hideWindow() }
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
        {showSkillMenu && (
          <SkillMenu
            items={filteredSkills}
            selectedIndex={skillIndex}
            onSelect={handleSkillSelect}
            anchorRect={wrapperRef.current?.getBoundingClientRect() ?? null}
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
          {activePrefix && (
            <button
              type="button"
              className="flex items-center gap-1 shrink-0 rounded-md px-2 py-0.5 text-[12px] font-medium font-mono select-none"
              style={{
                background: activePrefix.type === 'skill' ? 'rgba(168,85,247,0.15)' : 'rgba(74,222,128,0.15)',
                color: activePrefix.type === 'skill' ? '#c084fc' : '#4ade80',
                border: `1px solid ${activePrefix.type === 'skill' ? 'rgba(168,85,247,0.3)' : 'rgba(74,222,128,0.3)'}`,
                marginRight: 6,
              }}
              onClick={() => setActivePrefix(null)}
              title="Click or Backspace to remove"
            >
              {activePrefix.label}
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isConnecting
                ? 'Initializing...'
                : voiceState === 'recording'
                  ? 'Recording... tap mic to stop, ✕ to cancel'
                  : voiceState === 'transcribing'
                    ? 'Transcribing...'
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
            {micEnabled && (
              <AnimatePresence mode="wait">
                {voiceState === 'recording' ? (
                  <motion.div key="mic-recording" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.12 }} className="flex items-center gap-1">
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelRecording} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors" style={{ background: colors.surfaceHover, color: colors.textTertiary }} title="Cancel">
                      <X size={15} weight="bold" />
                    </button>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={stopRecording} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors" style={{ background: '#ef4444', color: '#fff' }} title="Stop & transcribe">
                      <Microphone size={16} weight="fill" />
                    </button>
                  </motion.div>
                ) : voiceState === 'transcribing' ? (
                  <motion.div key="transcribing" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }}>
                    <button type="button" disabled className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: colors.surfaceHover, color: colors.textTertiary }}>
                      <SpinnerGap size={16} className="animate-spin" />
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key="mic-idle" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.1 }}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleVoiceToggle} disabled={isConnecting} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors" style={{ background: colors.surfaceHover, color: isConnecting ? colors.textTertiary : colors.textSecondary }} title="Voice input (or hold Option)">
                      <Microphone size={16} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
            <AnimatePresence>
              {canSend && voiceState !== 'recording' && (
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
      {voiceError && (
        <div className="px-1 pb-1 text-[11px]" style={{ color: '#ef4444' }}>
          {voiceError}
        </div>
      )}
    </div>
  )
}

async function blobToWavBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  audioCtx.close()

  const { numberOfChannels, length, sampleRate } = decoded
  let mono: Float32Array
  if (numberOfChannels <= 1) {
    mono = decoded.getChannelData(0)
  } else {
    mono = new Float32Array(length)
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channel = decoded.getChannelData(ch)
      for (let i = 0; i < length; i++) mono[i] += channel[i]
    }
    const inv = 1 / numberOfChannels
    for (let i = 0; i < length; i++) mono[i] *= inv
  }

  let sumSq = 0
  for (let i = 0; i < mono.length; i++) sumSq += mono[i] * mono[i]
  if (Math.sqrt(sumSq / mono.length) < 0.003) {
    throw new Error('No voice detected. Speak closer to the mic.')
  }

  const ratio = sampleRate / 16000
  const outLength = Math.max(1, Math.floor(mono.length / ratio))
  const resampled = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, mono.length - 1)
    const t = pos - i0
    resampled[i] = mono[i0] * (1 - t) + mono[i1] * t
  }

  let peak = 0
  for (let i = 0; i < resampled.length; i++) {
    const a = Math.abs(resampled[i])
    if (a > peak) peak = a
  }
  const normalized = resampled
  if (peak > 1e-4 && peak <= 0.95) {
    const gain = Math.min(0.95 / peak, 8)
    for (let i = 0; i < normalized.length; i++) normalized[i] *= gain
  }

  const numSamples = normalized.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  const writeStr = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, normalized[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }

  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
