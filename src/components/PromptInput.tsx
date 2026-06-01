import { useState } from 'react'
import { forge } from '../lib/tauri'
import { useForgeStore } from '../store'

interface Props {
  workspaceId: string
}

export function PromptInput({ workspaceId }: Props) {
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { runningAgents, clearAgentOutput, setRunningAgent } = useForgeStore()
  const isRunning = runningAgents.has(workspaceId)

  const handleRun = async () => {
    if (!prompt.trim() || isRunning) return
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
    try {
      await forge.stopAgent(workspaceId)
    } catch (e: any) {
      setError(String(e))
    }
  }

  return (
    <div
      style={{
        borderTop: '1px solid #1e293b',
        padding: '12px 16px',
        background: '#0d1117',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {error && (
        <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleRun()
            }
          }}
          placeholder="Describe the task for the agent… (Enter to run)"
          disabled={isRunning}
          rows={3}
          style={{
            flex: 1,
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 6,
            color: '#e2e8f0',
            padding: '8px 10px',
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            opacity: isRunning ? 0.5 : 1,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isRunning ? (
            <button
              onClick={handleStop}
              style={{
                background: '#7f1d1d',
                border: 'none',
                borderRadius: 6,
                color: '#fca5a5',
                cursor: 'pointer',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                height: '100%',
              }}
            >
              ■ Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={!prompt.trim() || submitting}
              style={{
                background: prompt.trim() ? '#1d4ed8' : '#1e293b',
                border: 'none',
                borderRadius: 6,
                color: prompt.trim() ? '#e2e8f0' : '#475569',
                cursor: prompt.trim() ? 'pointer' : 'default',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                height: '100%',
                transition: 'background 0.15s',
              }}
            >
              ▶ Run
            </button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#334155', margin: 0 }}>
        {isRunning
          ? '⟳ Agent running…'
          : 'Runs in the worktree directory. Enter to submit, Shift+Enter for newline.'}
      </p>
    </div>
  )
}