import { useEffect, useRef, useState, useCallback } from 'react'
import { forge, type FileDiff, type LineComment, type CommitInfo, type PullRequestRecord } from '../lib/tauri'
import { useForgeStore } from '../store'
import DiffModal from './DiffModal'

type View = 'changes' | 'history'

interface DiffLine {
  lineNumber: number | null
  type:       'header' | 'hunk' | 'add' | 'remove' | 'context' | 'empty'
  content:    string
}

function plural(n: number, s: string): string {
  return `${n} ${s}${n === 1 ? '' : 's'}`
}

function parseDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  let newLineNum = 0
  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)/)
      if (m) newLineNum = parseInt(m[1])
      lines.push({ lineNumber: null, type: 'hunk', content: line })
    } else if (line.startsWith('diff --git') || line.startsWith('index ') ||
               line.startsWith('--- ') || line.startsWith('+++ ')) {
      lines.push({ lineNumber: null, type: 'header', content: line })
    } else if (line.startsWith('+')) {
      lines.push({ lineNumber: newLineNum, type: 'add', content: line })
      newLineNum++
    } else if (line.startsWith('-')) {
      lines.push({ lineNumber: null, type: 'remove', content: line })
    } else if (line === '') {
      lines.push({ lineNumber: null, type: 'empty', content: '' })
    } else {
      lines.push({ lineNumber: newLineNum, type: 'context', content: line })
      if (newLineNum > 0) newLineNum++
    }
  }
  return lines
}

const STATUS_COLORS: Record<string, string> = {
  added:    '#22c55e',
  modified: '#f59e0b',
  deleted:  '#ef4444',
}

const LINE_STYLE: Record<string, React.CSSProperties> = {
  header:  { color: '#60a5fa', fontWeight: 600 },
  hunk:    { color: '#a78bfa', background: '#1a1040', padding: '2px 0' },
  add:     { color: '#86efac', background: '#052e16' },
  remove:  { color: '#fca5a5', background: '#450a0a' },
  context: { color: '#6b7280' },
  empty:   { color: 'transparent' },
}

interface Props {
  workspaceId: string
  onSwitchToPR?: () => void
}

function CommitRow({ commit, selected, onSelect }: {
  commit: CommitInfo
  selected: boolean
  onSelect: () => void
}) {
  const date = new Date(commit.timestamp * 1000).toLocaleDateString()
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #1e2235',
        background: selected ? '#1e3a5f' : 'transparent',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: selected ? '#93c5fd' : '#d1d5db', marginBottom: 2 }}>
        {commit.short_hash} {commit.message}
      </div>
      <div style={{ color: '#4b5563', fontSize: 11 }}>
        {commit.author} &middot; {date}
      </div>
    </div>
  )
}

const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
  background: active ? '#0d0e11' : 'transparent',
  color:      active ? '#d1d5db'  : '#4b5563',
  fontSize: 12, fontFamily: 'Inter, sans-serif',
  borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
})

