import { useEffect, useState } from 'react'
import { useForgeStore } from '../store'
import { forge } from '../lib/tauri'
import { buildChatMessages } from '../lib/chat-parser'
import { BottomPanel } from './BottomPanel'
import { PromptInput } from './PromptInput'
import RightPanel from './RightPanel'
import { colors, fonts } from '../theme'
import { AnvilMark } from './Marks'
import { isMac } from '../lib/shortcuts'

const STATUS_TOKEN: Record<string, { dot: string; label: string }> = {
  idle:    { dot: colors.ash,    label: 'idle' },
  running: { dot: colors.accent,  label: 'forging' },
  done:    { dot: colors.patina, label: 'forged' },
  error:   { dot: colors.rust,   label: 'broken' },
  stopped: { dot: colors.brass,  label: 'cooled' },
}

interface MenuAction {
  id: string
  label: string
  destructive?: boolean
  onClick: () => void
}

export function MainPanel() {
  const {
    workspaces,
    repositories,
    activeWorkspaceId,
    setAgentOutput,
    setChatMessages,
    runningAgents,
    rightPanelOpen,
    toggleRightPanel,
    openAddRepoModal,
  } = useForgeStore()

  const ws = workspaces.find((w) => w.id === activeWorkspaceId)
  const repo = repositories.find((r) => r.id === ws?.repo_id)

  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!ws) return

    forge.getLatestSession(ws.id).then((session) => {
      if (!session) {
        setAgentOutput(ws.id, [])
        setChatMessages(ws.id, [])
        return
      }

      forge.getSessionOutput(session.id).then((lines) => {
        const terminalLines = lines.map((l) => ({
          stream: l.stream,
          content: l.content,
          ts: new Date(l.created_at).getTime()
        }))
        setAgentOutput(ws.id, terminalLines)

        const chatMessages = buildChatMessages(session.prompt, terminalLines)
        setChatMessages(ws.id, chatMessages)
      })
    })
  }, [ws?.id, setAgentOutput, setChatMessages])

  if (!ws) {
    return <EmptyHearth />
  }

  const isRunning = runningAgents.has(ws.id)
  const token = STATUS_TOKEN[isRunning ? 'running' : ws.status] ?? STATUS_TOKEN.idle

  const actions: MenuAction[] = [
    { id: 'addRepo', label: 'Add repository', onClick: () => openAddRepoModal() },
    { id: 'rightPanel', label: rightPanelOpen ? 'Hide right panel' : 'Show right panel', onClick: () => toggleRightPanel() },
  ]

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
        {/* Top bar — macOS traffic-light inset on the left, then nav arrows,
            breadcrumb, and a "..." overflow menu on the right. */}
        <div
          style={{
            height: 36,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            padding: isMac() ? '0 16px 0 92px' : '0 16px',
            gap: 8,
            background: colors.iron,
            borderBottom: `1px solid ${colors.steel}`,
            position: 'relative',
          }}
          className="mainpanel-titlebar"
        >
          <button className="icon-btn" title="Back" aria-label="Back">
            <ChevronIcon direction="left" />
          </button>
          <button className="icon-btn" title="Forward" aria-label="Forward">
            <ChevronIcon direction="right" />
          </button>

          {/* Breadcrumb: anvil › workspace */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginLeft: 4,
              minWidth: 0,
              flex: 1,
            }}
          >
            <span
              style={{
                color: colors.bone,
                fontFamily: fonts.body,
                fontSize: 12.5,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {repo?.name ?? 'anvil'}
            </span>
            <span style={{ color: colors.ash, display: 'inline-flex' }}>
              <ChevronIcon direction="right" size={10} />
            </span>
            <span
              style={{
                color: colors.ivory,
                fontFamily: fonts.body,
                fontSize: 12.5,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={ws.city_name}
            >
              {ws.city_name}
            </span>

            <span
              className="status-pill is-ash"
              style={{ marginLeft: 8 }}
            >
              <span
                style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: token.dot,
                  animation: isRunning ? 'ember-glow-soft 1.6s ease-in-out infinite' : undefined,
                }}
              />
              {token.label}
            </span>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              className="icon-btn"
              title="Actions"
              aria-label="Open actions menu"
              onClick={() => setMenuOpen(o => !o)}
            >
              <DotsIcon />
            </button>
            {menuOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  className="forge-rise"
                  style={{
                    position: 'absolute',
                    right: 0, top: '100%', marginTop: 4,
                    zIndex: 100,
                    background: colors.coal,
                    border: `1px solid ${colors.steelHi}`,
                    borderRadius: 8,
                    minWidth: 180,
                    padding: '4px 0',
                    boxShadow: '0 14px 32px rgba(0,0,0,0.6)',
                  }}
                >
                  {actions.map(a => (
                    <button
                      key={a.id}
                      onClick={() => { setMenuOpen(false); a.onClick() }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 14px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: a.destructive ? colors.rust : colors.bone,
                        fontSize: 12.5,
                        fontFamily: fonts.body,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.ore
                        if (!a.destructive) e.currentTarget.style.setProperty('color', 'var(--accent)')
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = a.destructive ? colors.rust : colors.bone
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <BottomPanel workspaceId={ws.id} />
        <PromptInput workspaceId={ws.id} />
      </div>

      {rightPanelOpen && <RightPanel workspaceId={ws.id} />}
    </div>
  )
}

function ChevronIcon({ direction = 'right', size = 12 }: { direction?: 'left' | 'right' | 'down' | 'up'; size?: number }) {
  const rot = direction === 'left' ? 'rotate(180deg)' :
              direction === 'up'    ? 'rotate(-90deg)' :
              direction === 'down'  ? 'rotate(90deg)' : undefined
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      style={{ transform: rot, transition: 'transform 0.12s ease' }}
    >
      <path d="M4.5 2.5 8 6 4.5 9.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="8" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="13" cy="8" r="1.3" />
    </svg>
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
        gap: 14,
        position: 'relative',
      }}
    >
      <div
        style={{
          color: colors.accent,
          opacity: 0.5,
        }}
      >
        <AnvilMark size={48} glow />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: colors.cream,
            marginBottom: 6,
            letterSpacing: '-0.005em',
          }}
        >
          The hearth is cold.
        </div>
        <div style={{ fontSize: 12, color: colors.ash }}>
          Select a workspace to begin forging
        </div>
      </div>
    </div>
  )
}
