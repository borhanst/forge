import { useEffect } from 'react'
import { useForgeStore } from '../store'
import { forge } from '../lib/tauri'
import { Terminal } from './Terminal'
import { PromptInput } from './PromptInput'
import RightPanel from './RightPanel'

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  idle:    { bg: '#1e293b', color: '#94a3b8' },
  running: { bg: '#1e3a5f', color: '#60a5fa' },
  done:    { bg: '#14532d', color: '#4ade80' },
  error:   { bg: '#450a0a', color: '#f87171' },
  stopped: { bg: '#431407', color: '#fb923c' },
}

export function MainPanel() {
  const {
    workspaces,
    repositories,
    activeWorkspaceId,
    appendAgentOutput,
    setAgentOutput,
    runningAgents,
  } = useForgeStore()

  const ws = workspaces.find((w) => w.id === activeWorkspaceId)
  const repo = repositories.find((r) => r.id === ws?.repo_id)

  // Load previous session output when switching to a workspace
  useEffect(() => {
    if (!ws) return

    forge.getLatestSession(ws.id).then((session) => {
      if (!session) {
        setAgentOutput(ws.id, [])
        return
      }
      
      forge.getSessionOutput(session.id).then((lines) => {
        const terminalLines = lines.map((l) => ({
          stream: l.stream,
          content: l.content,
          ts: new Date(l.created_at).getTime()
        }))
        setAgentOutput(ws.id, terminalLines)
      })
    })
  }, [ws?.id, setAgentOutput])

  if (!ws) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d1117',
        color: '#334155',
        fontSize: 14,
        fontFamily: 'monospace',
        flexDirection: 'column',
        gap: 12,
      }}>
        <span style={{ fontSize: 32 }}>⚒</span>
        <span>Select a workspace from the sidebar</span>
      </div>
    )
  }

  const badge = STATUS_BADGE[ws.status] ?? STATUS_BADGE.idle
  const isRunning = runningAgents.has(ws.id)

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Left: terminal column */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#0d1117',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#f8fafc', fontWeight: 600 }}>
            {ws.city_name}
          </h2>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 12,
            background: badge.bg,
            color: badge.color,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {isRunning ? 'running' : ws.status}
          </span>
          <span style={{ fontSize: 12, color: '#475569', marginLeft: 'auto' }}>
            {repo?.name} · {ws.provider} · <code style={{ fontSize: 11 }}>{ws.branch}</code>
          </span>
        </div>

        {/* Terminal output */}
        <Terminal workspaceId={ws.id} />

        {/* Prompt input */}
        <PromptInput workspaceId={ws.id} />
      </div>

      {/* Right: Diff / PR panel */}
      <RightPanel workspaceId={ws.id} />
    </div>
  )
}