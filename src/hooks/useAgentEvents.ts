import { useEffect } from 'react'
import { forgeEvents, type AgentOutputEvent, type AgentStatusEvent, type UnlistenFn } from '../lib/tauri'
import { useForgeStore } from '../store'

export function useAgentEvents() {
  const {
    appendAgentOutput,
    updateWorkspaceStatus,
    setRunningAgent,
    clearRunningAgent,
  } = useForgeStore()

  useEffect(() => {
    let active = true
    const unsubs: Array<UnlistenFn> = []

    const setup = async () => {
      const u1 = await forgeEvents.onAgentOutput((e) => {
        if (!active) return
        appendAgentOutput(e.workspace_id, {
          stream: e.stream as any,
          content: e.content,
          ts: Date.now()
        })
      })
      if (!active) { u1(); return }
      unsubs.push(u1)

      const u2 = await forgeEvents.onAgentStatus((e) => {
        if (!active) return
        updateWorkspaceStatus(e.workspace_id, e.status as any)
        if (e.status === 'running') {
          setRunningAgent(e.workspace_id, e.session_id)
        } else {
          clearRunningAgent(e.workspace_id)
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
  }, [appendAgentOutput, updateWorkspaceStatus, setRunningAgent, clearRunningAgent])
}