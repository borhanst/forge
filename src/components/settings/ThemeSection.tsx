import { useForgeStore } from '../../store'
import { colors, fonts } from '../../theme'
import { ACCENT_SWATCHES, type AccentId, type Density } from '../../lib/settings'

export function ThemeSection() {
  const accent           = useForgeStore(s => s.settings.theme.accent)
  const density          = useForgeStore(s => s.settings.theme.density)
  const terminalFontSize = useForgeStore(s => s.settings.theme.terminalFontSize)
  const patch            = useForgeStore(s => s.patchSettings)

  const setAccent    = (id: AccentId)  => patch(s => ({ ...s, theme: { ...s.theme, accent: id } }))
  const setDensity   = (id: Density)   => patch(s => ({ ...s, theme: { ...s.theme, density: id } }))
  const setTermSize  = (n: number)     => patch(s => ({ ...s, theme: { ...s.theme, terminalFontSize: n } }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, fontFamily: fonts.body, fontSize: 13, color: colors.bone }}>
      <Group label="Accent color">
        <p style={{ color: colors.ash, fontSize: 11.5, lineHeight: 1.5, margin: '0 0 14px' }}>
          The single hue that says "this matters". Used for active states, the
          strike button, the running pulse, and the wordmark.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            gap: 10,
          }}
        >
          {ACCENT_SWATCHES.map(sw => {
            const active = sw.id === accent
            return (
              <button
                key={sw.id}
                onClick={() => setAccent(sw.id)}
                title={sw.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 0',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 8,
                    background: sw.base,
                    boxShadow: active
                      ? `0 0 0 2px var(--cream), 0 0 0 4px ${sw.base}, 0 0 18px -2px ${sw.base}`
                      : `inset 0 0 0 1px rgba(0,0,0,0.4)`,
                    transition: 'box-shadow 0.15s ease, transform 0.15s ease',
                    transform: active ? 'scale(1.05)' : 'scale(1)',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 8,
                      background: `linear-gradient(135deg, ${sw.glow}aa 0%, transparent 50%, ${sw.deep}aa 100%)`,
                      mixBlendMode: 'screen',
                      opacity: 0.55,
                    }}
                  />
                </span>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 9.5,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: active ? colors.ivory : colors.smoke,
                    transition: 'color 0.15s ease',
                  }}
                >
                  {sw.label}
                </span>
              </button>
            )
          })}
        </div>
      </Group>

      <Group label="Density">
        <p style={{ color: colors.ash, fontSize: 11.5, lineHeight: 1.5, margin: '0 0 14px' }}>
          Scales the base type size. A full layout-density pass is a future
          slice; this primarily affects body text and elements that use em/rem.
        </p>
        <Segmented<Density>
          value={density}
          onChange={setDensity}
          options={[
            { value: 'compact',  label: 'Compact'  },
            { value: 'cozy',     label: 'Cozy'     },
            { value: 'spacious', label: 'Spacious' },
          ]}
        />
      </Group>

      <Group label="Terminal font size">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <input
            type="range"
            min={12}
            max={16}
            step={1}
            value={terminalFontSize}
            onChange={(e) => setTermSize(parseInt(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 12,
              color: colors.ivory,
              background: colors.coal,
              border: `1px solid ${colors.steel}`,
              borderRadius: 4,
              padding: '4px 10px',
              minWidth: 50,
              textAlign: 'center',
            }}
          >
            {terminalFontSize}px
          </span>
        </div>
        <p style={{ color: colors.ash, fontSize: 11.5, lineHeight: 1.5, margin: '10px 0 0' }}>
          Applies to the xterm shell view in the right panel.
        </p>
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
