import { useEffect, useState } from 'react'
import { forge, forgeEvents } from '../lib/tauri'
import { useForgeStore } from '../store'
import type { Workspace, ProviderInfo } from '../lib/tauri'
import { colors, fonts, displayItalic, labelStyle } from '../theme'
import { AnvilMark, ChevronMark, GearMark } from './Marks'
import AddRepoModal from './AddRepoModal'
import InstallModal from './InstallModal'
import MergeModal from './MergeModal'
import SettingsModal from './SettingsModal'
import { confirmDialog } from './ConfirmDialog'

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
    runningAgents,
    openSettings,
  } = useForgeStore()
  const confirmBeforeArchive = useForgeStore(s => s.settings.general.confirmBeforeArchive)
  const confirmBeforeDelete  = useForgeStore(s => s.settings.general.confirmBeforeDelete)

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
    if (confirmBeforeDelete) {
      const ok = await confirmDialog({
        title: 'Delete this workspace?',
        body: 'This permanently destroys the worktree, the branch, and all session output. This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Keep',
        destructive: true,
      })
      if (!ok) return
    }
    try { await forge.deleteWorkspace(wsId) }
    catch (err) { console.error('Failed to delete workspace:', err); return }
    await loadData()
  }

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
      {/* Header — brand wordmark */}
      <div
        style={{
          padding: '22px 22px 18px',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          borderBottom: `1px solid ${colors.steel}`,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span
            style={{
              color: colors.accent,
              display: 'inline-flex',
              transform: 'translateY(2px)',
            }}
          >
            <AnvilMark size={20} glow />
          </span>
          <span
            style={{
              ...displayItalic,
              fontSize: 28,
              lineHeight: 1,
              color: colors.cream,
              letterSpacing: '-0.02em',
            }}
          >
            Forge
          </span>
        </div>

        <button
          onClick={() => setShowAddRepo(true)}
          title="Add repository"
          aria-label="Add repository"
          style={{
            background: 'transparent',
            border: `1px solid ${colors.steel}`,
            color: colors.smoke,
            borderRadius: 4,
            width: 26,
            height: 26,
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
            fontFamily: fonts.mono,
            paddingBottom: 2,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.setProperty('color', 'var(--accent)')
            e.currentTarget.style.setProperty('borderColor', 'var(--accent-deep)')
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = colors.smoke
            e.currentTarget.style.borderColor = colors.steel
          }}
        >
          +
        </button>
      </div>

      {/* Section label */}
      <div
        style={{
          padding: '16px 22px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={labelStyle}>Anvils</span>
        <span style={{ ...labelStyle, color: colors.ash, fontSize: 9 }}>
          {repositories.length.toString().padStart(2, '0')}
        </span>
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
                  padding: '9px 22px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: isActive ? colors.coal : 'transparent',
                  color: isActive ? colors.ivory : colors.bone,
                  fontFamily: fonts.body,
                  fontSize: 13,
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
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      left: 0, top: 6, bottom: 6,
                      width: 2,
                      background: colors.accent,
                      borderRadius: '0 2px 2px 0',
                      boxShadow: `0 0 8px var(--accent)`,
                    }}
                  />
                )}
                <span style={{ color: isActive ? colors.accent : colors.ash, display: 'inline-flex' }}>
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
                  <span className="ember-dot" aria-label="agents running" />
                )}
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    color: colors.ash,
                    background: colors.ore,
                    border: `1px solid ${colors.steel}`,
                    borderRadius: 3,
                    padding: '1px 6px',
                    letterSpacing: '0.04em',
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
                        body: 'This removes the repository from Forge. The folder on disk is not touched, and workspaces can no longer be opened.',
                        confirmText: 'Remove',
                        cancelText: 'Keep',
                        destructive: true,
                      })
                      if (!ok) return
                    }
                    forge.removeRepo(repo.id).then(() => loadData()).catch(err => alert(String(err)))
                  }}
                  title={`Remove ${repo.name}`}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: colors.steel,
                    cursor: 'pointer',
                    fontSize: 13,
                    padding: '2px 4px',
                    lineHeight: 1,
                    borderRadius: 4,
                    transition: 'color 0.12s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = colors.rust }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = colors.steel }}
                >
                  ×
                </button>
              </div>

              {expanded && (
                <div className="forge-fade">
                  {repoWorkspaces.map(ws => (
                    <WorkspaceItem
                      key={ws.id}
                      workspace={ws}
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

      {/* Footer mark */}
      <div
        style={{
          borderTop: `1px solid ${colors.steel}`,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <button
          onClick={() => openSettings('general')}
          title="Settings"
          aria-label="Open settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            color: colors.bone,
            fontFamily: fonts.body,
            fontSize: 12,
            padding: '6px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'background 0.12s ease, color 0.12s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = colors.coal
            e.currentTarget.style.setProperty('color', 'var(--accent)')
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = colors.bone
          }}
        >
          <GearMark size={13} />
          <span>Settings</span>
        </button>
        <span
          style={{
            color: colors.steel,
            fontFamily: fonts.mono,
            fontSize: 10,
            letterSpacing: '0.12em',
          }}
        >
          v0.1
        </span>
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
        style={{
          background: 'transparent',
          border: 'none',
          color: colors.accent,
          fontFamily: fonts.mono,
          fontSize: 11,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          padding: 0,
        }}
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
  workspace, active, running, onSelect, onArchive, onDelete, onUpdateProvider, onMerge,
}: {
  workspace: Workspace
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
        padding: '7px 22px 7px 40px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
        background: active
          ? `linear-gradient(90deg, ${colors.coal}, ${colors.iron} 80%)`
          : hover
          ? `${colors.coal}80`
          : 'transparent',
        color: active ? colors.ivory : colors.bone,
        fontFamily: fonts.body,
        fontSize: 12.5,
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      {active && (
        <span
          style={{
            position: 'absolute',
            left: 0, top: 4, bottom: 4,
            width: 2,
            background: colors.accent,
            borderRadius: '0 2px 2px 0',
            boxShadow: `0 0 8px var(--accent)`,
          }}
        />
      )}

      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: tint.dot,
          boxShadow: running
            ? `0 0 0 2px ${tint.ring}, 0 0 10px var(--accent)`
            : `0 0 0 1px rgba(0,0,0,0.4)`,
          flexShrink: 0,
          animation: running ? 'ember-glow-soft 1.6s ease-in-out infinite' : undefined,
        }}
      />

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

      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 9.5,
          color: colors.ash,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          flexShrink: 0,
          opacity: hover || active ? 0.7 : 0.45,
          transition: 'opacity 0.12s ease',
        }}
      >
        {workspace.provider}
      </span>

      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          title="Options"
          style={{
            background: menuOpen ? colors.steel : 'transparent',
            border: 'none',
            color: menuOpen ? colors.ivory : colors.ash,
            cursor: 'pointer',
            fontSize: 13,
            padding: '0 4px',
            lineHeight: 1,
            borderRadius: 3,
            transition: 'all 0.12s ease',
            opacity: hover || active || menuOpen ? 1 : 0,
            letterSpacing: '0.1em',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.setProperty('color', 'var(--accent)') }}
          onMouseLeave={(e) => {
            if (!menuOpen) e.currentTarget.style.color = colors.ash
          }}
        >
          ⋯
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
                borderRadius: 6,
                minWidth: 168,
                padding: '4px 0',
                boxShadow: '0 14px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,106,31,0.06)',
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
        fontSize: 12,
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
          padding: '7px 22px 7px 40px',
          cursor: 'pointer',
          color: colors.ash,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: fonts.body,
          transition: 'color 0.12s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.setProperty('color', 'var(--accent)'))}
        onMouseLeave={(e) => (e.currentTarget.style.color = colors.ash)}
      >
        <span style={{ fontFamily: fonts.mono, fontSize: 11 }}>+</span>
        <span style={{ letterSpacing: '0.02em' }}>New anvil</span>
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
    borderRadius: 3,
    padding: '4px 6px',
    fontFamily: fonts.body,
    outline: 'none',
  }

  return (
    <div
      className="forge-rise"
      style={{
        padding: '8px 22px 10px 40px',
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
              borderRadius: 3,
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
          style={{
            background: colors.accent,
            border: 'none',
            color: colors.soot,
            borderRadius: 3,
            fontSize: 10,
            padding: '4px 10px',
            cursor: 'pointer',
            fontFamily: fonts.mono,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            boxShadow: '0 0 12px -2px rgba(255,106,31,0.6)',
          }}
        >
          Forge
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: `1px solid ${colors.steel}`,
            color: colors.ash,
            borderRadius: 3,
            fontSize: 11,
            padding: '2px 7px',
            cursor: 'pointer',
            fontFamily: fonts.mono,
          }}
        >
          ×
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
          borderRadius: 10,
          padding: '28px 32px',
          width: 420,
          color: colors.ivory,
          fontFamily: fonts.body,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,106,31,0.06)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0, left: 28, right: 28, height: 1,
            background: `linear-gradient(90deg, transparent, var(--accent), transparent)`,
            opacity: 0.5,
          }}
        />
        <div style={labelStyle}>Reforge</div>
        <h2
          style={{
            ...displayItalic,
            margin: '4px 0 8px',
            fontSize: 26,
            color: colors.cream,
            letterSpacing: '-0.01em',
          }}
        >
          Reassign the smith
        </h2>
        <p style={{ color: colors.smoke, fontSize: 13, lineHeight: 1.55 }}>
          Choose a different coding agent for{' '}
          <strong style={{ color: colors.ivory, fontWeight: 500 }}>{ws?.city_name || 'this workspace'}</strong>.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 20 }}>
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button className="btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-strike"
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
