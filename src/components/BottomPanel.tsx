import { useEffect, useState } from 'react'
import { Terminal } from './Terminal'
import { TerminalShell } from './TerminalShell'
import { forge } from '../lib/tauri'
import { colors, fonts } from '../theme'
import { Kbd } from './Kbd'
import { isMac } from '../lib/shortcuts'
import { useForgeStore } from '../store'

interface Props {
  workspaceId: string
}

type Tab = 'agent' | 'shell'

export function BottomPanel({ workspaceId }: Props) {
  const [tab, setTab] = useState<Tab>('agent')
  const showKeyboardHints = useForgeStore(s => s.settings.general.showKeyboardHints)

  useEffect(() => {
    let cancelled = false
    forge.terminalAttach(workspaceId).then((info) => {
      if (cancelled) return
      setTab(info ? 'shell' : 'agent')
    })
    return () => { cancelled = true }
  }, [workspaceId])

  useEffect(() => {
    const onToggle = () => setTab(t => t === 'agent' ? 'shell' : 'agent')
    window.addEventListener('forge:toggle-bottom-tab', onToggle)
    return () => window.removeEventListener('forge:toggle-bottom-tab', onToggle)
  }, [])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          background: colors.iron,
          borderBottom: `1px solid ${colors.steel}`,
          flexShrink: 0,
          padding: '0 24px',
          gap: 4,
        }}
      >
        {([
          { id: 'agent', label: 'Agent' },
          { id: 'shell', label: 'Shell' },
        ] as { id: Tab; label: string }[]).map((t) => (
          <Tab
            key={t.id}
            label={t.label}
            hint={showKeyboardHints ? (isMac() ? '⌘J' : 'Ctrl+J') : undefined}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
          />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {tab === 'agent' && <Terminal workspaceId={workspaceId} />}
        {tab === 'shell' && (
          <TerminalShell key={workspaceId} workspaceId={workspaceId} />
        )}
      </div>
    </div>
  )
}

function Tab({ label, hint, active, onClick }: { label: string; hint?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '10px 16px 11px',
        border: 'none',
        cursor: 'pointer',
        background: 'transparent',
        color: active ? colors.cream : colors.ash,
        fontSize: 11,
        fontFamily: fonts.mono,
        fontWeight: active ? 600 : 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        transition: 'color 0.12s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = colors.bone }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = colors.ash }}
    >
      <span>{label}</span>
      {hint && <span style={{ opacity: 0.5, letterSpacing: 0 }}><Kbd size="sm">{hint}</Kbd></span>}
      {active && (
        <span
          style={{
            position: 'absolute',
            left: 14, right: 14, bottom: -1,
            height: 1,
            background: colors.accent,
            boxShadow: `0 0 8px var(--accent)`,
          }}
        />
      )}
    </button>
  )
}
