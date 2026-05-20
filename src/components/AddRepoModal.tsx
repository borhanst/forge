import { useState } from 'react'
import { forge } from '../lib/tauri'
import { open } from '@tauri-apps/plugin-dialog'

type Mode = 'local' | 'clone'

export default function AddRepoModal({
  onClose, onAdded,
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const [mode, setMode]         = useState<Mode>('local')
  const [localPath, setLocalPath] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [cloneTo, setCloneTo]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#1a1c24', border: '1px solid #2d3148', borderRadius: 12,
        padding: 24, width: 420, color: '#d1d5db', fontFamily: 'Inter, sans-serif',
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, color: '#fff' }}>Add Repository</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['local', 'clone'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '6px 0', fontSize: 13, cursor: 'pointer',
                border: 'none', borderRadius: 6,
                background: mode === m ? '#2563eb' : '#23263a',
                color: mode === m ? '#fff' : '#9ca3af',
              }}
            >
              {m === 'local' ? 'Local Path' : 'Clone from GitHub'}
            </button>
          ))}
        </div>

        {mode === 'local' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={localPath}
              onChange={e => setLocalPath(e.target.value)}
              placeholder="/path/to/your/repo"
              style={inputStyle}
            />
            <button onClick={pickFolder} style={btnSecondary}>Browse</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={githubUrl}
              onChange={e => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={cloneTo}
                onChange={e => setCloneTo(e.target.value)}
                placeholder="Clone into folder..."
                style={inputStyle}
              />
              <button onClick={pickFolder} style={btnSecondary}>Browse</button>
            </div>
          </div>
        )}

        {error && (
          <p style={{ color: '#ef4444', fontSize: 12, margin: '8px 0 0' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Adding...' : mode === 'local' ? 'Add Repository' : 'Clone & Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, background: '#111318', border: '1px solid #374151',
  borderRadius: 6, color: '#d1d5db', padding: '7px 10px', fontSize: 13,
  outline: 'none',
}
const btnPrimary: React.CSSProperties = {
  background: '#2563eb', border: 'none', color: '#fff',
  borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: '#23263a', border: '1px solid #374151', color: '#9ca3af',
  borderRadius: 6, padding: '7px 12px', fontSize: 13, cursor: 'pointer',
}
