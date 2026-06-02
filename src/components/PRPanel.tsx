import { useEffect, useState } from 'react'
import { forge, type PullRequestRecord, type GitStatus } from '../lib/tauri'
import { useForgeStore } from '../store'
import { colors, fonts, labelStyle } from '../theme'

interface Props {
  workspaceId: string
  gitStatus:   GitStatus | null
  onRefreshDiff: () => void
}

export default function PRPanel({ workspaceId, gitStatus, onRefreshDiff }: Props) {
  const workspaces  = useForgeStore(s => s.workspaces)
  const openSettings = useForgeStore(s => s.openSettings)
  const ws          = workspaces.find(w => w.id === workspaceId)

  const [pr, setPr]               = useState<PullRequestRecord | null>(null)
  const [hasToken, setHasToken]   = useState(false)
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

  const handleCommitPush = async () => {
    if (!commitMsg.trim()) return
    setLoading(true)
    setError('')
    try {
      await forge.commitAndPush(workspaceId, commitMsg.trim())
      setInfo('Committed and pushed.')
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
      setInfo('Pull request raised.')
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

  const prStatusColor = (p: PullRequestRecord) => {
    if (p.merged) return '#a78bfa'
    if (p.state === 'closed') return colors.rust
    if (p.draft)  return colors.ash
    return colors.patina
  }

  const prStatusLabel = (p: PullRequestRecord) => {
    if (p.merged) return 'Merged'
    if (p.state === 'closed') return 'Closed'
    if (p.draft)  return 'Draft'
    return 'Open'
  }

  return (
    <div
      className="forge-stagger"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        fontFamily: fonts.body,
        fontSize: 13,
        color: colors.bone,
      }}
    >
      {!hasToken && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            background: 'rgba(208,90,62,0.06)',
            border: '1px solid rgba(208,90,62,0.22)',
            borderRadius: 4,
            fontFamily: fonts.body,
            fontSize: 12,
            color: colors.bone,
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: colors.rust,
              boxShadow: `0 0 6px ${colors.rust}`,
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1 }}>
            A GitHub token is required to raise a PR.{' '}
            <button
              onClick={() => openSettings('github')}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: colors.accent,
                cursor: 'pointer',
                fontFamily: fonts.body,
                fontSize: 12,
                textDecoration: 'underline',
                textDecorationStyle: 'dotted',
                textUnderlineOffset: 3,
              }}
            >
              Add one in Settings → GitHub
            </button>
            . Commit and push use your local git credentials.
          </span>
        </div>
      )}

      <Section title="Commit · Push">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: gitStatus && gitStatus.changed_count > 0 ? colors.accent : colors.ash,
              boxShadow: gitStatus && gitStatus.changed_count > 0 ? `0 0 6px var(--accent)` : undefined,
            }}
          />
          <span style={{ color: colors.smoke, fontSize: 12, fontFamily: fonts.mono, letterSpacing: '0.04em' }}>
            {gitStatus?.changed_count ?? 0} changed file(s)
          </span>
        </div>
        <p style={{ color: colors.ash, fontSize: 11, marginBottom: 10, lineHeight: 1.5 }}>
          Uses local git credentials (SSH key, credential helper, etc.).
        </p>

        <textarea
          className="forge-textarea"
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          placeholder="Commit message…"
          rows={2}
          style={{ marginBottom: 10 }}
        />
        <button
          className="btn-strike"
          onClick={handleCommitPush}
          disabled={loading || !commitMsg.trim()}
          style={{ width: '100%' }}
        >
          {loading ? 'Striking…' : 'Commit · Push'}
        </button>
      </Section>

      {pr && (
        <Section title="Pull request">
          <div
            style={{
              background: colors.coal,
              borderRadius: 6,
              border: `1px solid ${colors.steel}`,
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span
                style={{
                  background: `${prStatusColor(pr)}22`,
                  color: prStatusColor(pr),
                  border: `1px solid ${prStatusColor(pr)}55`,
                  borderRadius: 3,
                  padding: '2px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: fonts.mono,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                {prStatusLabel(pr)}
              </span>
              <span style={{ color: colors.ash, fontSize: 11, fontFamily: fonts.mono }}>
                #{pr.pr_number}
              </span>
            </div>
            <div style={{ color: colors.ivory, marginBottom: 10, fontSize: 13.5, lineHeight: 1.45 }}>
              {pr.title ?? ''}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <a
                href={pr.html_url ?? '#'}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: colors.accent,
                  fontSize: 11,
                  fontFamily: fonts.mono,
                  letterSpacing: '0.12em',
                  textDecoration: 'none',
                  textTransform: 'uppercase',
                }}
                onClick={(e) => { e.preventDefault(); if (pr.html_url) window.__open?.(pr.html_url) }}
              >
                View on GitHub ↗
              </a>
              <button
                onClick={handleRefreshPr}
                className="btn-ghost"
                style={{ marginLeft: 'auto', fontSize: 10, padding: '4px 10px' }}
              >
                Refresh
              </button>
            </div>
          </div>
        </Section>
      )}

      {!pr && (
        <Section title="Raise pull request">
          <Field label="Title">
            <input
              className="forge-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </Field>

          <Field label="Description">
            <textarea
              className="forge-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="What did the agent change?"
              rows={4}
            />
          </Field>

          <Field label="Base branch">
            <input
              className="forge-input"
              value={baseBranch}
              onChange={e => setBase(e.target.value)}
            />
          </Field>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: colors.bone,
              fontSize: 12.5,
              cursor: 'pointer',
              padding: '8px 0',
            }}
          >
            <input
              type="checkbox"
              checked={draft}
              onChange={e => setDraft(e.target.checked)}
              style={{ accentColor: colors.accent, width: 14, height: 14 }}
            />
            Raise as draft
          </label>

          <button
            className="btn-strike"
            onClick={handleCreatePr}
            disabled={loading || !hasToken || !title.trim()}
            style={{ marginTop: 8, width: '100%' }}
          >
            {loading ? 'Raising…' : 'Raise pull request'}
          </button>
        </Section>
      )}

      {error && (
        <div
          style={{
            color: colors.rust,
            fontSize: 12,
            background: 'rgba(208,90,62,0.06)',
            border: `1px solid rgba(208,90,62,0.25)`,
            padding: 10,
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}
      {info && (
        <div
          style={{
            color: colors.patina,
            fontSize: 12,
            background: 'rgba(93,180,140,0.06)',
            border: `1px solid rgba(93,180,140,0.25)`,
            padding: 10,
            borderRadius: 4,
          }}
        >
          {info}
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          ...labelStyle,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 3, height: 3, borderRadius: '50%',
            background: colors.accent,
            boxShadow: `0 0 4px var(--accent)`,
          }}
        />
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...labelStyle, fontSize: 9, marginBottom: 6, color: colors.ash }}>
        {label}
      </div>
      {children}
    </div>
  )
}

declare global { interface Window { __open?: (url: string) => void } }
