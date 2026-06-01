import { useState } from 'react'
import { forge } from '../lib/tauri'
import type { ProviderInfo } from '../lib/tauri'

export default function InstallModal({
  provider,
  onClose,
  onSuccess,
}: {
  provider: ProviderInfo
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#1a1c24', border: '1px solid #334155',
        borderRadius: 10, padding: '24px 28px', width: 420,
        color: '#e2e8f0', fontFamily: 'Inter, sans-serif',
      }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {done ? 'Installed' : `Install ${provider.display_name}`}
        </h2>

        {!done && (
          <>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
              This will run the following command in your terminal:
            </p>
            <pre style={{
              background: '#0d0e11', border: '1px solid #334155',
              borderRadius: 6, padding: '10px 14px', marginTop: 12,
              fontSize: 12, color: '#a5b4fc', fontFamily: 'JetBrains Mono, monospace',
              overflowX: 'auto', whiteSpace: 'pre',
            }}>
              {installLabel}
            </pre>
            <p style={{ color: '#64748b', fontSize: 11, marginTop: 10 }}>
              You need Node.js installed. Output will stream to the terminal pane.
            </p>
          </>
        )}

        {done && (
          <p style={{ color: '#10b981', fontSize: 13, marginTop: 12 }}>
            {provider.display_name} installed successfully.
          </p>
        )}

        {error && (
          <p style={{ color: '#ef4444', fontSize: 12, marginTop: 10, lineHeight: 1.4 }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              background: 'transparent', border: '1px solid #374151',
              color: '#94a3b8', borderRadius: 6, padding: '7px 16px',
              fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button
              onClick={handleInstall}
              disabled={loading}
              style={{
                background: '#2563eb', border: 'none', color: '#fff',
                borderRadius: 6, padding: '7px 18px', fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {loading && (
                <span style={{
                  width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite', display: 'inline-block',
                }} />
              )}
              {loading ? 'Installing...' : 'Install'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
