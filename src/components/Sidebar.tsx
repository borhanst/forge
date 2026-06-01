import { useEffect, useState } from 'react'
import { forge, forgeEvents } from '../lib/tauri'
import { useForgeStore } from '../store'
import type { Workspace, ProviderInfo } from '../lib/tauri'
import AddRepoModal from './AddRepoModal'
import InstallModal from './InstallModal'
import MergeModal from './MergeModal'

const OPENCODE_MODELS = [
  { value: '', label: 'Default model' },
  { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-4-20250514', label: 'Claude 4' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'openai/o3', label: 'o3' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'opencode/deepseek-v4-flash-free', label: 'DeepSeek V4 Flash Free' },
  { value: '__custom__', label: 'Custom…' },
]

const OPENCODE_AGENTS = [
  { value: '', label: 'Default (coding)' },
  { value: 'plan', label: 'Plan' },
  { value: '__custom__', label: 'Custom…' },
]

export default function Sidebar() {
  const {
    repositories, workspaces,
    setRepositories, setWorkspaces,
    activeWorkspaceId, setActiveWorkspace,
    activeRepoId, setActiveRepo,
  } = useForgeStore()

  const [showAddRepo, setShowAddRepo]     = useState(false)
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())
  const [updateProviderWsId, setUpdateProviderWsId] = useState<string | null>(null)
  const [mergeWsId, setMergeWsId] = useState<string | null>(null)

  const loadData = async () => {
    try {
      const [repos, wss] = await Promise.all([
        forge.listRepositories(),
        forge.listWorkspaces(),
      ])
      setRepositories(repos)
      setWorkspaces(wss)
    } catch (e) {
      console.error('[Sidebar] Failed to load data:', e)
    }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const unlisten = forgeEvents.onWorkspaceCreated(() => {
      loadData()
    })
    return () => {
      unlisten.then(fn => fn())
    }
  }, [])

  useEffect(() => {
    const unlisten = forgeEvents.onWorkspaceUpdated(() => {
      loadData()
    })
    return () => {
      unlisten.then(fn => fn())
    }
  }, [])

  const toggleRepo = (id: string) => {
    setExpandedRepos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setActiveRepo(id)
  }

  const handleCreateWorkspace = async (repoId: string, provider: string, providerConfig?: Record<string, string>) => {
    try {
      await forge.createWorkspace(repoId, provider, providerConfig)
    } catch (e) {
      console.error('Failed to create workspace:', e)
      alert(`Failed to create workspace: ${e}`)
      return
    }
    await loadData()
  }

  const handleArchive = async (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await forge.archiveWorkspace(wsId)
    } catch (err) {
      console.error('Failed to archive workspace:', err)
      return
    }
    await loadData()
  }

  const handleDelete = async (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this workspace permanently?')) return
    try {
      await forge.deleteWorkspace(wsId)
    } catch (err) {
      console.error('Failed to delete workspace:', err)
      return
    }
    await loadData()
  }

  return (
    <aside style={{
      width: 240, minWidth: 200, background: '#111318',
      borderRight: '1px solid #23263a', display: 'flex',
      flexDirection: 'column', height: '100vh', overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 14px 10px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #23263a',
      }}>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 18, color: '#fff' }}>
          Forge
        </span>
        <button
          onClick={() => setShowAddRepo(true)}
          title="Add Repository"
          style={{
            background: '#2563eb', border: 'none', color: '#fff',
            borderRadius: 6, width: 26, height: 26, cursor: 'pointer',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >+</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {repositories.length === 0 && (
          <div style={{ color: '#4b5563', fontSize: 13, padding: '24px 16px', textAlign: 'center' }}>
            No repositories yet.<br />
            <span
              style={{ color: '#2563eb', cursor: 'pointer' }}
              onClick={() => setShowAddRepo(true)}
            >Add one &rarr;</span>
          </div>
        )}

          {repositories.map(repo => {
          const repoWorkspaces = workspaces.filter(w => w.repo_id === repo.id)
          const expanded       = expandedRepos.has(repo.id)

          return (
            <div key={repo.id}>
              <div
                onClick={() => toggleRepo(repo.id)}
                style={{
                  padding: '7px 14px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 8,
                  background: activeRepoId === repo.id ? '#1e2235' : 'transparent',
                  color: '#d1d5db',
                  fontSize: 13, fontWeight: 500,
                }}
              >
                <span style={{ fontSize: 10, color: '#6b7280' }}>{expanded ? '\u25BC' : '\u25B6'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {repo.name}
                </span>
                <span style={{
                  fontSize: 11, background: '#1e2235', color: '#6b7280',
                  borderRadius: 10, padding: '1px 6px', marginRight: 4,
                }}>
                  {repoWorkspaces.length}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const name = repo.name
                    if (!confirm(`Remove "${name}" from Forge? This does NOT delete the folder on disk.`)) return
                    forge.removeRepo(repo.id).then(() => loadData()).catch(err => alert(String(err)))
                  }}
                  title={`Remove ${repo.name}`}
                  style={{
                    background: 'transparent', border: 'none', color: '#4b5563',
                    cursor: 'pointer', fontSize: 13, padding: '2px 4px', lineHeight: 1,
                    borderRadius: 4, opacity: 0.5,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#4b5563'; e.currentTarget.style.opacity = '0.5' }}
                >✕</button>
              </div>

              {expanded && (
                <div>
                  {repoWorkspaces.map(ws => (
                    <WorkspaceItem
                      key={ws.id}
                      workspace={ws}
                      active={activeWorkspaceId === ws.id}
                      onSelect={() => { setActiveWorkspace(ws.id); setActiveRepo(repo.id) }}
                      onArchive={(e) => handleArchive(ws.id, e)}
                      onDelete={(e) => handleDelete(ws.id, e)}
                      onUpdateProvider={(wsId) => setUpdateProviderWsId(wsId)}
                      onMerge={() => setMergeWsId(ws.id)}
                    />
                  ))}

                  <NewWorkspaceRow
                    repoId={repo.id}
                    onCreate={handleCreateWorkspace}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showAddRepo && (
        <AddRepoModal
          onClose={() => setShowAddRepo(false)}
          onAdded={loadData}
        />
      )}

      {updateProviderWsId && (
        <UpdateProviderModal
          workspaceId={updateProviderWsId}
          onClose={() => setUpdateProviderWsId(null)}
          onUpdated={loadData}
        />
      )}

      {mergeWsId && (() => {
        const ws = workspaces.find(w => w.id === mergeWsId)
        if (!ws) return null
        return (
          <MergeModal
            workspaceId={mergeWsId}
            workspaceName={ws.city_name}
            defaultPush={!!ws.merge_push}
            defaultCleanup={ws.merge_cleanup || 'archive'}
            onClose={() => setMergeWsId(null)}
            onMerged={() => { setMergeWsId(null); loadData() }}
          />
        )
      })()}
    </aside>
  )
}

function WorkspaceItem({
  workspace, active, onSelect, onArchive, onDelete, onUpdateProvider, onMerge,
}: {
  workspace: Workspace
  active: boolean
  onSelect: () => void
  onArchive: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onUpdateProvider: (wsId: string) => void
  onMerge: (e: React.MouseEvent) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const STATUS_COLOR: Record<string, string> = {
    idle: '#6b7280', running: '#f59e0b', done: '#10b981', error: '#ef4444',
  }

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '6px 14px 6px 30px', cursor: 'pointer', display: 'flex',
        alignItems: 'center', gap: 8, position: 'relative',
        background: active ? '#1e3a5f' : 'transparent',
        color: active ? '#93c5fd' : '#9ca3af',
        fontSize: 12,
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: STATUS_COLOR[workspace.status] ?? '#6b7280',
        flexShrink: 0,
      }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {workspace.city_name}
      </span>
      <span style={{ fontSize: 10, color: '#4b5563', flexShrink: 0 }}>
        {workspace.provider}
      </span>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          title="Options"
          style={{
            background: menuOpen ? '#1e293b' : 'transparent', border: 'none', color: '#4b5563',
            cursor: 'pointer', fontSize: 14, padding: '2px 4px', lineHeight: 1, borderRadius: 4,
          }}
        >⋯</button>

        {menuOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 99 }}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
            />
            <div style={{
              position: 'absolute', right: 0, top: '100%', zIndex: 100,
              background: '#1a1c24', border: '1px solid #334155', borderRadius: 6,
              minWidth: 150, padding: '4px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}>
              <MenuItem
                label="Update Provider"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onUpdateProvider(workspace.id) }}
              />
              <MenuItem
                label="Merge"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMerge(e) }}
              />
              <MenuItem
                label="Archive"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive(e) }}
              />
              <div style={{ height: 1, background: '#334155', margin: '4px 0' }} />
              <MenuItem
                label="Delete"
                color="#ef4444"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(e) }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MenuItem({ label, color, onClick }: { label: string; color?: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: color || '#d1d5db', fontSize: 12, fontFamily: 'Inter, sans-serif',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  )
}

function NewWorkspaceRow({
  repoId, onCreate,
}: {
  repoId: string
  onCreate: (repoId: string, provider: string, providerConfig?: Record<string, string>) => void
}) {
  const [open, setOpen]         = useState(false)
  const [provider, setProvider] = useState('claude')
  const [model, setModel]       = useState('')
  const [modelCustom, setModelCustom] = useState('')
  const [agent, setAgent]       = useState('')
  const [agentCustom, setAgentCustom] = useState('')
  const [installProvider, setInstallProvider] = useState<ProviderInfo | null>(null)
  const { providers, setProviders } = useForgeStore()

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          padding: '5px 14px 5px 30px', cursor: 'pointer',
          color: '#4b5563', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span>+</span> New workspace
      </div>
    )
  }

  const selectedProvider = providers.find(p => p.id === provider)
  const showOpenCodeOptions = provider === 'opencode'

  const handleGo = () => {
    const config: Record<string, string> = {}
    const resolvedModel = model === '__custom__' ? modelCustom : model
    const resolvedAgent = agent === '__custom__' ? agentCustom : agent
    if (resolvedModel) config.model = resolvedModel
    if (resolvedAgent) config.agent = resolvedAgent
    onCreate(repoId, provider, Object.keys(config).length ? config : undefined)
    setOpen(false)
  }

  return (
    <div style={{ padding: '6px 14px 6px 30px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <select
          value={provider}
          onChange={e => { setProvider(e.target.value); setModel(''); setAgent('') }}
          style={{
            flex: 1, fontSize: 11, background: '#1a1c24',
            color: '#d1d5db', border: '1px solid #374151', borderRadius: 4, padding: '2px 4px',
          }}
        >
          {providers.map(p => (
            <option key={p.id} value={p.id} disabled={!p.available}>
              {p.display_name}{!p.available ? ' (not installed)' : ''}
            </option>
          ))}
        </select>
        {selectedProvider && !selectedProvider.available && (
          <button
            onClick={() => setInstallProvider(selectedProvider)}
            style={{
              background: '#2563eb', border: 'none', color: '#fff',
              borderRadius: 4, fontSize: 10, padding: '2px 6px', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Install
          </button>
        )}
        <button
          onClick={handleGo}
          style={{
            background: '#2563eb', border: 'none', color: '#fff',
            borderRadius: 4, fontSize: 11, padding: '2px 8px', cursor: 'pointer',
          }}
        >Go</button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent', border: '1px solid #374151', color: '#6b7280',
            borderRadius: 4, fontSize: 11, padding: '2px 6px', cursor: 'pointer',
          }}
        >✕</button>
      </div>

      {showOpenCodeOptions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 0 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              style={{
                flex: 1, fontSize: 10, background: '#1a1c24',
                color: '#d1d5db', border: '1px solid #374151', borderRadius: 4,
                padding: '2px 4px', outline: 'none',
              }}
            >
              {OPENCODE_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={agent}
              onChange={e => setAgent(e.target.value)}
              style={{
                width: 110, fontSize: 10, background: '#1a1c24',
                color: '#d1d5db', border: '1px solid #374151', borderRadius: 4,
                padding: '2px 4px', outline: 'none',
              }}
            >
              {OPENCODE_AGENTS.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          {model === '__custom__' && (
            <input
              placeholder="Enter model name…"
              value={modelCustom}
              onChange={e => setModelCustom(e.target.value)}
              style={{
                fontSize: 10, background: '#1a1c24',
                color: '#d1d5db', border: '1px solid #374151', borderRadius: 4,
                padding: '2px 4px', outline: 'none',
              }}
            />
          )}
          {agent === '__custom__' && (
            <input
              placeholder="Enter agent name…"
              value={agentCustom}
              onChange={e => setAgentCustom(e.target.value)}
              style={{
                fontSize: 10, background: '#1a1c24',
                color: '#d1d5db', border: '1px solid #374151', borderRadius: 4,
                padding: '2px 4px', outline: 'none',
              }}
            />
          )}
        </div>
      )}

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

function UpdateProviderModal({
  workspaceId, onClose, onUpdated,
}: {
  workspaceId: string
  onClose: () => void
  onUpdated: () => void
}) {
  const { workspaces, providers, setProviders, setWorkspaces } = useForgeStore()
  const ws = workspaces.find(w => w.id === workspaceId)
  const [provider, setProvider] = useState(ws?.provider || 'claude')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    forge.listProviders().then(setProviders).catch(() => {})
  }, [])

  const handleUpdate = async () => {
    setError('')
    setLoading(true)
    try {
      await forge.updateWorkspaceProvider(workspaceId, provider)
      const updated = workspaces.map(w => w.id === workspaceId ? { ...w, provider } : w)
      setWorkspaces(updated)
      onUpdated()
      onClose()
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const selectedProvider = providers.find(p => p.id === provider)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#1a1c24', border: '1px solid #334155',
        borderRadius: 10, padding: '24px 28px', width: 380,
        color: '#e2e8f0', fontFamily: 'Inter, sans-serif',
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Update Provider
        </h2>
        <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>
          Change the coding agent for <strong>{ws?.city_name || 'this workspace'}</strong>.
        </p>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 16 }}>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={{
              flex: 1, background: '#1e293b', border: '1px solid #334155',
              color: '#e2e8f0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
              outline: 'none',
            }}
          >
            {providers.map(p => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.display_name} {!p.available && '(not installed)'}
              </option>
            ))}
          </select>
          {selectedProvider && !selectedProvider.available && (
            <InstallModal
              provider={selectedProvider}
              onClose={() => {}}
              onSuccess={() => forge.listProviders().then(setProviders)}
            />
          )}
        </div>

        {error && (
          <p style={{ color: '#ef4444', fontSize: 12, marginTop: 10 }}>{error}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #374151',
              color: '#94a3b8', borderRadius: 6, padding: '7px 16px',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={loading || provider === ws?.provider}
            style={{
              background: provider === ws?.provider ? '#334155' : '#2563eb',
              border: 'none', color: '#fff', borderRadius: 6,
              padding: '7px 18px', fontSize: 13,
              cursor: provider === ws?.provider ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Updating...' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  )
}
