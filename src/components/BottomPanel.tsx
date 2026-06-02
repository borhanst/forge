import { useEffect, useState } from 'react'
import { Terminal } from './Terminal'
import { TerminalShell } from './TerminalShell'
import { forge } from '../lib/tauri'

interface Props {
  workspaceId: string
}

type Tab = 'agent' | 'shell'

export function BottomPanel({ workspaceId }: Props) {
  const [tab, setTab] = useState<Tab>('agent')

  useEffect(() => {
    let cancelled = false
    forge.terminalAttach(workspaceId).then((info) => {
      if (cancelled) return
      setTab(info ? 'shell' : 'agent')
    })
    return () => { cancelled = true }
  }, [workspaceId])

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
          background: '#111318',
          borderBottom: '1px solid #1e2235',
          flexShrink: 0,
        }}
      >
        {([
          { id: 'agent', label: 'Agent' },
          { id: 'shell', label: 'Shell' },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px',
              border: 'none',
              cursor: 'pointer',
              background: tab === t.id ? '#0d1117' : 'transparent',
              color: tab === t.id ? '#d1d5db' : '#6b7280',
              fontSize: 12,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              transition: 'color 0.1s',
            }}
          >
            {t.label}
          </button>
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
          <TerminalShell
            key={workspaceId}
            workspaceId={workspaceId}
          />
        )}
      </div>
    </div>
  )
}
