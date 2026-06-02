import { useEffect, useState } from 'react'
import DiffViewer from './DiffViewer'
import PRPanel from './PRPanel'
import InstallModal from './InstallModal'
import { useGitStatus } from '../hooks/useGitStatus'
import { useForgeStore } from '../store'
import { forge } from '../lib/tauri'
import type { ProviderInfo } from '../lib/tauri'

const PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
  opencode: [
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
  ],
  claude: [
    { value: '', label: 'Default model' },
    { value: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { value: '__custom__', label: 'Custom…' },
  ],
  codex: [
    { value: '', label: 'Default model' },
    { value: 'o4-mini', label: 'o4-mini' },
    { value: 'o3', label: 'o3' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: '__custom__', label: 'Custom…' },
  ],
  gemini: [
    { value: '', label: 'Default model' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: '__custom__', label: 'Custom…' },
  ],
  openclaude: [
    { value: '', label: 'Default model' },
    { value: '__custom__', label: 'Custom (Ollama model)…' },
  ],
  kilo: [
    { value: '', label: 'Default model' },
    { value: 'kilo/kilo-auto/free', label: 'Auto — Free (recommended)' },
    { value: 'kilo/kilo-auto/balanced', label: 'Auto — Balanced' },
    { value: 'kilo/kilo-auto/frontier', label: 'Auto — Frontier' },
    { value: 'kilo/kilo-auto/small', label: 'Auto — Small' },
    { value: 'kilo/anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
    { value: 'kilo/anthropic/claude-opus-4.5', label: 'Claude Opus 4.5' },
    { value: 'kilo/anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
    { value: 'kilo/~anthropic/claude-sonnet-latest', label: 'Claude Sonnet (latest)' },
    { value: 'kilo/~google/gemini-pro-latest', label: 'Gemini Pro (latest)' },
    { value: 'kilo/~google/gemini-flash-latest', label: 'Gemini Flash (latest)' },
    { value: 'kilo/~openai/gpt-latest', label: 'GPT (latest)' },
    { value: 'kilo/deepseek/deepseek-chat', label: 'DeepSeek Chat' },
    { value: '__custom__', label: 'Custom… (provider/model)' },
  ],
}

const OPENCODE_AGENTS = [
  { value: '', label: 'Default (coding)' },
  { value: 'plan', label: 'Plan' },
  { value: '__custom__', label: 'Custom…' },
]

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

  const wsConfig: Record<string, string> = ws?.provider_config
    ? (JSON.parse(ws.provider_config) as Record<string, string>)
    : {}

  const [modelInput, setModelInput] = useState(wsConfig.model ?? '')
  const [modelCustomInput, setModelCustomInput] = useState('')
  const [agentInput, setAgentInput] = useState(wsConfig.agent ?? '')
  const [agentCustomInput, setAgentCustomInput] = useState('')

  const [mergePush, setMergePush] = useState(!!ws?.merge_push)
  const [mergeCleanup, setMergeCleanup] = useState(ws?.merge_cleanup || 'archive')
  const [savingMerge, setSavingMerge] = useState(false)

  useEffect(() => {
    setModelInput(wsConfig.model ?? '')
    setModelCustomInput('')
    setAgentInput(wsConfig.agent ?? '')
    setAgentCustomInput('')
  }, [workspaceId])

  useEffect(() => {
    setMergePush(!!ws?.merge_push)
    setMergeCleanup(ws?.merge_cleanup ?? 'archive')
  }, [workspaceId])

  const resolveModel = modelInput === '__custom__' ? modelCustomInput : modelInput
  const resolveAgent = agentInput === '__custom__' ? agentCustomInput : agentInput

  const handleProviderChange = async (provider: string) => {
    try {
      await forge.updateWorkspaceProvider(workspaceId, provider)
      const updated = workspaces.map(w => w.id === workspaceId ? { ...w, provider } : w)
      setWorkspaces(updated)
    } catch (e: any) {
      alert(e)
    }
  }

  const handleSaveConfig = async () => {
    const config: Record<string, string> = {}
    if (resolveModel) config.model = resolveModel
    if (resolveAgent) config.agent = resolveAgent
    try {
      await forge.updateWorkspaceConfig(workspaceId, config)
      const updated = workspaces.map(w =>
        w.id === workspaceId
          ? { ...w, provider_config: Object.keys(config).length ? JSON.stringify(config) : null }
          : w
      )
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
        {tab === 'diff' && <DiffViewer workspaceId={workspaceId} onSwitchToPR={() => setTab('pr')} />}
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

            {(() => {
              const currentProvider = providers.find(p => p.id === ws?.provider)
              const modelOptions = ws?.provider ? (PROVIDER_MODELS[ws.provider] ?? [{ value: '', label: 'Default model' }, { value: '__custom__', label: 'Custom…' }]) : []
              return (
                <>
                  {currentProvider?.supports_model && (
                    <div>
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
                        Model
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <select
                          value={modelInput}
                          onChange={e => setModelInput(e.target.value)}
                          style={{
                            background: '#1e293b', border: '1px solid #334155',
                            color: '#e2e8f0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                            outline: 'none',
                          }}
                        >
                          {modelOptions.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                        {modelInput === '__custom__' && (
                          <input
                            placeholder="Enter model name…"
                            value={modelCustomInput}
                            onChange={e => setModelCustomInput(e.target.value)}
                            style={{
                              background: '#1e293b', border: '1px solid #334155',
                              color: '#e2e8f0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                              outline: 'none',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {currentProvider?.supports_mode && (
                    <div>
                      <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>
                        Mode
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <select
                          value={agentInput}
                          onChange={e => setAgentInput(e.target.value)}
                          style={{
                            background: '#1e293b', border: '1px solid #334155',
                            color: '#e2e8f0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                            outline: 'none',
                          }}
                        >
                          {OPENCODE_AGENTS.map(a => (
                            <option key={a.value} value={a.value}>{a.label}</option>
                          ))}
                        </select>
                        {agentInput === '__custom__' && (
                          <input
                            placeholder="Enter agent name…"
                            value={agentCustomInput}
                            onChange={e => setAgentCustomInput(e.target.value)}
                            style={{
                              background: '#1e293b', border: '1px solid #334155',
                              color: '#e2e8f0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                              outline: 'none',
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {(currentProvider?.supports_model || currentProvider?.supports_mode) && (
                    <>
                      <button
                        onClick={handleSaveConfig}
                        style={{
                          background: '#2563eb', border: 'none', color: '#fff',
                          borderRadius: 6, padding: '8px 12px', fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Save
                      </button>
                      <p style={{ color: '#475569', fontSize: 11, margin: 0 }}>
                        Passed as <code style={{ color: '#94a3b8' }}>--model</code>{currentProvider?.supports_mode && <> and <code style={{ color: '#94a3b8' }}>--agent</code></>} flags to <code style={{ color: '#94a3b8' }}>{ws?.provider}</code>.
                      </p>
                    </>
                  )}
                </>
              )
            })()}

            <div style={{ borderTop: '1px solid #1e2235', paddingTop: 16 }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: 11, marginBottom: 12, fontWeight: 600, textTransform: 'uppercase' }}>
                Merge Defaults
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d1d5db', fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={mergePush}
                    onChange={e => setMergePush(e.target.checked)}
                    style={{ accentColor: '#2563eb' }}
                  />
                  Push to remote after merge
                </label>

                <div>
                  <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>
                    Cleanup after merge
                  </label>
                  <select
                    value={mergeCleanup}
                    onChange={e => setMergeCleanup(e.target.value)}
                    style={{
                      width: '100%', background: '#1e293b', border: '1px solid #334155',
                      color: '#e2e8f0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                      outline: 'none',
                    }}
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
                  style={{
                    background: '#2563eb', border: 'none', color: '#fff',
                    borderRadius: 6, padding: '8px 12px', fontSize: 12,
                    cursor: 'pointer', opacity: savingMerge ? 0.6 : 1,
                  }}
                >
                  {savingMerge ? 'Saving...' : 'Save Merge Settings'}
                </button>
              </div>
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
