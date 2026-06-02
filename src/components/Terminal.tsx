import { useEffect, useRef } from 'react'
import { useForgeStore } from '../store'
import { colors, fonts } from '../theme'

interface Props {
  workspaceId: string
}

const STREAM_COLOR: Record<string, string> = {
  stdout: colors.ivory,
  stderr: colors.rust,
  system: colors.brass,
}

const EMPTY_LINES: never[] = []

export function Terminal({ workspaceId }: Props) {
  const lines = useForgeStore((s) => s.agentOutputs[workspaceId] ?? EMPTY_LINES)
  const isRunning = useForgeStore((s) => s.runningAgents.has(workspaceId))
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length])

  if (lines.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.ash,
          fontSize: 12,
          fontFamily: fonts.mono,
          background: '#06040a',
          letterSpacing: '0.04em',
          flexDirection: 'column',
          gap: 6,
          textTransform: 'uppercase',
        }}
      >
        <span style={{ color: colors.steelHi, fontSize: 14 }}>—</span>
        <span>The anvil is silent</span>
        <span style={{ color: colors.steel, fontSize: 10 }}>
          strike a prompt below
        </span>
      </div>
    )
  }

  return (
    <div
      className="terminal-output"
      style={{
        flex: 1,
        overflowY: 'auto',
        fontFamily: fonts.mono,
        fontSize: 12.5,
        lineHeight: 1.65,
        padding: '14px 20px 24px',
        background: '#06040a',
        position: 'relative',
      }}
    >
      {/* Scan-line edge: a barely-visible top fade. Sets the terminal apart from
          the panel chrome without a hard rule. */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: 14,
          marginTop: -14,
          marginBottom: -8,
          background: 'linear-gradient(180deg, #06040a, transparent)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {lines.map((line, i) => {
        const color = STREAM_COLOR[line.stream] ?? STREAM_COLOR.stdout
        const isLast = i === lines.length - 1

        return (
          <div
            key={i}
            style={{
              color,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              opacity: isLast && isRunning ? 1 : 0.95,
              position: 'relative',
              paddingLeft: line.stream === 'system' ? 14 : 0,
            }}
          >
            {line.stream === 'system' && (
              <span
                style={{
                  position: 'absolute',
                  left: 0, top: 6,
                  width: 4, height: 4,
                  borderRadius: '50%',
                  background: colors.brass,
                  boxShadow: `0 0 6px ${colors.brass}`,
                }}
              />
            )}
            {line.content || '\u00A0'}
          </div>
        )
      })}

      {/* Animated cursor at end when running */}
      {isRunning && (
        <span
          style={{
            display: 'inline-block',
            width: 8, height: 14,
            background: colors.accent,
            marginLeft: 2,
            verticalAlign: 'text-bottom',
            animation: 'ember-glow-soft 1s ease-in-out infinite',
            boxShadow: `0 0 8px var(--accent)`,
          }}
        />
      )}

      <div ref={bottomRef} />
    </div>
  )
}
