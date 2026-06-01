import { useState } from 'react'
import DiffViewer from './DiffViewer'
import PRPanel from './PRPanel'
import InstallModal from './InstallModal'
import { useGitStatus } from '../hooks/useGitStatus'
import { useForgeStore } from '../store'
import { forge } from '../lib/tauri'
import type { ProviderInfo } from '../lib/tauri'

type Tab = 'diff' | 'pr' | 'settings'

interface Props {
  workspaceId: string
}

export default function RightPanel({ workspaceId }: Props) {
  const [tab, setTab]         = useState<Tab>('diff')
  const [installProvider, setInstallProvider] = useState<ProviderInfo | null>(null)
  const { status }   = useGitStatus(workspaceId)
  const { workspaces, providers, setWorkspaces, setProviders } = useForgeStore()

  const ws = workspaces.find(w => w.id === workspaceId)

  const handleProviderChange = async (provider: string) => {
    try {
      await forge.updateWorkspaceProvider(workspaceId, provider)
      // Update local store state
      const updated = workspaces.map(w => w.id === workspaceId ? { ...w, provider } : w)
      setWorkspaces(updated)
    } catch (e: any) {
      alert(e)
    }
  }

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
          { id: 'diff',     label: `Diff${status?.changed_count ? ` (${status.changed_count})` : ''}` },
          { id: 'pr',       label: 'PR' },
          { id: 'settings', label: 'Settings' },
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
        {tab === 'settings' && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
                Agent Provider
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select
                  value={ws?.provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  style={{
                    flex: 1, background: '#1e293b', border: '1px solid #334155',
                    color: '#e2e8f0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                    outline: 'none',
                  }}
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id} disabled={!p.available}>
                      {p.display_name} {!p.available && '(not found)'}
                    </option>
                  ))}
                </select>
                {!providers.find(p => p.id === ws?.provider)?.available && (
                  <button
                    onClick={() => {
                      const p = providers.find(p => p.id === ws?.provider)
                      if (p) setInstallProvider(p)
                    }}
                    style={{
                      background: '#2563eb', border: 'none', color: '#fff',
                      borderRadius: 6, padding: '8px 12px', fontSize: 12,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    Install
                  </button>
                )}
              </div>
              <p style={{ color: '#475569', fontSize: 11, marginTop: 8 }}>
                Changing the provider will apply to future agent runs in this workspace.
              </p>
            </div>
          </div>
        )}
      </div>

      {installProvider && (
        <InstallModal
          provider={installProvider}
          onClose={() => setInstallProvider(null)}
          onSuccess={() => {
            forge.listProviders().then(setProviders)
            setInstallProvider(null)
          }}
        />
      )}
    </div>
  )
}
