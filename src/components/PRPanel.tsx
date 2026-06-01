import { useEffect, useState } from 'react'
import { forge, type PullRequestRecord, type GitStatus } from '../lib/tauri'
import { useForgeStore } from '../store'

interface Props {
  workspaceId: string
  gitStatus:   GitStatus | null
  onRefreshDiff: () => void
}

export default function PRPanel({ workspaceId, gitStatus, onRefreshDiff }: Props) {
  const workspaces  = useForgeStore(s => s.workspaces)
  const ws          = workspaces.find(w => w.id === workspaceId)

  const [pr, setPr]               = useState<PullRequestRecord | null>(null)
  const [hasToken, setHasToken]   = useState(false)
  const [token, setToken]         = useState('')
  const [title, setTitle]         = useState('')
  const [body, setBody]           = useState('')
  const [baseBranch, setBase]     = useState('main')
  const [commitMsg, setCommitMsg] = useState('')
  const [draft, setDraft]         = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [info, setInfo]           = useState('')

  useEffect(() => {
    forge.hasGithubToken().then(setHasToken)
    forge.getPrStatus(workspaceId).then(setPr)
    if (ws) setTitle(`feat: changes from ${ws.city_name} workspace`)
  }, [workspaceId])

  const saveToken = async () => {
    if (!token.trim()) return
    setLoading(true)
    try {
      await forge.saveGithubToken(token.trim())
      setHasToken(true)
      setToken('')
      setInfo('Token saved securely to keychain.')
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleCommitPush = async () => {
    if (!commitMsg.trim()) return
    setLoading(true)
    setError('')
    try {
      await forge.commitAndPush(workspaceId, commitMsg.trim())
      setInfo('Committed and pushed successfully.')
      setCommitMsg('')
      onRefreshDiff()
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePr = async () => {
    setLoading(true)
    setError('')
    try {
      const created = await forge.createPr(workspaceId, title, body, baseBranch, draft)
      setPr(created)
      setInfo('Pull request created!')
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleRefreshPr = async () => {
    const fresh = await forge.getPrStatus(workspaceId)
    setPr(fresh)
  }

  const prStatusColor = (pr: PullRequestRecord) => {
    if (pr.merged) return '#a78bfa'
    if (pr.state === 'closed') return '#ef4444'
    if (pr.draft)  return '#6b7280'
    return '#10b981'
  }

  const prStatusLabel = (pr: PullRequestRecord) => {
    if (pr.merged) return 'Merged'
    if (pr.state === 'closed') return 'Closed'
    if (pr.draft)  return 'Draft'
    return 'Open'
  }

  return (
    <div style={{
      flex: 1, overflowY: 'auto', padding: '16px',
      display: 'flex', flexDirection: 'column', gap: 20,
      fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#d1d5db',
    }}>

      {!hasToken && (
        <Section title="GitHub Token (for PR creation)">
          <p style={{ color: '#6b7280', marginBottom: 8, fontSize: 12 }}>
            Only needed if you want to create Pull Requests. Push uses your local git credentials.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              style={inputStyle}
            />
            <button onClick={saveToken} disabled={loading} style={btnPrimary}>
              Save
            </button>
          </div>
        </Section>
      )}

      {hasToken && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#10b981', fontSize: 12 }}>GitHub token saved</span>
          <button
            onClick={async () => { await forge.deleteGithubToken(); setHasToken(false) }}
            style={{ ...btnSecondary, fontSize: 11, padding: '2px 8px' }}
          >
            Remove
          </button>
        </div>
      )}

      <Section title="Commit & Push">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ color: '#6b7280', fontSize: 12 }}>
            {gitStatus?.changed_count ?? 0} changed file(s)
          </span>
          {gitStatus && gitStatus.changed_count > 0 && (
            <span style={{ color: '#f59e0b', fontSize: 11 }}>{"\u25cf"}</span>
          )}
        </div>
        <p style={{ color: '#4b5563', fontSize: 11, marginBottom: 8 }}>
          Uses your local git credentials (SSH key, credential helper, etc.).
        </p>

        <textarea
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          placeholder="Commit message..."
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }}
        />
        <button
          onClick={handleCommitPush}
          disabled={loading || !commitMsg.trim()}
          style={{
            ...btnPrimary,
            opacity: (loading || !commitMsg.trim()) ? 0.5 : 1,
            cursor:  (loading || !commitMsg.trim()) ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Working...' : 'Commit & Push'}
        </button>
      </Section>

      {pr && (
        <Section title="Pull Request">
          <div style={{
            background: '#111318', borderRadius: 8,
            border: '1px solid #1e2235', padding: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                background: prStatusColor(pr), color: '#fff',
                borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600,
              }}>
                {prStatusLabel(pr)}
              </span>
              <span style={{ color: '#6b7280', fontSize: 12 }}>#{pr.pr_number}</span>
            </div>
            <div style={{ color: '#d1d5db', marginBottom: 8 }}>{pr.title ?? ''}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={pr.html_url ?? '#'}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#60a5fa', fontSize: 12 }}
                onClick={(e) => { e.preventDefault(); if (pr.html_url) window.__open?.(pr.html_url) }}
              >
                View on GitHub
              </a>
              <button onClick={handleRefreshPr} style={{ ...btnSecondary, fontSize: 11 }}>
                Refresh
              </button>
            </div>
          </div>
        </Section>
      )}

      {!pr && (
        <Section title="Create Pull Request">
          <label style={labelStyle}>Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ ...inputStyle, marginBottom: 10 }}
          />

          <label style={labelStyle}>Description</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="What did the agent change?"
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', marginBottom: 10 }}
          />

          <label style={labelStyle}>Base branch</label>
          <input
            value={baseBranch}
            onChange={e => setBase(e.target.value)}
            style={{ ...inputStyle, marginBottom: 10 }}
          />

          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={draft}
              onChange={e => setDraft(e.target.checked)}
            />
            Create as draft PR
          </label>

          <button
            onClick={handleCreatePr}
            disabled={loading || !hasToken || !title.trim()}
            style={{
              ...btnPrimary, marginTop: 12, width: '100%',
              opacity: (loading || !hasToken || !title.trim()) ? 0.5 : 1,
              cursor:  (loading || !hasToken || !title.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating...' : 'Create Pull Request'}
          </button>
        </Section>
      )}

      {error && (
        <div style={{ color: '#ef4444', fontSize: 12, background: '#1c0a0a', padding: 10, borderRadius: 6 }}>
          {error}
        </div>
      )}
      {info && (
        <div style={{ color: '#10b981', fontSize: 12, background: '#052e16', padding: 10, borderRadius: 6 }}>
          {info}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 600, color: '#4b5563',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#111318', border: '1px solid #1e2235',
  borderRadius: 6, color: '#d1d5db', padding: '7px 10px',
  fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif',
  display: 'block',
}
const btnPrimary: React.CSSProperties = {
  background: '#2563eb', border: 'none', color: '#fff',
  borderRadius: 6, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  background: '#1e2235', border: '1px solid #374151', color: '#9ca3af',
  borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4,
}

declare global { interface Window { __open?: (url: string) => void } }
