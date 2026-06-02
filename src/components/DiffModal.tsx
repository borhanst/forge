import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { type FileDiff, type LineComment } from '../lib/tauri'
import { colors, fonts } from '../theme'

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

const LINE_BG: Record<string, string> = {
  header:  'transparent',
  hunk:    'rgba(212,160,21,0.06)',
  add:     'rgba(93,180,140,0.10)',
  remove:  'rgba(208,90,62,0.10)',
  context: 'transparent',
  empty:   'transparent',
}

const LINE_FG: Record<string, string> = {
  header:  colors.bone,
  hunk:    colors.brass,
  add:     '#9fdcb6',
  remove:  '#e89784',
  context: colors.bone,
  empty:   'transparent',
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
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'forge-fade-in 0.18s ease',
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.78)',
          backdropFilter: 'blur(6px)',
        }}
      />

      <div
        className="forge-rise"
        style={{
          position: 'relative',
          width: '92vw',
          height: '88vh',
          background: colors.iron,
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: `1px solid ${colors.steelHi}`,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 20px',
            borderBottom: `1px solid ${colors.steel}`,
            background: colors.iron,
            flexShrink: 0,
          }}
        >
          <button onClick={onClose} className="icon-btn" title="Close" aria-label="Close">
            <span style={{ fontSize: 18, lineHeight: 1 }}>×</span>
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: colors.ivory,
                fontWeight: 500,
                fontSize: 13.5,
                fontFamily: fonts.mono,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.005em',
              }}
            >
              {file?.path ?? ''}
            </div>
            <div
              style={{
                color: colors.ash,
                fontSize: 10.5,
                marginTop: 2,
                fontFamily: fonts.mono,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <span style={{ color: colors.patina }}>+{add}</span>
              <span style={{ color: colors.rust }}>−{del}</span>
              <span style={{ color: colors.steel }}>·</span>
              <span>file {index + 1} / {files.length}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <NavButton onClick={() => go(index - 1)} disabled={index === 0}>← Prev</NavButton>
            <NavButton onClick={() => go(index + 1)} disabled={index >= files.length - 1}>Next →</NavButton>
          </div>
        </div>

        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '6px 0',
            fontFamily: fonts.mono,
            fontSize: 12,
            lineHeight: 1.65,
            background: '#06040a',
          }}
        >
          {lines.map((line, i) => {
            const cs = line.lineNumber ? fileCmt(line.lineNumber) : []
            return (
              <div key={i} style={{ display: 'flex', minHeight: 20 }}>
                <div
                  onClick={() => line.lineNumber && setCommentLine(line.lineNumber)}
                  style={{
                    width: 56,
                    flexShrink: 0,
                    textAlign: 'right',
                    padding: '0 12px',
                    color: colors.steel,
                    userSelect: 'none',
                    borderRight: `1px solid ${colors.steel}`,
                    cursor: line.lineNumber ? 'pointer' : 'default',
                    position: 'relative',
                    fontSize: 11,
                  }}
                >
                  {line.lineNumber ?? ''}
                  {cs.length > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 4, top: 5,
                        width: 6, height: 6,
                        borderRadius: '50%',
                        background: colors.brass,
                        boxShadow: `0 0 4px ${colors.brass}`,
                      }}
                    />
                  )}
                </div>
                <div
                  style={{
                    flex: 1,
                    padding: '0 18px 0 10px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: LINE_BG[line.type],
                    color: LINE_FG[line.type],
                    fontWeight: line.type === 'header' || line.type === 'hunk' ? 500 : 400,
                  }}
                >
                  {line.content || '\u00a0'}
                </div>
                {cs.length > 0 && (
                  <div
                    style={{
                      flexShrink: 0,
                      fontSize: 11,
                      color: colors.brass,
                      padding: '0 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      maxWidth: 320,
                    }}
                  >
                    {cs.map(c => (
                      <span
                        key={c.id}
                        style={{
                          background: 'rgba(212,160,21,0.06)',
                          padding: '2px 8px',
                          borderRadius: 3,
                          border: `1px solid rgba(212,160,21,0.3)`,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: fonts.body,
                        }}
                        title={c.content}
                      >
                        {c.content}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {commentLine !== null && file && (
          <div
            className="forge-rise"
            style={{
              borderTop: `1px solid var(--accent)`,
              background: colors.iron,
              padding: '14px 20px',
              flexShrink: 0,
              boxShadow: `0 -8px 24px -8px rgba(255,106,31,0.18)`,
            }}
          >
            <div
              style={{
                color: colors.accent,
                fontSize: 10.5,
                marginBottom: 8,
                fontFamily: fonts.mono,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Comment · <span style={{ color: colors.bone }}>{file.path}</span>
              <span style={{ color: colors.ash }}> : </span>
              <span style={{ color: colors.cream }}>{commentLine}</span>
            </div>
            <textarea
              ref={commentRef}
              className="forge-textarea"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Note for the smith — sent back to the agent next run…"
              rows={2}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={!commentText.trim()}
              >
                Send to smith
              </button>
              <button
                className="btn-secondary"
                onClick={() => { setCommentLine(null); setCommentText('') }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NavButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn-secondary"
      style={{
        padding: '5px 10px',
        fontSize: 11,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export default DiffModal