export default function DiffViewer({ workspaceId, onSwitchToPR }: Props) {
  const [view, setView]         = useState<View>('changes')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const [files, setFiles]       = useState<FileDiff[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const [commits, setCommits]         = useState<CommitInfo[]>([])
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [commitDiff, setCommitDiff]   = useState<string>('')
  const [commitLoading, setCommitLoading] = useState(false)

  const [comments, setComments] = useState<LineComment[]>([])
  const [prRecord, setPrRecord] = useState<PullRequestRecord | null>(null)
  const [changedCount, setChangedCount] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalFile, setModalFile] = useState<string | undefined>(undefined)

  const workspaces = useForgeStore(s => s.workspaces)
  const ws = workspaces.find(w => w.id === workspaceId)
  const prevStatus = useRef(ws?.status)

  const loadDiff = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [f, cs, status, pr] = await Promise.all([
        forge.getStructuredDiff(workspaceId),
        forge.getLineComments(workspaceId),
        forge.getGitStatus(workspaceId).catch(() => null),
        forge.getPrStatus(workspaceId).catch(() => null),
      ])
      setFiles(f)
      setComments(cs)
      setChangedCount(status?.changed_count ?? 0)
      setPrRecord(pr)
      if (f.length > 0) {
        setSelectedFile(prev => prev && f.some(x => x.path === prev) ? prev : f[0].path)
      }
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  const loadHistory = async () => {
    setLoading(true)
    setError('')
    try {
      const list = await forge.getCommitHistory(workspaceId)
      setCommits(list)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const loadCommitDiff = async (hash: string) => {
    setCommitLoading(true)
    setSelectedCommit(hash)
    try {
      const diff = await forge.getCommitDiff(workspaceId, hash)
      setCommitDiff(diff)
    } catch {
      setCommitDiff('')
    } finally {
      setCommitLoading(false)
    }
  }

  useEffect(() => {
    setSelectedFile(null)
    setFiles([])
    setComments([])
    setPrRecord(null)
    setChangedCount(0)
    setCommitDiff('')
    setSelectedCommit(null)
    setModalOpen(false)
    setModalFile(undefined)
    loadDiff()
  }, [workspaceId])

  useEffect(() => {
    if (prevStatus.current === 'running' && ws?.status && ws.status !== 'running') {
      loadDiff()
    }
    prevStatus.current = ws?.status
  }, [ws?.status, loadDiff])

  useEffect(() => {
    if (view === 'history') loadHistory()
  }, [view, workspaceId])

  const commitDiffLines = parseDiff(commitDiff)
  const totalAdditions = files.reduce((a, f) => a + f.additions, 0)
  const totalDeletions = files.reduce((a, f) => a + f.deletions, 0)

  const handleFileClick = (path: string) => {
    setSelectedFile(path)
    setModalFile(path)
    setModalOpen(true)
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', background: '#0a0b0e',
    }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #1e2235', background: '#111318', flexShrink: 0, alignItems: 'center' }}>
        <button style={TAB_STYLE(view === 'changes')} onClick={() => setView('changes')}>
          Changes
        </button>
        <button style={TAB_STYLE(view === 'history')} onClick={() => setView('history')}>
          History
        </button>
        <button
          onClick={view === 'changes' ? loadDiff : loadHistory}
          disabled={loading}
          style={{
            background: '#1e2235', border: '1px solid #374151', color: '#9ca3af',
            borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer',
            marginRight: 12, whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {view === 'changes' && (changedCount > 0 || prRecord) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
          borderBottom: '1px solid #1e2235', background: '#0f1117', flexShrink: 0, fontSize: 12,
        }}>
          {!prRecord && (
            <>
              <span style={{ color: '#f59e0b' }}>{'\u25cf'}</span>
              <span style={{ color: '#9ca3af' }}>
                {changedCount} file{changedCount !== 1 ? 's' : ''} changed &mdash; ready to commit and push
              </span>
              {onSwitchToPR && (
                <button
                  onClick={onSwitchToPR}
                  style={{
                    marginLeft: 'auto', background: '#2563eb', border: 'none', color: '#fff',
                    borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Commit & Push
                </button>
              )}
            </>
          )}
          {prRecord && (
            <>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: prRecord.merged ? '#a78bfa' : prRecord.state === 'closed' ? '#ef4444' : prRecord.draft ? '#6b7280' : '#10b981',
              }} />
              <span style={{ color: '#9ca3af' }}>
                PR #{prRecord.pr_number}: {prRecord.title ?? ''}
                <span style={{
                  marginLeft: 8, color: '#fff', fontSize: 11, padding: '1px 6px', borderRadius: 8,
                  background: prRecord.merged ? '#a78bfa44' : prRecord.state === 'closed' ? '#ef444444' : '#10b98144',
                }}>
                  {prRecord.merged ? 'Merged' : prRecord.state === 'closed' ? 'Closed' : prRecord.draft ? 'Draft' : 'Open'}
                </span>
              </span>
              {prRecord.html_url && (
                <a
                  href={prRecord.html_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#60a5fa', marginLeft: 'auto', textDecoration: 'none', fontSize: 12 }}
                  onClick={e => { if (window.__open) { e.preventDefault(); window.__open(prRecord.html_url!) } }}
                >
                  View on GitHub &rarr;
                </a>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: '#ef4444', padding: '16px', fontSize: 12 }}>{error}</div>
      )}

      {view === 'changes' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {files.length === 0 && !loading && !error && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#374151', fontSize: 13,
            }}>
              No changes in this workspace.
            </div>
          )}

          {files.length > 0 && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{
                padding: '8px 16px', borderBottom: '1px solid #1e2235',
                color: '#9ca3af', fontSize: 11, fontWeight: 600,
              }}>
                {files.length} {plural(files.length, 'file')} &middot;
                <span style={{ color: '#22c55e', marginLeft: 4 }}>+{totalAdditions}</span>
                <span style={{ color: '#ef4444', marginLeft: 4 }}>-{totalDeletions}</span>
              </div>
              {files.map(f => (
                <div
                  key={f.path}
                  onClick={() => handleFileClick(f.path)}
                  style={{
                    padding: '8px 16px', cursor: 'pointer', fontSize: 12, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    borderBottom: '1px solid #1a1d2a',
                    background: selectedFile === f.path ? '#1e3a5f' : 'transparent',
                    color: selectedFile === f.path ? '#e2e8f0' : '#9ca3af',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                      background: STATUS_COLORS[f.status] || '#6b7280', flexShrink: 0,
                    }} />
                    <span style={{
                      color: '#e2e8f0', fontWeight: selectedFile === f.path ? 600 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{f.path}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {f.additions > 0 && <span style={{ color: '#22c55e', fontSize: 11 }}>+{f.additions}</span>}
                    {f.deletions > 0 && <span style={{ color: '#ef4444', fontSize: 11 }}>-{f.deletions}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'history' && !selectedCommit && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!error && commits.length === 0 && !loading && (
            <div style={{ color: '#374151', padding: '40px 16px', textAlign: 'center', fontSize: 13 }}>
              No commit history.
            </div>
          )}
          {commits.map(c => (
            <CommitRow key={c.hash} commit={c} selected={false} onSelect={() => loadCommitDiff(c.hash)} />
          ))}
        </div>
      )}

      {view === 'history' && selectedCommit && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #1e2235' }}>
            <button
              onClick={() => { setSelectedCommit(null); setCommitDiff('') }}
              style={{
                background: 'transparent', border: 'none', color: '#60a5fa',
                cursor: 'pointer', fontSize: 12, padding: 0, textAlign: 'left',
              }}
            >
              &larr; Back to history
            </button>
          </div>
          {commitDiffLines.map((line, i) => (
            <div key={i} style={{
              padding: '0 16px', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              lineHeight: 1.5, fontSize: 12, ...LINE_STYLE[line.type],
            }}>
              {line.content || '\u00a0'}
            </div>
          ))}
          {commitDiff === '' && !commitLoading && (
            <div style={{ color: '#374151', padding: '40px 16px', textAlign: 'center', fontSize: 13 }}>
              No diff for this commit.
            </div>
          )}
        </div>
      )}

      {modalOpen && files.length > 0 && (
        <DiffModal
          files={files}
          initialFile={modalFile}
          workspaceId={workspaceId}
          comments={comments}
          onCommentsChange={cs => setComments(cs)}
          onClose={() => { setModalOpen(false); setModalFile(undefined) }}
        />
      )}
    </div>
  )
}

declare global { interface Window { __open?: (url: string) => void } }
