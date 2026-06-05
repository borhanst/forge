import { useEffect } from 'react'
import { forgeEvents, type UnlistenFn } from '../lib/tauri'
import { useForgeStore } from '../store'
import { categorizeLines } from '../lib/chat-parser'

export function useAgentEvents() {
  const store = useForgeStore()

  useEffect(() => {
    let active = true
    const unsubs: Array<UnlistenFn> = []

    // Buffered lines per workspace for the current assistant turn
    const buffers: Record<string, string[]> = {}

    const setup = async () => {
      const u1 = await forgeEvents.onAgentOutput((e) => {
        if (!active) return
        store.appendAgentOutput(e.workspace_id, {
          stream: e.stream as any,
          content: e.content,
          ts: Date.now(),
        })

        const line = e.content.trim()
        if (!line) return

        if (!buffers[e.workspace_id]) {
          buffers[e.workspace_id] = []
        }
        buffers[e.workspace_id].push(line)

        const { toolCalls, fileChanges, textLines, diffContent } = categorizeLines([
          { stream: 'stdout', content: line, ts: Date.now() },
        ])

        store.updateLastAssistantMessage(e.workspace_id, (msg) => {
          const next = { ...msg }
          if (toolCalls.length > 0) {
            next.toolCalls = [...msg.toolCalls, ...toolCalls]
          }
          if (fileChanges.length > 0) {
            const existing = new Set(msg.fileChanges.map(f => f.path))
            const newChanges = fileChanges.filter(f => !existing.has(f.path))
            if (newChanges.length > 0) {
              next.fileChanges = [...msg.fileChanges, ...newChanges]
            }
          }
          if (textLines.length > 0) {
            const sep = msg.content.length > 0 ? '\n' : ''
            next.content = msg.content + sep + textLines[0]
          }
          if (diffContent) {
            const sep = msg.diffContent ? '\n' : ''
            next.diffContent = (msg.diffContent || '') + sep + diffContent
          }
          return next
        })
      })
      if (!active) { u1(); return }
      unsubs.push(u1)

      const u2 = await forgeEvents.onAgentStatus((e) => {
        if (!active) return
        store.updateWorkspaceStatus(e.workspace_id, e.status as any)
        if (e.status === 'running') {
          store.setRunningAgent(e.workspace_id, e.session_id)
        } else {
          store.clearRunningAgent(e.workspace_id)
          store.updateLastAssistantMessage(e.workspace_id, (msg) => {
            return {
              ...msg,
              toolCalls: msg.toolCalls.map((tc) => ({
                ...tc,
                status: e.status === 'error' ? 'failed' as const : 'completed' as const,
              })),
            }
          })
          delete buffers[e.workspace_id]
        }
      })
      if (!active) { u2(); return }
      unsubs.push(u2)
    }

    setup()

    return () => {
      active = false
      unsubs.forEach((fn) => fn())
    }
  }, [
    store.appendAgentOutput,
    store.updateWorkspaceStatus,
    store.setRunningAgent,
    store.clearRunningAgent,
    store.updateLastAssistantMessage,
  ])
}
