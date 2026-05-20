import { useEffect, useRef } from 'react'
import { useForgeStore } from '../store'

interface Props {
  workspaceId: string
}

const STREAM_COLOR: Record<string, string> = {
  stdout: '#e2e8f0',
  stderr: '#fca5a5',
  system: '#fbbf24',
}

const EMPTY_LINES: never[] = []

export function Terminal({ workspaceId }: Props) {
  const lines = useForgeStore((s) => s.agentOutputs[workspaceId] ?? EMPTY_LINES)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new output
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length])

  if (lines.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#334155',
        fontSize: 13,
        fontFamily: 'monospace',
      }}>
        No output yet. Run a prompt to start.
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontSize: 12,
        lineHeight: 1.6,
        padding: '12px 16px',
        background: '#020408',
      }}
    >
      {lines.map((line, i) => {
        const color = STREAM_COLOR[line.stream] ?? STREAM_COLOR.stdout

        return (
          <div key={i} style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {line.content || '\u00A0'}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}