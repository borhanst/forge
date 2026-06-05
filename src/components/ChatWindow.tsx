import { useEffect, useRef, useState } from 'react'
import { useForgeStore } from '../store'
import type { ChatMessage, ToolCallInfo, FileChangeInfo } from '../store'
import { colors, fonts, radius } from '../theme'

interface Props {
  workspaceId: string
}

const EMPTY_MSGS: ChatMessage[] = []

export function ChatWindow({ workspaceId }: Props) {
  const messages = useForgeStore((s) => s.chatMessages[workspaceId] ?? EMPTY_MSGS)
  const isRunning = useForgeStore((s) => s.runningAgents.has(workspaceId))
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content])

  if (messages.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.ash,
          fontSize: 12,
          fontFamily: fonts.body,
          background: colors.soot,
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <span style={{ color: colors.smoke }}>The hearth is quiet</span>
        <span style={{ color: colors.steel, fontSize: 11 }}>
          send a prompt below to start a session
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 16px 8px',
        background: colors.soot,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {messages.map((msg) =>
        msg.role === 'user' ? (
          <UserBubble key={msg.id} msg={msg} />
        ) : (
          <AssistantBubble key={msg.id} msg={msg} />
        ),
      )}

      {isRunning && messages[messages.length - 1]?.role === 'assistant' && (
        <span
          style={{
            display: 'inline-block',
            width: 8, height: 14,
            background: colors.accent,
            marginLeft: 2,
            animation: 'ember-glow-soft 1s ease-in-out infinite',
          }}
        />
      )}

      <div ref={bottomRef} style={{ height: 1 }} />
    </div>
  )
}

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        maxWidth: '100%',
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 13,
          fontFamily: fonts.body,
          lineHeight: 1.5,
          padding: '8px 14px',
          borderRadius: `${radius.lg}px ${radius.lg}px 4px ${radius.lg}px`,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {msg.content}
      </div>
    </div>
  )
}

function AssistantBubble({ msg }: { msg: ChatMessage }) {
  const hasContent = msg.content.length > 0
  const hasToolCalls = msg.toolCalls.length > 0
  const hasFileChanges = msg.fileChanges.length > 0
  const hasDiff = !!msg.diffContent

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        maxWidth: '100%',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          background: colors.coal,
          border: `1px solid ${colors.steel}`,
          borderRadius: `${radius.lg}px ${radius.lg}px ${radius.lg}px 4px`,
          padding: '10px 14px',
          fontSize: 13,
          fontFamily: fonts.body,
          lineHeight: 1.55,
          color: colors.ivory,
        }}
      >
        {hasContent && (
          <div
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginBottom: hasToolCalls || hasFileChanges ? 10 : 0,
            }}
          >
            {msg.content}
          </div>
        )}

        {hasToolCalls && (
          <div style={{ marginBottom: hasDiff || hasFileChanges ? 8 : 0 }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: fonts.mono,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: colors.smoke,
                marginBottom: 4,
              }}
            >
              Tool Calls
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {msg.toolCalls.map((tc, i) => (
                <ToolCallItem key={i} call={tc} />
              ))}
            </div>
          </div>
        )}

        {hasDiff && (
          <div style={{ marginBottom: hasFileChanges ? 8 : 0 }}>
            <DiffBlock diff={msg.diffContent!} />
          </div>
        )}

        {hasFileChanges && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontFamily: fonts.mono,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: colors.smoke,
                marginBottom: 4,
              }}
            >
              File Changes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {msg.fileChanges.map((fc, i) => (
                <FileChangeItem key={i} change={fc} />
              ))}
            </div>
          </div>
        )}

        {!hasContent && !hasToolCalls && !hasFileChanges && (
          <span style={{ color: colors.smoke, fontStyle: 'italic', fontSize: 12 }}>
            Working...
          </span>
        )}
      </div>
    </div>
  )
}

const TOOL_ICONS: Record<string, string> = {
  read:   '\u{1F50D}',
  edit:   '\u{270F}\u{FE0F}',
  create: '\u{1F4C4}',
  bash:   '\u{1F4BB}',
  search: '\u{1F50E}',
}

function ToolCallItem({ call }: { call: ToolCallInfo }) {
  const icon = TOOL_ICONS[call.name] || '\u{2699}\u{FE0F}'
  const statusColor =
    call.status === 'completed' ? colors.patina :
    call.status === 'failed' ? colors.rust :
    'var(--accent)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontFamily: fonts.mono,
        color: colors.bone,
      }}
    >
      <span style={{ fontSize: 11 }}>{icon}</span>
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={call.args}
      >
        {call.name === 'bash' ? `$ ${call.args}` : call.args}
      </span>
      <StatusDot color={statusColor} />
    </div>
  )
}

function FileChangeItem({ change }: { change: FileChangeInfo }) {
  const prefix =
    change.type === 'created' ? '+ ' :
    change.type === 'modified' ? '~ ' :
    '- '

  const prefixColor =
    change.type === 'created' ? colors.patina :
    change.type === 'modified' ? colors.brass :
    colors.rust

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontFamily: fonts.mono,
        color: colors.bone,
      }}
    >
      <span style={{ color: prefixColor, fontWeight: 600 }}>{prefix}</span>
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={change.path}
      >
        {change.path}
      </span>
    </div>
  )
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

function DiffBlock({ diff }: { diff: string }) {
  const [open, setOpen] = useState(false)
  const lines = diff.split('\n')
  const hunkCount = lines.filter(l => l.startsWith('@@')).length

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontSize: 10,
          fontFamily: fonts.mono,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: colors.smoke,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 0.15s ease',
            transform: open ? 'rotate(90deg)' : undefined,
          }}
        >
          &#9654;
        </span>
        Diff
        <span style={{ color: colors.ash, fontWeight: 400, letterSpacing: 0 }}>
          &middot; {lines.length} lines{hunkCount > 0 ? `, ${hunkCount} hunks` : ''}
        </span>
      </button>

      {open && (
        <div
          style={{
            marginTop: 6,
            background: colors.soot,
            border: `1px solid ${colors.steel}`,
            borderRadius: radius.sm,
            overflow: 'hidden',
          }}
        >
          <pre
            style={{
              margin: 0,
              padding: '8px 10px',
              fontSize: 11,
              fontFamily: fonts.mono,
              lineHeight: 1.55,
              overflowX: 'auto',
              maxHeight: 320,
              overflowY: 'auto',
              color: colors.ivory,
            }}
          >
            {lines.map((line, i) => {
              let bg: string = 'transparent'
              let color: string = colors.ivory

              if (line.startsWith('@@')) {
                color = colors.cobalt
              } else if (line.startsWith('+')) {
                bg = 'rgba(93,180,140,0.08)'
                color = colors.patina
              } else if (line.startsWith('-')) {
                bg = 'rgba(208,90,62,0.08)'
                color = colors.rust
              }

              return (
                <div
                  key={i}
                  style={{
                    background: bg,
                    color,
                    whiteSpace: 'pre',
                    padding: '0 4px',
                    borderRadius: 2,
                  }}
                >
                  {line || '\u00A0'}
                </div>
              )
            })}
          </pre>
        </div>
      )}
    </div>
  )
}
