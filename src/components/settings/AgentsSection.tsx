import { useState } from 'react'
import { useForgeStore } from '../../store'
import { colors, fonts } from '../../theme'

export function AgentsSection() {
  const providers        = useForgeStore(s => s.providers)
  const setProviders     = useForgeStore(s => s.setProviders)
  const defaultProvider  = useForgeStore(s => s.settings.agents.defaultProvider)
  const patch            = useForgeStore(s => s.patchSettings)
  const [rescanning, setRescanning] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')

  const onRescan = async () => {
    setError('')
    setInfo('')
    setRescanning(true)
    try {
      const { forge } = await import('../../lib/tauri')
      const fresh = await forge.listProviders()
      setProviders(fresh)
      setInfo(`Found ${fresh.length} provider${fresh.length === 1 ? '' : 's'}.`)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setRescanning(false)
    }
  }

  const setDefault = (id: string) =>
    patch(s => ({ ...s, agents: { ...s.agents, defaultProvider: id } }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, fontFamily: fonts.body, fontSize: 13, color: colors.bone }}>
      <Group label="Default provider for new workspaces">
        <p style={{ color: colors.ash, fontSize: 11.5, lineHeight: 1.5, margin: '0 0 14px' }}>
          When you open the "+ new anvil" row for a repository, this provider
          will be pre-selected. You can still change it per-workspace.
        </p>
        <Field label="Provider">
          <select
            className="forge-select"
            value={defaultProvider}
            onChange={(e) => setDefault(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">No default (use claude)</option>
            {providers.map(p => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.display_name}{!p.available && '  (not installed)'}
              </option>
            ))}
          </select>
        </Field>
      </Group>

      <Group label="Provider availability">
        <p style={{ color: colors.ash, fontSize: 11.5, lineHeight: 1.5, margin: '0 0 14px' }}>
          Re-scan the system PATH for installed agent CLIs. Useful after you
          install a new CLI in another terminal.
        </p>
        <button
          className="btn-ghost"
          onClick={onRescan}
          disabled={rescanning}
          style={{ minWidth: 160 }}
        >
          {rescanning ? 'Scanning…' : 'Re-scan providers'}
        </button>

        {info && (
          <div style={{ marginTop: 10, fontSize: 12, color: colors.patina }}>
            {info}
          </div>
        )}
        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: colors.rust }}>
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          {providers.map(p => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                background: colors.coal,
                border: `1px solid ${colors.steel}`,
                borderRadius: 4,
              }}
            >
              <span
                style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: p.available ? colors.patina : colors.ash,
                  boxShadow: p.available ? `0 0 6px ${colors.patina}` : undefined,
                }}
              />
              <span style={{ color: colors.ivory, fontSize: 12, flex: 1 }}>{p.display_name}</span>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 9.5,
                  letterSpacing: '0.12em',
                  color: p.available ? colors.patina : colors.ash,
                  textTransform: 'uppercase',
                }}
              >
                {p.available ? 'ready' : 'missing'}
              </span>
            </div>
          ))}
        </div>
      </Group>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: colors.smoke,
          marginBottom: 14,
        }}
      >
        {label}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: colors.ash,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}
