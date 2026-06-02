import { useForgeStore } from '../../store'
import { colors, fonts } from '../../theme'
import type { Cleanup } from '../../lib/settings'

export function GeneralSection() {
  const settings = useForgeStore(s => s.settings)
  const providers = useForgeStore(s => s.providers)
  const patch     = useForgeStore(s => s.patchSettings)

  const setGeneral = (mut: (g: typeof settings.general) => typeof settings.general) =>
    patch(s => ({ ...s, general: mut(s.general) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, fontFamily: fonts.body, fontSize: 13, color: colors.bone }}>
      <Group label="Defaults for new workspaces">
        <Field label="Provider">
          <select
            className="forge-select"
            value={settings.general.defaultProvider}
            onChange={(e) => setGeneral(g => ({ ...g, defaultProvider: e.target.value }))}
            style={{ width: '100%' }}
          >
            <option value="">No default</option>
            {providers.map(p => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.display_name}{!p.available && '  (not installed)'}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Base branch for PRs">
          <input
            className="forge-input"
            value={settings.general.defaultBaseBranch}
            onChange={(e) => setGeneral(g => ({ ...g, defaultBaseBranch: e.target.value }))}
            placeholder="main"
            style={{ width: '100%' }}
          />
        </Field>

        <Field label="Cleanup after merge">
          <Segmented<Cleanup>
            value={settings.general.defaultCleanup}
            onChange={(v) => setGeneral(g => ({ ...g, defaultCleanup: v }))}
            options={[
              { value: 'archive', label: 'Archive' },
              { value: 'delete',  label: 'Delete' },
              { value: 'keep',    label: 'Keep' },
            ]}
          />
        </Field>
      </Group>

      <Group label="Confirmations">
        <Toggle
          label="Confirm before archiving a workspace"
          description="Show a confirmation dialog when you archive a workspace."
          checked={settings.general.confirmBeforeArchive}
          onChange={(v) => setGeneral(g => ({ ...g, confirmBeforeArchive: v }))}
        />
        <Toggle
          label="Confirm before deleting a workspace"
          description="Show a confirmation dialog when you permanently delete a workspace."
          checked={settings.general.confirmBeforeDelete}
          onChange={(v) => setGeneral(g => ({ ...g, confirmBeforeDelete: v }))}
        />
      </Group>

      <Group label="Interface">
        <Toggle
          label="Show keyboard hints"
          description="Display small key caps like ⌘↵ in the prompt area."
          checked={settings.general.showKeyboardHints}
          onChange={(v) => setGeneral(g => ({ ...g, showKeyboardHints: v }))}
        />
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
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

function Toggle({
  label, description, checked, onChange,
}: {
  label:       string
  description: string
  checked:     boolean
  onChange:    (v: boolean) => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        cursor: 'pointer',
        padding: '2px 0',
      }}
    >
      <span
        onClick={(e) => { e.preventDefault(); onChange(!checked) }}
        style={{
          position: 'relative',
          width: 34,
          height: 18,
          borderRadius: 9,
          background: checked ? 'var(--accent)' : colors.steel,
          transition: 'background 0.18s ease',
          boxShadow: checked ? '0 0 12px -2px var(--accent)' : undefined,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2, left: checked ? 18 : 2,
            width: 14, height: 14,
            borderRadius: '50%',
            background: colors.cream,
            transition: 'left 0.18s ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}
        />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <span style={{ color: colors.ivory, fontSize: 13 }}>{label}</span>
        <span style={{ color: colors.ash, fontSize: 11.5, lineHeight: 1.5 }}>{description}</span>
      </span>
    </label>
  )
}

function Segmented<T extends string>({
  value, onChange, options,
}: {
  value:     T
  onChange:  (v: T) => void
  options:   { value: T; label: string }[]
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: colors.soot,
        border: `1px solid ${colors.steel}`,
        borderRadius: 6,
        padding: 2,
        gap: 2,
      }}
    >
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              background: active ? colors.coal : 'transparent',
              border: 'none',
              color: active ? colors.ivory : colors.smoke,
              fontFamily: fonts.body,
              fontSize: 12,
              padding: '5px 14px',
              borderRadius: 4,
              cursor: 'pointer',
              boxShadow: active ? 'inset 0 0 0 1px rgba(255,106,31,0.25)' : undefined,
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
