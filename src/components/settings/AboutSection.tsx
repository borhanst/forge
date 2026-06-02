import { colors, fonts, displayItalic, labelStyle } from '../../theme'

export function AboutSection() {
  const tauriVersion = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { version?: string } } })
    .__TAURI_INTERNALS__?.metadata?.version ?? '—'

  const webview = (() => {
    const ua = navigator.userAgent
    if (ua.includes('Edg/'))     return `Edge (${ua.match(/Edg\/([\d.]+)/)?.[1] ?? '?'})`
    if (ua.includes('Chrome/'))  return `Chromium (${ua.match(/Chrome\/([\d.]+)/)?.[1] ?? '?'})`
    if (ua.includes('Firefox/')) return `Firefox (${ua.match(/Firefox\/([\d.]+)/)?.[1] ?? '?'})`
    if (ua.includes('Safari/'))  return `WebKit (${ua.match(/Version\/([\d.]+)/)?.[1] ?? '?'})`
    return 'WebView'
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, fontFamily: fonts.body, fontSize: 13, color: colors.bone }}>
      <Group label="The application">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
          <span
            style={{
              ...displayItalic,
              fontSize: 28,
              color: colors.cream,
              letterSpacing: '-0.015em',
              lineHeight: 1,
            }}
          >
            Forge
          </span>
          <span style={{ color: colors.smoke, fontSize: 12 }}>
            The anvil for AI agents.
          </span>
        </div>
      </Group>

      <Group label="Version">
        <Row k="App"        v="0.1" />
        <Row k="Tauri"      v={tauriVersion} />
        <Row k="WebView"    v={webview} />
      </Group>

      <Group label="Resources">
        <Row
          k="Repository"
          v="github.com/anomalyco/forge"
          href="https://github.com/anomalyco/forge"
        />
        <Row
          k="License"
          v="MIT"
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
          ...labelStyle,
          fontSize: 9.5,
          marginBottom: 14,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </section>
  )
}

function Row({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        background: colors.coal,
        border: `1px solid ${colors.steel}`,
        borderRadius: 4,
      }}
    >
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 9.5,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: colors.ash,
          width: 110,
        }}
      >
        {k}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => { e.preventDefault(); window.__open?.(href) }}
          style={{
            color: colors.accent,
            fontSize: 12,
            fontFamily: fonts.mono,
            textDecoration: 'none',
            borderBottom: `1px dotted ${colors.accent}`,
          }}
        >
          {v} ↗
        </a>
      ) : (
        <span
          style={{
            color: colors.ivory,
            fontSize: 12,
            fontFamily: fonts.mono,
          }}
        >
          {v}
        </span>
      )}
    </div>
  )
}

declare global { interface Window { __open?: (url: string) => void } }
