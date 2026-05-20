import { useEffect, useState } from 'react'
import { forge } from '../lib/tauri'

interface DiffLine {
  type:    'header' | 'hunk' | 'add' | 'remove' | 'context' | 'empty'
  content: string
}

function parseDiff(raw: string): DiffLine[] {
  return raw.split('\n').map(line => {
    if (line.startsWith('diff --git') || line.startsWith('index ') ||
        line.startsWith('--- ') || line.startsWith('+++ ')) {
      return { type: 'header', content: line }
    }
    if (line.startsWith('@@')) return { type: 'hunk', content: line }
    if (line.startsWith('+'))  return { type: 'add', content: line }
    if (line.startsWith('-'))  return { type: 'remove', content: line }
    if (line === '')           return { type: 'empty', content: '' }
    return { type: 'context', content: line }
  })
}

const LINE_STYLE: Record<string, React.CSSProperties> = {
  header:  { color: '#60a5fa', background: 'transparent', fontWeight: 600 },
  hunk:    { color: '#a78bfa', background: '#1a1040', padding: '2px 0' },
  add:     { color: '#86efac', background: '#052e16' },
  remove:  { color: '#fca5a5', background: '#450a0a' },
  context: { color: '#6b7280', background: 'transparent' },
  empty:   { color: 'transparent', background: 'transparent' },
}

interface Props {
  workspaceId: string
}

export default function DiffViewer({ workspaceId }: Props) {
  const [raw, setRaw]         = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const loadDiff = async () => {
    setLoading(true)
    setError('')
    try {
      const diff = await forge.getDiff(workspaceId)
      setRaw(diff)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDiff()
  }, [workspaceId])

  const lines = parseDiff(raw)

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: '#0a0b0e',
    }}>
      <div style={{
        padding: '8px 16px', borderBottom: '1px solid #1e2235',
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#111318', flexShrink: 0,
      }}>
        <span style={{ color: '#9ca3af', fontSize: 13, flex: 1 }}>
          Changes
        </span>
        <button
          onClick={loadDiff}
          disabled={loading}
          style={{
            background: '#1e2235', border: '1px solid #374151',
            color: '#9ca3af', borderRadius: 6, padding: '3px 10px',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 0',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
        lineHeight: 1.5,
      }}>
        {error && (
          <div style={{ color: '#ef4444', padding: '16px' }}>{error}</div>
        )}

        {!error && raw === '' && !loading && (
          <div style={{ color: '#374151', padding: '40px 16px', textAlign: 'center' }}>
            No changes in this workspace.
          </div>
        )}

        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              padding: '0 16px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              ...LINE_STYLE[line.type],
            }}
          >
            {line.content || '\u00a0'}
          </div>
        ))}
      </div>
    </div>
  )
}
