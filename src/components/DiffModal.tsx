import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { type FileDiff, type LineComment } from '../lib/tauri'

interface DiffLine {
  lineNumber: number | null
  type: 'header' | 'hunk' | 'add' | 'remove' | 'context' | 'empty'
  content: string
}

function parseDiff(raw: string): DiffLine[] {
  const lines: DiffLine[] = []
  let newLineNum = 0
  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) {
      const m = line.match(/\+(\d+)/)
      if (m) newLineNum = parseInt(m[1])
      lines.push({ lineNumber: null, type: 'hunk', content: line })
    } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
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

interface Props {
  files: FileDiff[]
  initialFile?: string
  workspaceId: string
  comments: LineComment[]
  onCommentsChange: (cs: LineComment[]) => void
  onClose: () => void
}

const DiffModal: FC<Props> = ({ files, initialFile, workspaceId, comments, onCommentsChange, onClose }) => {
  const [index, setIndex] = useState(() => {
    const i = files.findIndex(f => f.path === initialFile)
    return Math.max(0, i)
  })
  const [commentLine, setCommentLine] = useState<number | null>(null)
  const [commentText, setCommentText] = useState('')
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const file = files[index]
  const lines = file ? parseDiff(file.diff) : []
  const add = file?.additions ?? 0
  const del = file?.deletions ?? 0

  useEffect(() => {
    if (commentLine !== null && commentRef.current) commentRef.current.focus()
  }, [commentLine])

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [index])

  const go = useCallback((i: number) => {
    setIndex(i)
    setCommentLine(null)
    setCommentText('')
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!file || !commentLine || !commentText.trim()) return
    try {
      const { forge } = await import('../lib/tauri')
      await forge.addLineComment(workspaceId, file.path, commentLine, commentText.trim())
      const cs = await forge.getLineComments(workspaceId)
      onCommentsChange(cs)
      setCommentLine(null)
      setCommentText('')
    } catch { /* ignore */ }
  }, [workspaceId, file, commentLine, commentText, onCommentsChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowLeft') { if (index > 0) go(index - 1) }
    if (e.key === 'ArrowRight') { if (index < files.length - 1) go(index + 1) }
  }, [onClose, index, files.length, go])

  const fileCmt = (ln: number) => file ? comments.filter(c => c.file_path === file.path && c.line_number === ln) : []

  return (
    <div
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)' }} />

      <div style={{
        position: 'relative', width: '92vw', height: '88vh',
        background: '#0f1117', borderRadius: 12, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        border: '1px solid #1e2235', boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderBottom: '1px solid #1e2235',
          background: '#14161c', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#9ca3af',
            cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px',
          }}>&times;</button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file?.path ?? ''}
            </div>
            <div style={{ color: '#6b7280', fontSize: 11 }}>
              <span style={{ color: '#22c55e' }}>+{add}</span>
              {' '}<span style={{ color: '#ef4444' }}>-{del}</span>
              {' '}· file {index + 1} of {files.length}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => go(index - 1)} disabled={index === 0} style={{
              background: '#1e2235', border: '1px solid #374151',
              color: index > 0 ? '#d1d5db' : '#4b5563',
              borderRadius: 6, padding: '4px 10px', fontSize: 12,
              cursor: index > 0 ? 'pointer' : 'default',
            }}>&larr; Prev</button>
            <button onClick={() => go(index + 1)} disabled={index >= files.length - 1} style={{
              background: '#1e2235', border: '1px solid #374151',
              color: index < files.length - 1 ? '#d1d5db' : '#4b5563',
              borderRadius: 6, padding: '4px 10px', fontSize: 12,
              cursor: index < files.length - 1 ? 'pointer' : 'default',
            }}>Next &rarr;</button>
          </div>
        </div>

        <div ref={contentRef} style={{
          flex: 1, overflowY: 'auto', padding: '4px 0',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12, lineHeight: 1.6,
        }}>
          {lines.map((line, i) => {
            const cs = line.lineNumber ? fileCmt(line.lineNumber) : []
            return (
              <div key={i} style={{ display: 'flex', minHeight: 19 }}>
                <div
                  onClick={() => line.lineNumber && setCommentLine(line.lineNumber)}
                  style={{
                    width: 52, flexShrink: 0, textAlign: 'right', padding: '0 10px',
                    color: '#4b5563', userSelect: 'none',
                    borderRight: '1px solid #1e2235',
                    cursor: line.lineNumber ? 'pointer' : 'default',
                    position: 'relative',
                  }}
                >
                  {line.lineNumber ?? ''}
                  {cs.length > 0 && <span style={{
                    position: 'absolute', left: 4, top: 4, width: 6, height: 6,
                    borderRadius: '50%', background: '#f59e0b',
                  }} />}
                </div>
                <div style={{
                  flex: 1, padding: '0 16px 0 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: {
                    header: 'transparent', hunk: '#1a1040', add: '#052e16',
                    remove: '#450a0a', context: 'transparent', empty: 'transparent',
                  }[line.type],
                  color: '#6b7280',
                }}>
                  <span style={{
                    color: {
                      header: '#60a5fa', hunk: '#a78bfa', add: '#86efac',
                      remove: '#fca5a5', context: '#d1d5db', empty: 'transparent',
                    }[line.type],
                    fontWeight: line.type === 'header' || line.type === 'hunk' ? 600 : 400,
                  }}>
                    {line.content || '\u00a0'}
                  </span>
                </div>
                {cs.length > 0 && (
                  <div style={{
                    flexShrink: 0, fontSize: 11, color: '#f59e0b',
                    padding: '0 12px', display: 'flex', alignItems: 'center', gap: 4, maxWidth: 300,
                  }}>
                    {cs.map(c => (
                      <span key={c.id} style={{
                        background: '#1c1917', padding: '2px 8px', borderRadius: 6,
                        border: '1px solid #f59e0b44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title={c.content}>{c.content}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {commentLine !== null && file && (
          <div style={{
            borderTop: '1px solid #2563eb', background: '#14161c',
            padding: '12px 16px', flexShrink: 0,
          }}>
            <div style={{ color: '#60a5fa', fontSize: 11, marginBottom: 6 }}>
              Comment on <span style={{ fontWeight: 600 }}>{file.path}</span>:<span style={{ fontWeight: 600 }}>{commentLine}</span>
            </div>
            <textarea
              ref={commentRef}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Write a comment to send back to the agent…"
              rows={2}
              style={{
                width: '100%', background: '#1e293b', border: '1px solid #334155',
                color: '#e2e8f0', borderRadius: 6, padding: 8, fontSize: 12,
                outline: 'none', resize: 'vertical', fontFamily: 'Inter, sans-serif',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button onClick={handleSubmit} disabled={!commentText.trim()} style={{
                background: '#2563eb', border: 'none', color: '#fff',
                borderRadius: 4, padding: '4px 14px', fontSize: 12,
                cursor: commentText.trim() ? 'pointer' : 'not-allowed',
                opacity: commentText.trim() ? 1 : 0.5,
              }}>Send Comment</button>
              <button onClick={() => { setCommentLine(null); setCommentText('') }} style={{
                background: '#1e2235', border: '1px solid #374151', color: '#9ca3af',
                borderRadius: 4, padding: '4px 14px', fontSize: 12, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DiffModal
