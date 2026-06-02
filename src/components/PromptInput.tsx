import { useEffect, useRef, useState } from 'react'
import { forge } from '../lib/tauri'
import { useForgeStore } from '../store'
import { colors, fonts, labelStyle } from '../theme'
import { Kbd } from './Kbd'

interface Props {
  workspaceId: string
}

export function PromptInput({ workspaceId }: Props) {
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const runningAgents = useForgeStore(s => s.runningAgents)
  const clearAgentOutput = useForgeStore(s => s.clearAgentOutput)
  const setRunningAgent = useForgeStore(s => s.setRunningAgent)
  const showKeyboardHints = useForgeStore(s => s.settings.general.showKeyboardHints)
  const isRunning = runningAgents.has(workspaceId)
  const canSubmit = prompt.trim().length > 0 && !isRunning && !submitting

  const handleRun = async () => {
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    clearAgentOutput(workspaceId)

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

  return (
    <div
      style={{
        borderTop: `1px solid ${colors.steel}`,
        padding: '14px 24px 18px',
        background: `linear-gradient(180deg, ${colors.soot}, ${colors.iron})`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
      }}
    >
      {/* A thin ember seam at the top — picks up the forge metaphor */}
      <div
        style={{
          position: 'absolute',
          top: -1, left: 24, width: 32, height: 1,
          background: isRunning ? colors.accent : colors.accent,
          opacity: isRunning ? 1 : 0.55,
          boxShadow: isRunning ? `0 0 8px var(--accent)` : undefined,
          transition: 'all 0.2s ease',
        }}
      />

      {error && (
        <div
          style={{
            fontSize: 12,
            color: colors.rust,
            background: 'rgba(208,90,62,0.08)',
            border: `1px solid rgba(208,90,62,0.25)`,
            padding: '7px 10px',
            borderRadius: 4,
            fontFamily: fonts.body,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: colors.soot,
            border: `1px solid ${prompt ? colors.steelHi : colors.steel}`,
            borderRadius: 6,
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
          onClick={() => textareaRef.current?.focus()}
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
            placeholder="Describe what to forge. The agent works in the worktree."
            disabled={isRunning}
            rows={3}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.ivory,
              padding: '12px 14px',
              fontSize: 13.5,
              fontFamily: fonts.body,
              lineHeight: 1.55,
              resize: 'none',
              outline: 'none',
              width: '100%',
              opacity: isRunning ? 0.4 : 1,
            }}
          />

          {/* Keyboard hint in the bottom corner of the textarea */}
          {showKeyboardHints && (
            <div
              style={{
                position: 'absolute',
                bottom: 8, right: 12,
                fontFamily: fonts.mono,
                fontSize: 9.5,
                color: colors.ash,
                letterSpacing: '0.08em',
                pointerEvents: 'none',
                opacity: prompt && !isRunning ? 0.9 : 0.4,
                transition: 'opacity 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span><Kbd>⏎</Kbd> strike</span>
              <span style={{ color: colors.steel }}>·</span>
              <span><Kbd>⇧⏎</Kbd> newline</span>
            </div>
          )}
        </div>

        {isRunning ? (
          <button
            onClick={handleStop}
            style={{
              background: 'transparent',
              border: `1px solid ${colors.rust}`,
              borderRadius: 6,
              color: colors.rust,
              cursor: 'pointer',
              padding: '10px 22px',
              fontSize: 11,
              fontFamily: fonts.mono,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              transition: 'all 0.15s ease',
              minWidth: 110,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(208,90,62,0.12)'
              e.currentTarget.style.boxShadow = `0 0 20px -4px ${colors.rust}`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <span style={{ fontSize: 13, letterSpacing: 0 }}>■</span>
            <span>Quench</span>
          </button>
        ) : (
          <button
            className="btn-strike"
            onClick={handleRun}
            disabled={!canSubmit}
            style={{
              minWidth: 110,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
            title="Submit prompt (Enter)"
          >
            <HammerIcon size={14} />
            <span>Strike</span>
          </button>
        )}
      </div>

      <div
        style={{
          ...labelStyle,
          fontSize: 9.5,
          color: isRunning ? colors.accent : colors.ash,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 2,
        }}
      >
        {isRunning ? (
          <>
            <span className="ember-dot" style={{ width: 5, height: 5 }} />
            Smith at work — the hammer is falling
          </>
        ) : (
          <>
            <span
              style={{
                width: 5, height: 5,
                borderRadius: '50%',
                background: colors.steel,
              }}
            />
            Hearth ready · runs inside the worktree
          </>
        )}
      </div>
    </div>
  )
}

function HammerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M14.2 3.8 20 9.6l-3.5 3.5-2.4-2.4-7 7-2.8 1-1-1 1-2.8 7-7-2.4-2.4 3.3-3.7Z"
        fill="currentColor"
      />
    </svg>
  )
}
