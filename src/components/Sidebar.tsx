import { useEffect, useState } from 'react'
import { forge, forgeEvents } from '../lib/tauri'
import { useForgeStore } from '../store'
import type { Workspace, ProviderInfo } from '../lib/tauri'
import { colors, fonts } from '../theme'
import { isMac } from '../lib/shortcuts'
import { ChevronMark, GearMark } from './Marks'
import { Kbd } from './Kbd'
import AddRepoModal from './AddRepoModal'
import InstallModal from './InstallModal'
import MergeModal from './MergeModal'
import SettingsModal from './SettingsModal'
import { confirmDialog } from './ConfirmDialog'
import { OPENCODE_AGENTS, OPENCODE_MODELS } from '../lib/pills'

export default function Sidebar() {
  const {
    repositories, workspaces,
    setRepositories, setWorkspaces,
    activeWorkspaceId, setActiveWorkspace,
    activeRepoId, setActiveRepo,
    runningAgents,
    openSettings,
    addRepoModalOpen, openAddRepoModal, closeAddRepoModal,
  } = useForgeStore()
  const confirmBeforeArchive = useForgeStore(s => s.settings.general.confirmBeforeArchive)
  const confirmBeforeDelete  = useForgeStore(s => s.settings.general.confirmBeforeDelete)
  const showKeyboardHints    = useForgeStore(s => s.settings.general.showKeyboardHints)

  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())
  const [updateProviderWsId, setUpdateProviderWsId] = useState<string | null>(null)
  const [mergeWsId, setMergeWsId] = useState<string | null>(null)

  const showAddRepo = addRepoModalOpen
  const setShowAddRepo = (v: boolean) => v ? openAddRepoModal() : closeAddRepoModal()

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
    const unlisten = forgeEvents.onWorkspaceCreated(() => { loadData() })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  useEffect(() => {
    const unlisten = forgeEvents.onWorkspaceUpdated(() => { loadData() })
    return () => { unlisten.then(fn => fn()) }
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
    if (confirmBeforeArchive) {
      const ok = await confirmDialog({
        title: 'Archive this workspace?',
        body: 'The worktree branch will be preserved but the workspace will be hidden from the active list. You can restore it from the archived view.',
        confirmText: 'Archive',
        cancelText: 'Keep',
      })
      if (!ok) return
    }
    try { await forge.archiveWorkspace(wsId) }
    catch (err) { console.error('Failed to archive workspace:', err); return }
    await loadData()
  }

  const handleDelete = async (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const ws = workspaces.find(w => w.id === wsId)
    if (confirmBeforeDelete) {
      const ok = await confirmDialog({
        title: 'Delete this workspace?',
        body: 'This permanently destroys the worktree, the branch, and all session output. This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Keep',
        destructive: true,
        requireText: ws?.city_name,
      })
      if (!ok) return
    }
    try { await forge.deleteWorkspace(wsId) }
    catch (err) { console.error('Failed to delete workspace:', err); return }
    await loadData()
  }

  const totalWorkspaces = repositories.reduce(
    (sum, r) => sum + workspaces.filter(w => w.repo_id === r.id).length,
    0
  )

  return (
    <aside
      style={{
        width: 268,
        minWidth: 240,
        background: colors.iron,
        borderRight: `1px solid ${colors.steel}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* macOS traffic-light inset — native title bar overlaps the top-left
          ~80px on macOS, so we keep the row above the chrome empty. */}
      <div
        style={{
          height: 36,
          flexShrink: 0,
          // CSS controls the actual padding on macOS via .sidebar-titlebar
          // (see App.css). We use a marker class so the inset is opt-in.
          ...(isMac() ? { WebkitAppRegion: 'drag' } : {}),
        }}
        className="sidebar-titlebar"
      />

      {/* Section header — "Workspaces" with right-side action icons. */}
      <div
        style={{
          padding: '6px 14px 8px',
          paddingLeft: isMac() ? 90 : 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: fonts.body,
            fontSize: 12,
            fontWeight: 600,
            color: colors.ivory,
            letterSpacing: 0,
          }}
        >
          Workspaces
          <span
            style={{
              marginLeft: 8,
              color: colors.ash,
              fontWeight: 500,
              fontFamily: fonts.mono,
              fontSize: 11,
            }}
          >
            {totalWorkspaces}
          </span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            className="icon-btn"
            title="Filter"
            aria-label="Filter workspaces"
            onClick={() => {/* hook for filter */}}
          >
            <FilterIcon />
          </button>
          <button
            className="icon-btn"
            title="Add repository (⌘N)"
            aria-label="Add repository"
            onClick={() => setShowAddRepo(true)}
          >
            <RepoIcon />
          </button>
          <button
            className="icon-btn"
            title="Link"
            aria-label="Link external workspace"
            onClick={() => {/* hook for link */}}
          >
            <LinkIcon />
          </button>
          <button
            className="icon-btn"
            title="New workspace"
            aria-label="New workspace"
            onClick={() => {
              const firstRepo = repositories[0]
              if (firstRepo) toggleRepo(firstRepo.id)
              setShowAddRepo(true)
            }}
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      <div
        className="forge-stagger"
        style={{ flex: 1, overflowY: 'auto', padding: '0 0 12px' }}
      >
        {repositories.length === 0 && (
          <EmptyRepos onAdd={() => setShowAddRepo(true)} />
        )}

        {repositories.map(repo => {
          const repoWorkspaces = workspaces.filter(w => w.repo_id === repo.id)
          const expanded = expandedRepos.has(repo.id)
          const isActive = activeRepoId === repo.id
          const runningCount = repoWorkspaces.filter(w => runningAgents.has(w.id)).length

          return (
            <div key={repo.id}>
              <div
                onClick={() => toggleRepo(repo.id)}
                style={{
                  padding: '6px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: isActive ? colors.coal : 'transparent',
                  color: isActive ? colors.ivory : colors.bone,
                  fontFamily: fonts.body,
                  fontSize: 12.5,
                  fontWeight: 500,
                  position: 'relative',
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = `${colors.coal}80`
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ color: isActive ? colors.bone : colors.ash, display: 'inline-flex' }}>
                  <ChevronMark size={9} direction={expanded ? 'down' : 'right'} />
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {repo.name}
                </span>
                {runningCount > 0 && (
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: colors.accent,
                      boxShadow: `0 0 6px rgba(var(--accent-rgb),0.6)`,
                    }}
                    aria-label="agents running"
                  />
                )}
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 10.5,
                    color: colors.smoke,
                    letterSpacing: '0.02em',
                  }}
                >
                  {repoWorkspaces.length}
                </span>
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (confirmBeforeDelete) {
                      const ok = await confirmDialog({
                        title: `Remove "${repo.name}"?`,
                        body: 'This removes the repository from Forge. The folder on disk is not touched. Existing workspaces on this repo will be orphaned and can no longer be opened from the sidebar.',
                        confirmText: 'Remove',
                        cancelText: 'Keep',
                        destructive: true,
                      })
                      if (!ok) return
                    }
                    forge.removeRepo(repo.id).then(() => loadData()).catch(err => alert(String(err)))
                  }}
                  title={`Remove ${repo.name}`}
                  className="icon-btn"
                  style={{ width: 22, height: 22 }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
                </button>
              </div>

              {expanded && (
                <div className="forge-fade">
                  {repoWorkspaces.map((ws, i) => (
                    <WorkspaceItem
                      key={ws.id}
                      workspace={ws}
                      index={i + 1}
                      active={activeWorkspaceId === ws.id}
                      running={runningAgents.has(ws.id)}
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

      {/* Footer — flat row, single line. */}
      <div
        style={{
          borderTop: `1px solid ${colors.steel}`,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => openSettings('general')}
          title="Settings (⌘,)"
          aria-label="Open settings"
          className="btn-ghost"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <GearMark size={13} />
          <span>Settings</span>
          {showKeyboardHints && (
            <span style={{ marginLeft: 2, opacity: 0.6 }}>
              <Kbd>{isMac() ? '⌘,' : 'Ctrl+,'}</Kbd>
            </span>
          )}
        </button>
        <button
          onClick={() => useForgeStore.getState().openShortcuts()}
          title="Keyboard shortcuts (?)"
          aria-label="Show keyboard shortcuts"
          className="icon-btn"
        >
          <Kbd>?</Kbd>
        </button>
      </div>

      {showAddRepo && (
        <AddRepoModal onClose={() => setShowAddRepo(false)} onAdded={loadData} />
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

      <SettingsModal />
    </aside>
  )
}

function EmptyRepos({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      style={{
        margin: '24px 22px',
        padding: '28px 18px',
        border: `1px dashed ${colors.steel}`,
        borderRadius: 6,
        textAlign: 'center',
        color: colors.ash,
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      <div style={{ color: colors.smoke, marginBottom: 6 }}>
        No anvils on the floor.
      </div>
      <button
        onClick={onAdd}
        className="btn-ghost"
        style={{ color: 'var(--accent)' }}
      >
        Mount a repository →
      </button>
    </div>
  )
}

const STATUS_TINT: Record<string, { dot: string; ring: string }> = {
  idle:    { dot: colors.ash,      ring: 'transparent' },
  running: { dot: colors.accent,    ring: 'rgba(255,106,31,0.4)' },
  done:    { dot: colors.patina,   ring: 'transparent' },
  error:   { dot: colors.rust,     ring: 'transparent' },
  stopped: { dot: colors.brass,    ring: 'transparent' },
}

function WorkspaceItem({
  workspace, index, active, running, onSelect, onArchive, onDelete, onUpdateProvider, onMerge,
}: {
  workspace: Workspace
  index: number
  active: boolean
  running: boolean
  onSelect: () => void
  onArchive: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
  onUpdateProvider: (wsId: string) => void
  onMerge: (e: React.MouseEvent) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hover, setHover] = useState(false)

  const status = running ? 'running' : workspace.status
  const tint = STATUS_TINT[status] ?? STATUS_TINT.idle

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '5px 14px 5px 30px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        position: 'relative',
        background: active
          ? colors.coal
          : hover
          ? `${colors.coal}66`
          : 'transparent',
        color: active ? colors.ivory : colors.bone,
        fontFamily: fonts.body,
        fontSize: 12.5,
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      <span
        style={{
          color: active ? colors.smoke : colors.ash,
          fontFamily: fonts.mono,
          fontSize: 10.5,
          width: 16,
          flexShrink: 0,
          textAlign: 'right',
          letterSpacing: '0.02em',
        }}
      >
        {index}.
      </span>

      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: active ? 500 : 400,
        }}
      >
        {workspace.city_name}
      </span>

      {/* Right side: status badge. Hidden until hover/active for a cleaner
          default appearance, matching the reference. */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          flexShrink: 0,
          opacity: hover || active ? 1 : 0.65,
          transition: 'opacity 0.12s ease',
        }}
      >
        <span
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: tint.dot,
            boxShadow: running
              ? `0 0 0 2px ${tint.ring}, 0 0 8px var(--accent)`
              : `0 0 0 1px rgba(0,0,0,0.4)`,
            flexShrink: 0,
            animation: running ? 'ember-glow-soft 1.6s ease-in-out infinite' : undefined,
          }}
        />
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 9.5,
            color: colors.smoke,
            letterSpacing: '0.06em',
            textTransform: 'lowercase',
          }}
        >
          {workspace.provider}
        </span>
      </span>

      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          title="Options"
          className="icon-btn"
          style={{
            width: 22, height: 22,
            opacity: hover || active || menuOpen ? 1 : 0,
            transition: 'opacity 0.12s ease',
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1, letterSpacing: '0.1em' }}>⋯</span>
        </button>

        {menuOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 99 }}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
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
                minWidth: 168,
                padding: '4px 0',
                boxShadow: '0 14px 32px rgba(0,0,0,0.6)',
              }}
            >
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
              <div style={{ height: 1, background: colors.steel, margin: '4px 0' }} />
              <MenuItem
                label="Delete"
                color={colors.rust}
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
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 14px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: color || colors.bone,
        fontSize: 12.5,
        fontFamily: fonts.body,
        letterSpacing: 0,
        transition: 'background 0.1s ease, color 0.1s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.ore
        if (!color) e.currentTarget.style.setProperty('color', 'var(--accent)')
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        if (!color) e.currentTarget.style.color = colors.bone
      }}
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
  const [open, setOpen] = useState(false)
  const defaultProvider = useForgeStore(s => s.settings.agents.defaultProvider)
  const fallback        = useForgeStore(s => s.settings.general.defaultProvider)
  const initialProvider = defaultProvider || fallback || 'claude'
  const [provider, setProvider] = useState(initialProvider)
  const [model, setModel] = useState('')
  const [modelCustom, setModelCustom] = useState('')
  const [agent, setAgent] = useState('')
  const [agentCustom, setAgentCustom] = useState('')
  const [installProvider, setInstallProvider] = useState<ProviderInfo | null>(null)
  const { providers, setProviders } = useForgeStore()

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          padding: '5px 14px 5px 30px',
          cursor: 'pointer',
          color: colors.ash,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: fonts.body,
          transition: 'color 0.12s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.setProperty('color', 'var(--accent)'))}
        onMouseLeave={(e) => (e.currentTarget.style.color = colors.ash)}
      >
        <span style={{ fontFamily: fonts.mono, fontSize: 11 }}>+</span>
        <span>New anvil</span>
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

  const selectStyle: React.CSSProperties = {
    flex: 1,
    fontSize: 11,
    background: colors.iron,
    color: colors.bone,
    border: `1px solid ${colors.steel}`,
    borderRadius: 6,
    padding: '4px 6px',
    fontFamily: fonts.body,
    outline: 'none',
  }

  return (
    <div
      className="forge-rise"
      style={{
        padding: '8px 14px 10px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: `${colors.soot}60`,
        borderTop: `1px solid ${colors.steel}`,
        borderBottom: `1px solid ${colors.steel}`,
      }}
    >
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <select
          value={provider}
          onChange={e => { setProvider(e.target.value); setModel(''); setAgent('') }}
          style={selectStyle}
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
              background: 'transparent',
              border: `1px solid var(--accent)`,
              color: colors.accent,
              borderRadius: 6,
              fontSize: 9,
              padding: '3px 7px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: fonts.mono,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Install
          </button>
        )}
        <button
          onClick={handleGo}
          className="btn-primary"
          style={{ padding: '4px 10px', fontSize: 11 }}
        >
          Forge
        </button>
        <button
          onClick={() => setOpen(false)}
          className="icon-btn"
          style={{ width: 22, height: 22 }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
        </button>
      </div>

      {showOpenCodeOptions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={model} onChange={e => setModel(e.target.value)} style={{ ...selectStyle, fontSize: 10 }}>
              {OPENCODE_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select value={agent} onChange={e => setAgent(e.target.value)} style={{ ...selectStyle, fontSize: 10, width: 110, flex: 'none' }}>
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
              style={{ ...selectStyle, fontSize: 10 }}
            />
          )}
          {agent === '__custom__' && (
            <input
              placeholder="Enter agent name…"
              value={agentCustom}
              onChange={e => setAgentCustom(e.target.value)}
              style={{ ...selectStyle, fontSize: 10 }}
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'forge-fade-in 0.18s ease',
      }}
    >
      <div
        className="forge-rise"
        style={{
          background: colors.iron,
          border: `1px solid ${colors.steelHi}`,
          borderRadius: 12,
          padding: '24px 26px',
          width: 420,
          color: colors.ivory,
          fontFamily: fonts.body,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          className="modal-close"
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
        <div
          style={{
            fontSize: 10,
            fontFamily: fonts.mono,
            fontWeight: 600,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: colors.smoke,
            marginBottom: 4,
          }}
        >
          Reforge
        </div>
        <h2
          style={{
            margin: '2px 0 6px',
            fontFamily: fonts.body,
            fontSize: 18,
            fontWeight: 600,
            color: colors.cream,
            letterSpacing: '-0.005em',
          }}
        >
          Reassign the smith
        </h2>
        <p style={{ color: colors.smoke, fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
          Choose a different coding agent for{' '}
          <strong style={{ color: colors.ivory, fontWeight: 500 }}>{ws?.city_name || 'this workspace'}</strong>.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 18 }}>
          <select
            className="forge-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
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
          <p style={{ color: colors.rust, fontSize: 12, marginTop: 12 }}>{error}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleUpdate}
            disabled={loading || provider === ws?.provider}
          >
            {loading ? 'Reforging…' : 'Reforge'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* === Sidebar toolbar icons (stroke-based, 1.5px) === */

function FilterIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4h12M4 8h8M6 12h4" />
    </svg>
  )
}

function RepoIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5.5C2 4.67 2.67 4 3.5 4h9c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5h-9A1.5 1.5 0 0 1 2 10.5v-5Z" />
      <path d="M2 5.5 8 9l6-3.5" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 9.5 9 7.5M6 5.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M10 10.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}
