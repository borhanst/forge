import { useEffect, useState } from 'react'
import { ChatWindow } from './ChatWindow'
import { TerminalShell } from './TerminalShell'
import { forge } from '../lib/tauri'
import { colors } from '../theme'
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
          alignItems: 'center',
          background: colors.iron,
          borderBottom: `1px solid ${colors.steel}`,
          flexShrink: 0,
          padding: '0 8px',
          gap: 0,
        }}
      >
        {([
          { id: 'agent', label: 'Agent' },
          { id: 'shell', label: 'Shell' },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            className="tab-file"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            <span>{t.label}</span>
            {showKeyboardHints && (
              <span style={{ opacity: 0.5, marginLeft: 4 }}>
                <Kbd size="sm">{isMac() ? '⌘J' : 'Ctrl+J'}</Kbd>
              </span>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          className="tab-file"
          onClick={() => {/* hook for new tab */}}
          title="New tab"
          aria-label="New tab"
          style={{ padding: '7px 10px 8px' }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        </button>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {tab === 'agent' && <ChatWindow workspaceId={workspaceId} />}
        {tab === 'shell' && (
          <TerminalShell key={workspaceId} workspaceId={workspaceId} />
        )}
      </div>
    </div>
  )
}
