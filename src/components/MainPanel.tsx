import { useEffect } from 'react'
import { useForgeStore } from '../store'
import { forge } from '../lib/tauri'
import { BottomPanel } from './BottomPanel'
import { PromptInput } from './PromptInput'
import RightPanel from './RightPanel'
import { colors, fonts, displayItalic, labelStyle } from '../theme'
import { AnvilMark } from './Marks'

const STATUS_TOKEN: Record<string, { dot: string; label: string; tint: string }> = {
  idle:    { dot: colors.ash,    label: 'idle',    tint: colors.smoke },
  running: { dot: colors.accent,  label: 'forging', tint: colors.accent },
  done:    { dot: colors.patina, label: 'forged',  tint: colors.patina },
  error:   { dot: colors.rust,   label: 'broken',  tint: colors.rust },
  stopped: { dot: colors.brass,  label: 'cooled',  tint: colors.brass },
}

export function MainPanel() {
  const {
    workspaces,
    repositories,
    activeWorkspaceId,
    setAgentOutput,
    runningAgents,
    rightPanelOpen,
  } = useForgeStore()

  const ws = workspaces.find((w) => w.id === activeWorkspaceId)
  const repo = repositories.find((r) => r.id === ws?.repo_id)

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
    return <EmptyHearth />
  }

  const isRunning = runningAgents.has(ws.id)
  const token = STATUS_TOKEN[isRunning ? 'running' : ws.status] ?? STATUS_TOKEN.idle

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: colors.soot,
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        {/* Header — workspace title in display serif italic. */}
        <div
          style={{
            padding: '20px 28px 18px',
            borderBottom: `1px solid ${colors.steel}`,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 18,
            flexShrink: 0,
            position: 'relative',
            background: `linear-gradient(180deg, ${colors.iron}, ${colors.soot})`,
          }}
        >
          {/* Ember stripe under the header — subtle warmth from the forge below */}
          <div
            style={{
              position: 'absolute',
              bottom: -1, left: 28, width: 64, height: 1,
              background: colors.accent,
              boxShadow: `0 0 8px var(--accent)`,
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                ...labelStyle,
                color: token.tint,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: token.dot,
                  boxShadow: isRunning
                    ? `0 0 0 2px rgba(255,106,31,0.25), 0 0 8px var(--accent)`
                    : undefined,
                  animation: isRunning ? 'ember-glow-soft 1.6s ease-in-out infinite' : undefined,
                }}
              />
              {token.label}
            </div>

            <h1
              style={{
                ...displayItalic,
                margin: 0,
                fontSize: 32,
                lineHeight: 1.05,
                color: colors.cream,
                letterSpacing: '-0.015em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={ws.city_name}
            >
              {ws.city_name}
            </h1>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 4,
              fontFamily: fonts.mono,
              fontSize: 11,
              color: colors.ash,
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: colors.smoke }}>{repo?.name}</span>
              <Pip />
              <span>{ws.provider}</span>
            </div>
            <code
              style={{
                color: colors.bone,
                background: colors.coal,
                padding: '2px 8px',
                borderRadius: 3,
                border: `1px solid ${colors.steel}`,
                fontSize: 10.5,
                letterSpacing: '0.02em',
              }}
            >
              {ws.branch}
            </code>
          </div>
        </div>

        <BottomPanel workspaceId={ws.id} />
        <PromptInput workspaceId={ws.id} />
      </div>

      {rightPanelOpen && <RightPanel workspaceId={ws.id} />}
    </div>
  )
}

function Pip() {
  return (
    <span
      style={{
        width: 3, height: 3, borderRadius: '50%',
        background: colors.steel, display: 'inline-block',
      }}
    />
  )
}

function EmptyHearth() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.soot,
        color: colors.ash,
        fontFamily: fonts.body,
        flexDirection: 'column',
        gap: 18,
        position: 'relative',
      }}
    >
      {/* Soft ember glow behind the mark */}
      <div
        style={{
          position: 'absolute',
          width: 280, height: 280,
          background: 'radial-gradient(circle, rgba(255,106,31,0.10), transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          color: colors.accent,
          opacity: 0.85,
          position: 'relative',
        }}
      >
        <AnvilMark size={64} glow />
      </div>

      <div style={{ textAlign: 'center', position: 'relative' }}>
        <div
          style={{
            ...displayItalic,
            fontSize: 28,
            color: colors.cream,
            marginBottom: 8,
            letterSpacing: '-0.01em',
          }}
        >
          The hearth is cold.
        </div>
        <div
          style={{
            ...labelStyle,
            color: colors.ash,
            fontSize: 11,
          }}
        >
          Select an anvil to begin forging
        </div>
      </div>
    </div>
  )
}
