import { useEffect, useRef, useState } from 'react'
import { forge } from '../lib/tauri'
import { useForgeStore } from '../store'
import { generateId } from '../lib/chat-parser'
import { colors, fonts } from '../theme'
import {
  OPENCODE_AGENTS,
  PROVIDER_MODELS,
  shortAgentLabel,
  shortModelLabel,
} from '../lib/pills'

interface Props {
  workspaceId: string
}

const MAX_TEXTAREA_ROWS = 6

export function PromptInput({ workspaceId }: Props) {
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const runningAgents = useForgeStore(s => s.runningAgents)
  const clearAgentOutput = useForgeStore(s => s.clearAgentOutput)
  const clearChatMessages = useForgeStore(s => s.clearChatMessages)
  const addChatMessage = useForgeStore(s => s.addChatMessage)
  const setRunningAgent = useForgeStore(s => s.setRunningAgent)
  const workspaces = useForgeStore(s => s.workspaces)
  const setWorkspaces = useForgeStore(s => s.setWorkspaces)
  const ws = workspaces.find(w => w.id === workspaceId)

  const isRunning = runningAgents.has(workspaceId)
  const canSubmit = prompt.trim().length > 0 && !isRunning && !submitting

  const handleRun = async () => {
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    clearAgentOutput(workspaceId)
    clearChatMessages(workspaceId)
    addChatMessage(workspaceId, {
      id: generateId(),
      role: 'user',
      content: prompt.trim(),
      toolCalls: [],
      fileChanges: [],
      timestamp: Date.now(),
    })
    addChatMessage(workspaceId, {
      id: generateId(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      fileChanges: [],
      timestamp: Date.now(),
    })

    try {
      const sessionId = await forge.runAgent(workspaceId, prompt.trim())
      setRunningAgent(workspaceId, sessionId)
      setPrompt('')
    } catch (e: any) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleStop = async () => {
    try { await forge.stopAgent(workspaceId) }
    catch (e: any) { setError(String(e)) }
  }

  useEffect(() => {
    const onFocus = () => {
      if (!isRunning) textareaRef.current?.focus()
    }
    window.addEventListener('forge:focus-prompt', onFocus)
    return () => window.removeEventListener('forge:focus-prompt', onFocus)
  }, [isRunning])

  useEffect(() => {
    const onClear = () => clearAgentOutput(workspaceId)
    window.addEventListener('forge:clear-output', onClear)
    return () => window.removeEventListener('forge:clear-output', onClear)
  }, [workspaceId, clearAgentOutput])

  // Auto-grow the textarea up to MAX_TEXTAREA_ROWS.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 20
    const maxHeight = lineHeight * MAX_TEXTAREA_ROWS
    const next = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${Math.max(lineHeight, next)}px`
  }, [prompt])

  // Resolve current model/agent from workspace provider_config.
  const wsConfig: Record<string, string> = ws?.provider_config
    ? (JSON.parse(ws.provider_config) as Record<string, string>)
    : {}
  const provider = ws?.provider ?? 'claude'
  const currentModel = wsConfig.model ?? ''
  const currentAgent = wsConfig.agent ?? ''

  const setConfig = async (key: 'model' | 'agent', value: string) => {
    const next = { ...wsConfig, [key]: value }
    try {
      await forge.updateWorkspaceConfig(workspaceId, next)
      setWorkspaces(workspaces.map(w =>
        w.id === workspaceId
          ? { ...w, provider_config: Object.keys(next).length ? JSON.stringify(next) : null }
          : w
      ))
    } catch (e: any) {
      setError(String(e))
    }
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${colors.steel}`,
        padding: '12px 16px 14px',
        background: colors.iron,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
      }}
    >
      {error && (
        <div
          style={{
            fontSize: 12,
            color: colors.rust,
            background: 'rgba(208,90,62,0.08)',
            border: `1px solid rgba(208,90,62,0.25)`,
            padding: '6px 10px',
            borderRadius: 6,
            fontFamily: fonts.body,
          }}
        >
          {error}
        </div>
      )}

      <div
        ref={wrapperRef}
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          background: colors.soot,
          border: `1px solid ${colors.steel}`,
          borderRadius: 10,
          padding: '10px 12px',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
        onClick={() => textareaRef.current?.focus()}
        onFocus={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.borderColor = colors.steelHi
        }}
        onBlur={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.borderColor = colors.steel
        }}
      >
        <textarea
          ref={textareaRef}
          className="forge-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleRun()
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleRun()
            }
          }}
          placeholder={
            isRunning
              ? 'Agent is working — wait for it to finish, or stop it.'
              : 'Add a follow-up, attach files, or start another agent…'
          }
          disabled={isRunning}
          rows={1}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.ivory,
            padding: 0,
            fontSize: 13.5,
            fontFamily: fonts.body,
            lineHeight: 1.5,
            resize: 'none',
            outline: 'none',
            width: '100%',
            opacity: isRunning ? 0.4 : 1,
            minHeight: 20,
            maxHeight: 120,
            overflowY: 'auto',
          }}
        />
      </div>

      {/* Footer row: model/agent pills on the left, send/stop on the right. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <PillSelect
          label="Model"
          value={currentModel}
          display={shortModelLabel(currentModel, provider)}
          options={PROVIDER_MODELS[provider] ?? PROVIDER_MODELS.opencode}
          disabled={isRunning}
          onChange={(v) => setConfig('model', v)}
        />
        <PillSelect
          label="Mode"
          value={currentAgent}
          display={shortAgentLabel(currentAgent)}
          options={OPENCODE_AGENTS}
          disabled={isRunning}
          onChange={(v) => setConfig('agent', v)}
        />
        <PillSelect
          label="Reasoning"
          value="high"
          display="High"
          options={[
            { value: 'low',    label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high',   label: 'High' },
          ]}
          disabled
          onChange={() => {}}
        />

        <div style={{ flex: 1 }} />

        {isRunning ? (
          <button
            onClick={handleStop}
            className="btn-danger"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
            }}
            title="Stop agent (⌘.)"
          >
            <span style={{ fontSize: 11 }}>■</span>
            <span>Stop</span>
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={!canSubmit}
            className="btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
            }}
            title="Send (Enter)"
          >
            <SendIcon />
            <span>Send</span>
          </button>
        )}
      </div>
    </div>
  )
}

function PillSelect({
  label,
  value,
  display,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  display: string
  options: { value: string; label: string }[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        className="pill"
        data-active={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}
        title={`${label}: ${display}`}
      >
        <span style={{ color: colors.ash, fontSize: 10.5, fontFamily: fonts.mono, letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{ color: colors.bone }}>{display}</span>
        <ChevronSvg />
      </button>

      {open && (
        <div
          className="forge-rise"
          style={{
            position: 'absolute',
            left: 0,
            bottom: 'calc(100% + 6px)',
            zIndex: 200,
            minWidth: 220,
            background: colors.coal,
            border: `1px solid ${colors.steelHi}`,
            borderRadius: 8,
            padding: '4px 0',
            boxShadow: '0 14px 32px rgba(0,0,0,0.6)',
          }}
        >
          {options.map(opt => (
            <button
              key={opt.value || '__default__'}
              onClick={() => {
                if (opt.value === '__custom__') {
                  // Switch to inline custom input row (below).
                  return
                }
                onChange(opt.value)
                setOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '7px 12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: value === opt.value ? 'var(--accent)' : colors.bone,
                fontSize: 12.5,
                fontFamily: fonts.body,
                textAlign: 'left',
                gap: 8,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.ore
                if (value !== opt.value) e.currentTarget.style.color = colors.ivory
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = value === opt.value ? 'var(--accent)' : colors.bone
              }}
            >
              {opt.value === '' ? (
                <span style={{ color: colors.smoke, fontSize: 10.5, fontFamily: fonts.mono, marginRight: 'auto' }}>
                  default
                </span>
              ) : (
                <span style={{ marginRight: 'auto' }}>{opt.label}</span>
              )}
              {value === opt.value && <CheckIcon />}
            </button>
          ))}
          {options.some(o => o.value === '__custom__') && (
            <div style={{ borderTop: `1px solid ${colors.steel}`, margin: '4px 0', padding: '6px 8px' }}>
              <input
                placeholder="Custom value…"
                value={customValue}
                onChange={e => setCustomValue(e.target.value)}
                style={{
                  width: '100%',
                  background: colors.soot,
                  border: `1px solid ${colors.steel}`,
                  color: colors.ivory,
                  fontSize: 12,
                  padding: '5px 8px',
                  borderRadius: 6,
                  fontFamily: fonts.body,
                  outline: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customValue.trim()) {
                    onChange(customValue.trim())
                    setCustomValue('')
                    setOpen(false)
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChevronSvg() {
  return (
    <svg width={9} height={9} viewBox="0 0 12 12" fill="none">
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
      <path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
      <path d="M8 13V3M8 3l-4 4M8 3l4 4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
