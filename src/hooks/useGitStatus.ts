import { useState, useEffect } from 'react'
import { forge, type GitStatus } from '../lib/tauri'
import { useForgeStore } from '../store'

export function useGitStatus(workspaceId: string | null) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const workspaces = useForgeStore(s => s.workspaces)
  const ws = workspaces.find(w => w.id === workspaceId)

  const refresh = async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const s = await forge.getGitStatus(workspaceId)
      setStatus(s)
    } catch (e) {
      console.error('git status error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!workspaceId) { setStatus(null); return }

    refresh()

    const interval = setInterval(() => {
      if (ws?.status !== 'running') refresh()
    }, 5000)

    return () => clearInterval(interval)
  }, [workspaceId, ws?.status])

  return { status, loading, refresh }
}
