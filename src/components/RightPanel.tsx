import { useEffect, useState } from 'react'
import DiffViewer from './DiffViewer'
import PRPanel from './PRPanel'
import InstallModal from './InstallModal'
import { useGitStatus } from '../hooks/useGitStatus'
import { useForgeStore } from '../store'
import { forge } from '../lib/tauri'
import type { ProviderInfo, PullRequestRecord } from '../lib/tauri'
import { colors, fonts, labelStyle } from '../theme'
import { Kbd } from './Kbd'
import { isMac } from '../lib/shortcuts'

type Tab = 'diff' | 'pr' | 'settings'

interface Props {
  workspaceId: string
}

export default function RightPanel({ workspaceId }: Props) {
  const [tab, setTab] = useState<Tab>('diff')
  const [installProvider, setInstallProvider] = useState<ProviderInfo | null>(null)
  const [pr, setPr] = useState<PullRequestRecord | null>(null)
  const { status } = useGitStatus(workspaceId)
  const { workspaces, providers, setWorkspaces, setProviders } = useForgeStore()
  const showHints = useForgeStore(s => s.settings.general.showKeyboardHints)

  useEffect(() => {
    const onSetTab = (e: Event) => {
      const detail = (e as CustomEvent<Tab>).detail
      if (detail === 'diff' || detail === 'pr' || detail === 'settings') setTab(detail)
    }
    window.addEventListener('forge:set-right-tab', onSetTab)
    return () => window.removeEventListener('forge:set-right-tab', onSetTab)
  }, [])

  useEffect(() => {
    forge.getPrStatus(workspaceId).then(setPr).catch(() => {})
  }, [workspaceId])

  const ws = workspaces.find(w => w.id === workspaceId)

  const [mergePush, setMergePush] = useState(!!ws?.merge_push)
  const [mergeCleanup, setMergeCleanup] = useState(ws?.merge_cleanup || 'archive')
  const [savingMerge, setSavingMerge] = useState(false)

  useEffect(() => {
    setMergePush(!!ws?.merge_push)
    setMergeCleanup(ws?.merge_cleanup ?? 'archive')
  }, [workspaceId])

  const handleProviderChange = async (provider: string) => {
    try {
      await forge.updateWorkspaceProvider(workspaceId, provider)
      const updated = workspaces.map(w => w.id === workspaceId ? { ...w, provider } : w)
      setWorkspaces(updated)
    } catch (e: any) {
      alert(e)
    }
  }

  const changedCount = status?.changed_count ?? 0

  return (
    <div
      style={{
        width: 360,
        minWidth: 300,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${colors.steel}`,
        background: colors.iron,
        overflow: 'hidden',
      }}
    >
      {/* PR status header — sits above the tabs, mirrors the reference
          layout (PR #N • status • Create PR button). */}
      <div
        style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: `1px solid ${colors.steel}`,
          flexShrink: 0,
          background: colors.iron,
        }}
      >
        {pr ? (
          <>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                color: colors.bone,
                letterSpacing: '0.02em',
              }}
            >
              PR #{pr.pr_number}
            </span>
            <span
              className={
                pr.merged
                  ? 'status-pill is-ash'
                  : pr.state === 'closed'
                  ? 'status-pill'
                  : pr.draft
                  ? 'status-pill is-ash'
                  : 'status-pill is-patina'
              }
              style={{ fontSize: 10 }}
            >
              {pr.merged
                ? 'Merged'
                : pr.state === 'closed'
                ? 'Closed'
                : pr.draft
                ? 'Draft'
                : 'Ready for review'}
            </span>
            <div style={{ flex: 1 }} />
            <button
              className="btn-primary"
              style={{ padding: '5px 10px', fontSize: 11.5 }}
              onClick={() => pr.html_url && window.__open?.(pr.html_url)}
              title={pr.html_url ?? ''}
            >
              Open PR
            </button>
          </>
        ) : (
          <>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                color: colors.smoke,
                letterSpacing: '0.02em',
              }}
            >
              No PR
            </span>
            <span className="status-pill is-ash" style={{ fontSize: 10 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: colors.smoke }} />
              local changes
            </span>
            <div style={{ flex: 1 }} />
            <button
              className="btn-primary"
              style={{ padding: '5px 10px', fontSize: 11.5 }}
              onClick={() => setTab('pr')}
            >
              Create PR
            </button>
          </>
        )}
      </div>

      {/* File-style tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${colors.steel}`,
          background: colors.iron,
          flexShrink: 0,
          padding: '0 8px',
          gap: 0,
        }}
      >
        {([
          { id: 'diff',     label: 'All files', count: undefined,                  hint: isMac() ? '⇧⌘D' : 'Ctrl+Shift+D' },
          { id: 'diff',     label: 'Changes',   count: changedCount,               hint: undefined,                                          duplicate: true },
          { id: 'pr',       label: 'Ship',      count: undefined,                  hint: isMac() ? '⇧⌘P' : 'Ctrl+Shift+P' },
          { id: 'settings', label: 'Forge',     count: undefined,                  hint: isMac() ? '⇧⌘F' : 'Ctrl+Shift+F' },
        ] as { id: Tab; label: string; count?: number; hint?: string; duplicate?: boolean }[])
          .filter(t => !t.duplicate)
          .map(t => (
            <button
              key={t.label}
              className="tab-file"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              <span>{t.label}</span>
              {t.count !== undefined && t.count > 0 && (
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 10,
                    color: 'var(--accent)',
                    background: 'rgba(var(--accent-rgb), 0.12)',
                    border: '1px solid rgba(var(--accent-rgb), 0.25)',
                    borderRadius: 999,
                    padding: '0 6px',
                    minWidth: 16,
                    textAlign: 'center',
                  }}
                >
                  {t.count}
                </span>
              )}
              {showHints && t.hint && (
                <span style={{ opacity: 0.5, marginLeft: 4 }}>
                  <Kbd size="sm">{t.hint}</Kbd>
                </span>
              )}
            </button>
          ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'diff' && <DiffViewer workspaceId={workspaceId} onSwitchToPR={() => setTab('pr')} />}
        {tab === 'pr'   && (
          <PRPanel
            workspaceId={workspaceId}
            gitStatus={status}
            onRefreshDiff={() => { setTab('diff') }}
          />
        )}
        {tab === 'settings' && (
          <div
            className="forge-stagger"
            style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 22, overflowY: 'auto' }}
          >
            <SettingsField label="Agent provider">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  className="forge-select"
                  value={ws?.provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id} disabled={!p.available}>
                      {p.display_name} {!p.available && '(not found)'}
                    </option>
                  ))}
                </select>
                {!providers.find(p => p.id === ws?.provider)?.available && (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      const p = providers.find(p => p.id === ws?.provider)
                      if (p) setInstallProvider(p)
                    }}
                  >
                    Install
                  </button>
                )}
              </div>
              <Hint>Applies to future agent runs in this workspace.</Hint>
            </SettingsField>

            <div className="seam" style={{ margin: '4px 0' }} />

            <SettingsField label="Merge defaults">
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: colors.ivory,
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: '4px 0',
                }}
              >
                <input
                  type="checkbox"
                  checked={mergePush}
                  onChange={e => setMergePush(e.target.checked)}
                  style={{
                    accentColor: colors.accent,
                    width: 14, height: 14,
                  }}
                />
                Push to remote after merge
              </label>

              <div style={{ marginTop: 10 }}>
                <div style={{ ...labelStyle, fontSize: 9, marginBottom: 6, color: colors.ash }}>
                  Cleanup after merge
                </div>
                <select
                  className="forge-select"
                  value={mergeCleanup}
                  onChange={e => setMergeCleanup(e.target.value)}
                >
                  <option value="archive">Archive workspace</option>
                  <option value="delete">Delete workspace + branch</option>
                  <option value="none">No cleanup</option>
                </select>
              </div>

              <button
                onClick={async () => {
                  setSavingMerge(true)
                  try {
                    await forge.updateWorkspaceMergeSettings(workspaceId, mergePush, mergeCleanup)
                    const updated = workspaces.map(w =>
                      w.id === workspaceId
                        ? { ...w, merge_push: mergePush ? 1 : 0, merge_cleanup: mergeCleanup }
                        : w
                    )
                    setWorkspaces(updated)
                  } catch (e: any) {
                    alert(String(e))
                  } finally {
                    setSavingMerge(false)
                  }
                }}
                disabled={savingMerge}
                className="btn-secondary"
                style={{ marginTop: 12, width: '100%' }}
              >
                {savingMerge ? 'Saving…' : 'Save merge defaults'}
              </button>
            </SettingsField>
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

function SettingsField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        color: colors.ash,
        fontSize: 11,
        lineHeight: 1.5,
        marginTop: 8,
        fontFamily: fonts.body,
      }}
    >
      {children}
    </p>
  )
}
