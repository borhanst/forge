import { useEffect, useState } from 'react'
import DiffViewer from './DiffViewer'
import PRPanel from './PRPanel'
import InstallModal from './InstallModal'
import { useGitStatus } from '../hooks/useGitStatus'
import { useForgeStore } from '../store'
import { forge } from '../lib/tauri'
import type { ProviderInfo } from '../lib/tauri'
import { colors, fonts, labelStyle } from '../theme'

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
  const [tab, setTab] = useState<Tab>('diff')
  const [installProvider, setInstallProvider] = useState<ProviderInfo | null>(null)
  const { status } = useGitStatus(workspaceId)
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
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${colors.steel}`,
          background: colors.iron,
          flexShrink: 0,
          padding: '0 16px',
          gap: 0,
        }}
      >
        {([
          { id: 'diff',     label: `Changes${status?.changed_count ? ` · ${status.changed_count}` : ''}` },
          { id: 'pr',       label: 'Ship' },
          { id: 'settings', label: 'Forge' },
        ] as { id: Tab; label: string }[]).map(t => (
          <RightTab key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
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
            style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22, overflowY: 'auto' }}
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
                    className="btn-ghost"
                    onClick={() => {
                      const p = providers.find(p => p.id === ws?.provider)
                      if (p) setInstallProvider(p)
                    }}
                  >
                    Install
                  </button>
                )}
              </div>
              <Hint>Applies to future agent runs in this anvil.</Hint>
            </SettingsField>

            {(() => {
              const currentProvider = providers.find(p => p.id === ws?.provider)
              const modelOptions = ws?.provider
                ? (PROVIDER_MODELS[ws.provider] ?? [{ value: '', label: 'Default model' }, { value: '__custom__', label: 'Custom…' }])
                : []
              return (
                <>
                  {currentProvider?.supports_model && (
                    <SettingsField label="Model">
                      <select
                        className="forge-select"
                        value={modelInput}
                        onChange={e => setModelInput(e.target.value)}
                      >
                        {modelOptions.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                      {modelInput === '__custom__' && (
                        <input
                          className="forge-input"
                          placeholder="Enter model name…"
                          value={modelCustomInput}
                          onChange={e => setModelCustomInput(e.target.value)}
                          style={{ marginTop: 8 }}
                        />
                      )}
                    </SettingsField>
                  )}

                  {currentProvider?.supports_mode && (
                    <SettingsField label="Mode">
                      <select
                        className="forge-select"
                        value={agentInput}
                        onChange={e => setAgentInput(e.target.value)}
                      >
                        {OPENCODE_AGENTS.map(a => (
                          <option key={a.value} value={a.value}>{a.label}</option>
                        ))}
                      </select>
                      {agentInput === '__custom__' && (
                        <input
                          className="forge-input"
                          placeholder="Enter agent name…"
                          value={agentCustomInput}
                          onChange={e => setAgentCustomInput(e.target.value)}
                          style={{ marginTop: 8 }}
                        />
                      )}
                    </SettingsField>
                  )}

                  {(currentProvider?.supports_model || currentProvider?.supports_mode) && (
                    <div>
                      <button className="btn-strike" onClick={handleSaveConfig} style={{ width: '100%' }}>
                        Save configuration
                      </button>
                      <Hint>
                        Passed as <Code>--model</Code>
                        {currentProvider?.supports_mode && (
                          <>{' '}and <Code>--agent</Code></>
                        )}
                        {' '}flags to <Code>{ws?.provider}</Code>.
                      </Hint>
                    </div>
                  )}
                </>
              )
            })()}

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
                className="btn-ghost"
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

function RightTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        flex: 1,
        padding: '12px 0 13px',
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
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = colors.bone }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = colors.ash }}
    >
      {label}
      {active && (
        <span
          style={{
            position: 'absolute',
            left: '25%', right: '25%', bottom: -1,
            height: 1,
            background: colors.accent,
            boxShadow: `0 0 8px var(--accent)`,
          }}
        />
      )}
    </button>
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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        color: colors.bone,
        background: colors.coal,
        border: `1px solid ${colors.steel}`,
        borderRadius: 3,
        padding: '1px 6px',
        fontSize: 10.5,
        fontFamily: fonts.mono,
      }}
    >
      {children}
    </code>
  )
}
