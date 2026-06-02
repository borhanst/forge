import { useRef } from 'react'
import { useForgeStore, type SettingsTabId } from '../store'
import { colors, fonts, labelStyle, displayItalic } from '../theme'
import { useModalEscape } from '../hooks/useModalEscape'
import { GeneralSection } from './settings/GeneralSection'
import { ThemeSection } from './settings/ThemeSection'
import { AgentsSection } from './settings/AgentsSection'
import { GithubSection } from './settings/GithubSection'
import { AboutSection } from './settings/AboutSection'

const TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'theme',   label: 'Theme' },
  { id: 'agents',  label: 'Agents' },
  { id: 'github',  label: 'GitHub' },
  { id: 'about',   label: 'About' },
]

export default function SettingsModal() {
  const open           = useForgeStore(s => s.settingsOpen)
  const initialTab     = useForgeStore(s => s.settingsInitialTab)
  const close          = useForgeStore(s => s.closeSettings)
  const rootRef        = useRef<HTMLDivElement>(null)

  useModalEscape(rootRef, close)

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
        zIndex: 110,
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
          width: 640,
          maxWidth: '94vw',
          height: 520,
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

        <header
          style={{
            padding: '22px 28px 16px',
            borderBottom: `1px solid ${colors.steel}`,
          }}
        >
          <div style={labelStyle}>Workshop configuration</div>
          <h2
            style={{
              ...displayItalic,
              margin: '4px 0 0',
              fontSize: 26,
              color: colors.cream,
              letterSpacing: '-0.015em',
            }}
          >
            Settings
          </h2>
        </header>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <nav
            style={{
              width: 150,
              flexShrink: 0,
              borderRight: `1px solid ${colors.steel}`,
              padding: '14px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {TABS.map(t => (
              <TabItem key={t.id} id={t.id} active={initialTab === t.id} label={t.label} />
            ))}
          </nav>

          <main
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px 28px',
              minWidth: 0,
            }}
          >
            {initialTab === 'general' && <GeneralSection />}
            {initialTab === 'theme'   && <ThemeSection />}
            {initialTab === 'agents'  && <AgentsSection />}
            {initialTab === 'github'  && <GithubSection />}
            {initialTab === 'about'   && <AboutSection />}
          </main>
        </div>

        <footer
          style={{
            padding: '12px 28px',
            borderTop: `1px solid ${colors.steel}`,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ ...labelStyle, marginRight: 'auto', color: colors.ash }}>
            Saved automatically
          </span>
          <button className="btn-strike" onClick={close}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}

function TabItem({ id, active, label }: { id: SettingsTabId; active: boolean; label: string }) {
  const open = useForgeStore(s => s.openSettings)
  return (
    <button
      onClick={() => open(id)}
      style={{
        position: 'relative',
        background: active ? colors.coal : 'transparent',
        border: 'none',
        color: active ? colors.ivory : colors.bone,
        fontFamily: fonts.body,
        fontSize: 12.5,
        padding: '9px 18px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background 0.12s ease, color 0.12s ease',
        display: 'block',
        width: '100%',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = `${colors.coal}80` }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {active && (
        <span
          style={{
            position: 'absolute',
            left: 0, top: 8, bottom: 8,
            width: 2,
            background: colors.accent,
            borderRadius: '0 2px 2px 0',
            boxShadow: `0 0 8px var(--accent)`,
          }}
        />
      )}
      {label}
    </button>
  )
}
