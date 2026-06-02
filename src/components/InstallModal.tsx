import { useRef, useState } from 'react'
import { forge } from '../lib/tauri'
import type { ProviderInfo } from '../lib/tauri'
import { colors, fonts, labelStyle } from '../theme'
import { useModalEscape } from '../hooks/useModalEscape'

export default function InstallModal({
  provider,
  onClose,
  onSuccess,
}: {
  provider: ProviderInfo
  onClose: () => void
  onSuccess: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  useModalEscape(rootRef, onClose)

  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)

  const installLabel = (() => {
    switch (provider.id) {
      case 'claude': return 'npm i -g @anthropic-ai/claude-code'
      case 'codex':  return 'npm i -g @openai/codex'
      case 'gemini': return 'npm i -g @google/gemini-cli'
      default:       return `install ${provider.cli_binary}`
    }
  })()

  const handleInstall = async () => {
    setError('')
    setLoading(true)
    try {
      await forge.installProvider(provider.id)
      setDone(true)
      onSuccess()
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

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
        zIndex: 1000,
        animation: 'forge-fade-in 0.18s ease',
      }}
      onClick={onClose}
    >
      <div
        className="forge-rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.iron,
          border: `1px solid ${colors.steelHi}`,
          borderRadius: 12,
          padding: 28,
          width: 460,
          color: colors.ivory,
          fontFamily: fonts.body,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
          position: 'relative',
        }}
      >
        <button onClick={onClose} className="modal-close" aria-label="Close" title="Close">
          ×
        </button>

        <div style={labelStyle}>
          {done ? 'Mounted' : 'Provision'}
        </div>
        <h2
          style={{
            margin: '4px 0 4px',
            fontFamily: fonts.body,
            fontSize: 20,
            fontWeight: 600,
            color: colors.cream,
            letterSpacing: '-0.005em',
          }}
        >
          {done ? `${provider.display_name} is installed` : `Install ${provider.display_name}`}
        </h2>

        {!done && (
          <>
            <p style={{ color: colors.smoke, fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }}>
              This will run the following command in your shell:
            </p>
            <pre
              style={{
                background: colors.soot,
                border: `1px solid ${colors.steel}`,
                borderRadius: 8,
                padding: '12px 16px',
                marginTop: 14,
                fontSize: 12,
                color: colors.accent,
                fontFamily: fonts.mono,
                overflowX: 'auto',
                whiteSpace: 'pre',
                letterSpacing: '0.005em',
              }}
            >
              $ {installLabel}
            </pre>
            <p style={{ color: colors.ash, fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
              Requires Node.js. Output will stream into the Agent pane.
            </p>
          </>
        )}

        {done && (
          <p
            style={{
              color: colors.patina,
              fontSize: 13,
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: colors.patina,
                boxShadow: `0 0 6px ${colors.patina}`,
              }}
            />
            Smith ready for assignment.
          </p>
        )}

        {error && (
          <p
            style={{
              color: colors.rust,
              fontSize: 12,
              marginTop: 12,
              lineHeight: 1.45,
              background: 'rgba(208,90,62,0.06)',
              border: `1px solid rgba(208,90,62,0.25)`,
              padding: '8px 10px',
              borderRadius: 6,
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 22,
          }}
        >
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button
              className="btn-primary"
              onClick={handleInstall}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {loading && (
                <span
                  style={{
                    width: 12, height: 12,
                    border: '2px solid rgba(10,8,7,0.3)',
                    borderTopColor: colors.soot,
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                    display: 'inline-block',
                  }}
                />
              )}
              {loading ? 'Installing…' : 'Install'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
