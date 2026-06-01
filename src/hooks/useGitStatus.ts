import { useState, useEffect } from 'react'
import { forge, type GitStatus } from '../lib/tauri'

export function useGitStatus(workspaceId: string | null) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(false)

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

    const interval = setInterval(refresh, 5000)

    return () => clearInterval(interval)
  }, [workspaceId])

  return { status, loading, refresh }
}
