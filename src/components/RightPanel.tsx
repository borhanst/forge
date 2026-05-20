import { useState } from 'react'
import DiffViewer from './DiffViewer'
import PRPanel from './PRPanel'
import { useGitStatus } from '../hooks/useGitStatus'

type Tab = 'diff' | 'pr'

interface Props {
  workspaceId: string
}

export default function RightPanel({ workspaceId }: Props) {
  const [tab, setTab]         = useState<Tab>('diff')
  const { status }   = useGitStatus(workspaceId)

  return (
    <div style={{
      width: 340, minWidth: 280, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid #1e2235', background: '#0d0e11', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', borderBottom: '1px solid #1e2235',
        background: '#111318', flexShrink: 0,
      }}>
        {([
          { id: 'diff', label: `Diff${status?.changed_count ? ` (${status.changed_count})` : ''}` },
          { id: 'pr',   label: 'Pull Request' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
              background: tab === t.id ? '#0d0e11' : 'transparent',
              color:      tab === t.id ? '#d1d5db'  : '#4b5563',
              fontSize: 12, fontFamily: 'Inter, sans-serif',
              borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'diff' && <DiffViewer workspaceId={workspaceId} />}
        {tab === 'pr'   && (
          <PRPanel
            workspaceId={workspaceId}
            gitStatus={status}
            onRefreshDiff={() => { setTab('diff') }}
          />
        )}
      </div>
    </div>
  )
}
