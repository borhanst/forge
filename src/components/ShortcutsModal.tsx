import { useMemo, useRef } from 'react'
import { useForgeStore } from '../store'
import { colors, fonts, displayItalic, labelStyle } from '../theme'
import { Kbd } from './Kbd'
import { formatCombo, isMac, type Shortcut } from '../lib/shortcuts'
import { useModalEscape } from '../hooks/useModalEscape'

const GROUPS: Shortcut['group'][] = ['Global', 'Navigation', 'Workspace', 'Editing']

export default function ShortcutsModal({ shortcuts }: { shortcuts: Shortcut[] }) {
  const open  = useForgeStore(s => s.shortcutsOpen)
  const close = useForgeStore(s => s.closeShortcuts)
  const rootRef = useRef<HTMLDivElement>(null)
  useModalEscape(rootRef, close)

  const grouped = useMemo(() => {
    const out: Record<string, Shortcut[]> = {}
    for (const g of GROUPS) out[g] = []
    for (const s of shortcuts) {
      if (s.enabled === false) continue
      out[s.group]?.push(s)
    }
    return out
  }, [shortcuts])

  if (!open) return null

  return (
    <div
      ref={rootRef}
      data-forge-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        animation: 'forge-fade-in 0.18s ease',
      }}
      onClick={close}
    >
      <div
        className="forge-rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.iron,
          border: `1px solid ${colors.steelHi}`,
          borderRadius: 12,
          padding: '24px 28px 20px',
          width: 520,
          maxWidth: '94vw',
          maxHeight: '88vh',
          color: colors.ivory,
          fontFamily: fonts.body,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,106,31,0.06)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
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
        <div style={labelStyle}>Reference</div>
        <h2
          style={{
            ...displayItalic,
            margin: '4px 0 4px',
            fontSize: 24,
            color: colors.cream,
            letterSpacing: '-0.015em',
          }}
        >
          Keyboard shortcuts
        </h2>
        <p style={{ color: colors.smoke, fontSize: 12, margin: '0 0 18px' }}>
          {isMac() ? 'macOS' : 'Windows / Linux'} — press <Kbd>?</Kbd> any time to bring this up.
        </p>

        <div style={{ overflowY: 'auto', paddingRight: 4 }}>
          {GROUPS.map(g => {
            const items = grouped[g]
            if (!items || items.length === 0) return null
            return (
              <section key={g} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    ...labelStyle,
                    color: colors.smoke,
                    fontSize: 9.5,
                    marginBottom: 8,
                  }}
                >
                  {g}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map(s => (
                    <Row key={s.id} combo={s.combo} description={s.description} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginTop: 4,
            paddingTop: 12,
            borderTop: `1px solid ${colors.steel}`,
          }}
        >
          <span style={{ ...labelStyle, color: colors.ash, marginRight: 'auto' }}>
            <Kbd>Esc</Kbd> to close
          </span>
          <button className="btn-ghost" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}

function Row({ combo, description }: { combo: string; description: string }) {
  const parts = formatCombo(combo)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '4px 0',
        fontSize: 12.5,
      }}
    >
      <span style={{ color: colors.bone }}>{description}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        {parts.map((p, i) => (
          <Kbd key={i} size="sm">{p}</Kbd>
        ))}
      </span>
    </div>
  )
}
