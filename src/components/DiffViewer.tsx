import { useEffect, useRef, useState, useCallback } from 'react'
import { forge, type FileDiff, type LineComment, type CommitInfo, type PullRequestRecord } from '../lib/tauri'
import { useForgeStore } from '../store'
import { colors, fonts } from '../theme'
import DiffModal from './DiffModal'

type View = 'changes' | 'history'

interface DiffLine {
  lineNumber: number | null
  type:       'header' | 'hunk' | 'add' | 'remove' | 'context' | 'empty'
  content:    string
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

const STATUS_COLOR: Record<string, string> = {
  added:    colors.patina,
  modified: colors.brass,
  deleted:  colors.rust,
}

const LINE_STYLE: Record<string, React.CSSProperties> = {
  header:  { color: colors.bone, fontWeight: 500 },
  hunk:    { color: colors.brass, background: 'rgba(212,160,21,0.06)', padding: '2px 0' },
  add:     { color: '#9fdcb6', background: 'rgba(93,180,140,0.10)' },
  remove:  { color: '#e89784', background: 'rgba(208,90,62,0.10)' },
  context: { color: colors.ash },
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
        padding: '10px 18px',
        cursor: 'pointer',
        borderBottom: `1px solid ${colors.steel}`,
        background: selected ? colors.coal : 'transparent',
        fontSize: 12,
        position: 'relative',
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = `${colors.coal}80` }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      {selected && (
        <span
          style={{
            position: 'absolute',
            left: 0, top: 6, bottom: 6,
            width: 2,
            background: colors.accent,
            boxShadow: `0 0 8px var(--accent)`,
          }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
        <code style={{
          fontFamily: fonts.mono,
          fontSize: 10.5,
          color: colors.accent,
          letterSpacing: '0.04em',
        }}>
          {commit.short_hash}
        </code>
        <span style={{ color: selected ? colors.cream : colors.ivory, fontWeight: 500 }}>
          {commit.message}
        </span>
      </div>
      <div
        style={{
          color: colors.ash,
          fontSize: 10.5,
          fontFamily: fonts.mono,
          letterSpacing: '0.04em',
        }}
      >
        {commit.author} · {date}
      </div>
    </div>
  )
}

export default function DiffViewer({ workspaceId, onSwitchToPR }: Props) {
  const [view, setView] = useState<View>('changes')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [files, setFiles] = useState<FileDiff[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [commitDiff, setCommitDiff] = useState<string>('')
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
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: colors.iron,
      }}
    >
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${colors.steel}`,
          background: colors.iron,
          flexShrink: 0,
          alignItems: 'center',
          padding: '0 8px',
          gap: 4,
        }}
      >
        <SubTab label="Changes" active={view === 'changes'} onClick={() => setView('changes')} />
        <SubTab label="History" active={view === 'history'} onClick={() => setView('history')} />
        <div style={{ flex: 1 }} />
        <button
          onClick={view === 'changes' ? loadDiff : loadHistory}
          disabled={loading}
          style={{
            background: 'transparent',
            border: `1px solid ${colors.steel}`,
            color: loading ? colors.steel : colors.smoke,
            borderRadius: 3,
            padding: '4px 10px',
            fontSize: 10,
            cursor: loading ? 'wait' : 'pointer',
            marginRight: 10,
            whiteSpace: 'nowrap',
            fontFamily: fonts.mono,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            transition: 'all 0.12s ease',
          }}
          onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.setProperty('color', 'var(--accent)'); e.currentTarget.style.setProperty('borderColor', 'var(--accent-deep)') } }}
          onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.color = colors.smoke; e.currentTarget.style.borderColor = colors.steel } }}
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {view === 'changes' && (changedCount > 0 || prRecord) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 18px',
            borderBottom: `1px solid ${colors.steel}`,
            background: colors.coal,
            flexShrink: 0,
            fontSize: 12,
          }}
        >
          {!prRecord && (
            <>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: colors.accent,
                boxShadow: `0 0 8px var(--accent)`,
              }} />
              <span style={{ color: colors.bone }}>
                {changedCount} {changedCount === 1 ? 'file' : 'files'} ready for the hammer
              </span>
              {onSwitchToPR && (
                <button
                  onClick={onSwitchToPR}
                  style={{
                    marginLeft: 'auto',
                    background: 'transparent',
                    border: `1px solid var(--accent)`,
                    color: colors.accent,
                    borderRadius: 3,
                    padding: '4px 12px',
                    fontSize: 10,
                    cursor: 'pointer',
                    fontFamily: fonts.mono,
                    fontWeight: 600,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,106,31,0.10)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  Ship →
                </button>
              )}
            </>
          )}
          {prRecord && (
            <>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: prRecord.merged ? '#a78bfa' : prRecord.state === 'closed' ? colors.rust : prRecord.draft ? colors.ash : colors.patina,
              }} />
              <span style={{ color: colors.bone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                <span style={{ fontFamily: fonts.mono, color: colors.ash, marginRight: 6 }}>
                  PR #{prRecord.pr_number}
                </span>
                {prRecord.title ?? ''}
                <span style={{
                  marginLeft: 8, color: colors.cream, fontSize: 10, padding: '2px 6px', borderRadius: 3,
                  background: prRecord.merged ? '#a78bfa22' : prRecord.state === 'closed' ? 'rgba(208,90,62,0.18)' : 'rgba(93,180,140,0.18)',
                  fontFamily: fonts.mono,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                }}>
                  {prRecord.merged ? 'Merged' : prRecord.state === 'closed' ? 'Closed' : prRecord.draft ? 'Draft' : 'Open'}
                </span>
              </span>
              {prRecord.html_url && (
                <a
                  href={prRecord.html_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: colors.accent,
                    textDecoration: 'none',
                    fontSize: 11,
                    fontFamily: fonts.mono,
                    letterSpacing: '0.08em',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={e => { if (window.__open) { e.preventDefault(); window.__open(prRecord.html_url!) } }}
                >
                  GitHub ↗
                </a>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            color: colors.rust,
            padding: '14px 18px',
            fontSize: 12,
            background: 'rgba(208,90,62,0.06)',
            borderBottom: `1px solid ${colors.steel}`,
            fontFamily: fonts.mono,
          }}
        >
          {error}
        </div>
      )}

      {view === 'changes' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {files.length === 0 && !loading && !error && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.ash,
                fontSize: 12,
                fontFamily: fonts.mono,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ color: colors.steelHi, fontSize: 16 }}>—</span>
              <span>No changes</span>
            </div>
          )}

          {files.length > 0 && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div
                style={{
                  padding: '10px 18px',
                  borderBottom: `1px solid ${colors.steel}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontFamily: fonts.mono,
                  fontSize: 10.5,
                  letterSpacing: '0.08em',
                }}
              >
                <span style={{ color: colors.smoke }}>
                  {files.length} {files.length === 1 ? 'FILE' : 'FILES'}
                </span>
                <span style={{ color: colors.steel }}>·</span>
                <span style={{ color: colors.patina }}>+{totalAdditions}</span>
                <span style={{ color: colors.rust }}>−{totalDeletions}</span>
              </div>
              {files.map(f => (
                <div
                  key={f.path}
                  onClick={() => handleFileClick(f.path)}
                  style={{
                    padding: '8px 18px',
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    borderBottom: `1px solid ${colors.steel}33`,
                    background: selectedFile === f.path ? colors.coal : 'transparent',
                    color: selectedFile === f.path ? colors.ivory : colors.bone,
                    position: 'relative',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => { if (selectedFile !== f.path) e.currentTarget.style.background = `${colors.coal}60` }}
                  onMouseLeave={(e) => { if (selectedFile !== f.path) e.currentTarget.style.background = 'transparent' }}
                >
                  {selectedFile === f.path && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 0, top: 4, bottom: 4,
                        width: 2,
                        background: colors.accent,
                      }}
                    />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6, height: 6, borderRadius: '50%',
                        background: STATUS_COLOR[f.status] || colors.ash,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        letterSpacing: '-0.005em',
                      }}
                    >
                      {f.path}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexShrink: 0,
                      fontFamily: fonts.mono,
                      fontSize: 10.5,
                    }}
                  >
                    {f.additions > 0 && <span style={{ color: colors.patina }}>+{f.additions}</span>}
                    {f.deletions > 0 && <span style={{ color: colors.rust }}>−{f.deletions}</span>}
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
            <div
              style={{
                color: colors.ash,
                padding: '40px 16px',
                textAlign: 'center',
                fontSize: 12,
                fontFamily: fonts.mono,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              No history yet
            </div>
          )}
          {commits.map(c => (
            <CommitRow key={c.hash} commit={c} selected={false} onSelect={() => loadCommitDiff(c.hash)} />
          ))}
        </div>
      )}

      {view === 'history' && selectedCommit && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div
            style={{
              padding: '10px 18px',
              borderBottom: `1px solid ${colors.steel}`,
              background: colors.coal,
            }}
          >
            <button
              onClick={() => { setSelectedCommit(null); setCommitDiff('') }}
              style={{
                background: 'transparent',
                border: 'none',
                color: colors.accent,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: fonts.mono,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                padding: 0,
              }}
            >
              ← Back to history
            </button>
          </div>
          {commitDiffLines.map((line, i) => (
            <div
              key={i}
              style={{
                padding: '0 18px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: 1.6,
                fontSize: 11.5,
                fontFamily: fonts.mono,
                ...LINE_STYLE[line.type],
              }}
            >
              {line.content || '\u00a0'}
            </div>
          ))}
          {commitDiff === '' && !commitLoading && (
            <div
              style={{
                color: colors.ash,
                padding: '40px 16px',
                textAlign: 'center',
                fontSize: 12,
                fontFamily: fonts.mono,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              No diff for this commit
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

function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '10px 14px 11px',
        border: 'none',
        cursor: 'pointer',
        background: 'transparent',
        color: active ? colors.cream : colors.ash,
        fontSize: 10.5,
        fontFamily: fonts.mono,
        fontWeight: active ? 600 : 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        transition: 'color 0.12s ease',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = colors.bone }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = colors.ash }}
    >
      {label}
      {active && (
        <span
          style={{
            position: 'absolute',
            left: 14, right: 14, bottom: -1,
            height: 1,
            background: colors.accent,
            boxShadow: `0 0 6px var(--accent)`,
          }}
        />
      )}
    </button>
  )
}

declare global { interface Window { __open?: (url: string) => void } }
