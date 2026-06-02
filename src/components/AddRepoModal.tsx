import { useRef, useState } from 'react'
import { forge } from '../lib/tauri'
import { open } from '@tauri-apps/plugin-dialog'
import { colors, fonts, labelStyle } from '../theme'
import { useModalEscape } from '../hooks/useModalEscape'

type Mode = 'local' | 'clone'

export default function AddRepoModal({
  onClose, onAdded,
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  useModalEscape(rootRef, onClose)

  const [mode, setMode]           = useState<Mode>('local')
  const [localPath, setLocalPath] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [cloneTo, setCloneTo]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected === 'string') {
      if (mode === 'local') setLocalPath(selected)
      else setCloneTo(selected)
    }
  }

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'local') {
        await forge.addRepoLocal(localPath)
      } else {
        await forge.addRepoClone(githubUrl, cloneTo)
      }
      onAdded()
      onClose()
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
        zIndex: 100,
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
        <button
          onClick={onClose}
          className="modal-close"
          aria-label="Close"
          title="Close"
        >
          ×
        </button>

        <div style={labelStyle}>Add to the floor</div>
        <h2
          style={{
            margin: '4px 0 18px',
            fontFamily: fonts.body,
            fontSize: 20,
            fontWeight: 600,
            color: colors.cream,
            letterSpacing: '-0.005em',
          }}
        >
          Mount a repository
        </h2>

        <div
          style={{
            display: 'flex',
            gap: 0,
            marginBottom: 18,
            background: colors.coal,
            borderRadius: 8,
            padding: 3,
            border: `1px solid ${colors.steel}`,
          }}
        >
          {(['local', 'clone'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '7px 0',
                fontSize: 12,
                fontFamily: fonts.body,
                fontWeight: 500,
                cursor: 'pointer',
                border: 'none',
                borderRadius: 6,
                background: mode === m ? colors.iron : 'transparent',
                color: mode === m ? colors.ivory : colors.ash,
                boxShadow: mode === m ? `0 0 0 1px ${colors.steelHi}` : 'none',
                transition: 'all 0.12s ease',
              }}
            >
              {m === 'local' ? 'Local path' : 'Clone from GitHub'}
            </button>
          ))}
        </div>

        {mode === 'local' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="forge-input"
              value={localPath}
              onChange={e => setLocalPath(e.target.value)}
              placeholder="/path/to/your/repo"
            />
            <button className="btn-secondary" onClick={pickFolder}>Browse</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              className="forge-input"
              value={githubUrl}
              onChange={e => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="forge-input"
                value={cloneTo}
                onChange={e => setCloneTo(e.target.value)}
                placeholder="Clone into folder…"
              />
              <button className="btn-secondary" onClick={pickFolder}>Browse</button>
            </div>
          </div>
        )}

        {error && (
          <p
            style={{
              color: colors.rust,
              fontSize: 12,
              margin: '12px 0 0',
              background: 'rgba(208,90,62,0.06)',
              border: `1px solid rgba(208,90,62,0.2)`,
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
            gap: 8,
            marginTop: 22,
            justifyContent: 'flex-end',
          }}
        >
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Mounting…' : mode === 'local' ? 'Add repository' : 'Clone & add'}
          </button>
        </div>
      </div>
    </div>
  )
}
