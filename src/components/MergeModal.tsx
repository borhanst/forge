import { useEffect, useState } from 'react'
import { forge } from '../lib/tauri'
import type { BranchInfo } from '../lib/tauri'

interface Props {
  workspaceId: string
  workspaceName: string
  defaultPush: boolean
  defaultCleanup: string
  onClose: () => void
  onMerged: () => void
}

export default function MergeModal({
  workspaceId, workspaceName, defaultPush, defaultCleanup, onClose, onMerged,
}: Props) {
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [targetBranch, setTargetBranch] = useState('')
  const [pushToRemote, setPushToRemote] = useState(defaultPush)
  const [cleanup, setCleanup] = useState(defaultCleanup)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasChanges, setHasChanges] = useState(true)
  const [result, setResult] = useState<{ success: boolean; message: string; conflicted_files?: string[] } | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveResult, setResolveResult] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      forge.listBranches(workspaceId),
      forge.getGitStatus(workspaceId),
    ])
      .then(([branches, status]) => {
        setBranches(branches)
        setHasChanges(status.has_changes)
        const defaultB = branches.find(b => b.is_default)
        if (defaultB) setTargetBranch(defaultB.name)
        else if (branches.length > 0) setTargetBranch(branches[0].name)
      })
      .catch(e => setError(String(e)))
  }, [workspaceId])

  const handleMerge = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await forge.mergeWorktree(workspaceId, targetBranch, pushToRemote, cleanup)
      setResult(res)
      if (res.success) {
        setTimeout(() => { onMerged() }, 1500)
      } else if (res.conflicted_files?.length) {
        setError(`Merge conflicts in ${res.conflicted_files.length} file(s)`)
      } else {
        setError(res.message)
      }
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async () => {
    setResolving(true)
    setResolveResult(null)
    setError('')
    try {
      const res = await forge.resolveAndFinishMerge(workspaceId, targetBranch, pushToRemote, cleanup)
      if (res.success) {
        setResolveResult(res.message)
        setTimeout(() => { onMerged() }, 1500)
      } else {
        setError(res.conflicted_files?.length
          ? `Agent could not resolve: ${res.conflicted_files.join(', ')}`
          : res.message)
      }
    } catch (e: any) {
      setError(String(e))
    } finally {
      setResolving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#1a1c24', border: '1px solid #2d3148', borderRadius: 12,
        padding: 24, width: 420, color: '#d1d5db', fontFamily: 'Inter, sans-serif',
      }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, color: '#fff' }}>Merge Workspace</h2>
        <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 16px' }}>
          Merge <strong style={{ color: '#d1d5db' }}>{workspaceName}</strong> into target branch
        </p>

        {result?.success ? (
          <p style={{ color: '#10b981', fontSize: 14, margin: '12px 0' }}>{result.message}</p>
        ) : result?.conflicted_files?.length ? (
          <div>
            <p style={{ color: '#f59e0b', fontSize: 13, marginBottom: 8 }}>
              Merge conflicts in {result.conflicted_files.length} file(s):
            </p>
            <ul style={{ color: '#d1d5db', fontSize: 12, margin: '0 0 12px', paddingLeft: 20, maxHeight: 150, overflowY: 'auto' }}>
              {result.conflicted_files.map(f => (
                <li key={f} style={{ padding: '2px 0' }}>{f}</li>
              ))}
            </ul>
            <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
              Use an AI agent to automatically resolve conflicts and complete the merge.
            </p>
            <button
              onClick={handleResolve}
              disabled={resolving}
              style={{
                width: '100%', background: resolving ? '#334155' : '#7c3aed',
                border: 'none', color: '#fff', borderRadius: 6, padding: '9px 18px',
                fontSize: 13, cursor: resolving ? 'not-allowed' : 'pointer',
              }}
            >
              {resolving ? 'Resolving...' : 'Resolve with Agent'}
            </button>
            {resolveResult && (
              <p style={{ color: '#10b981', fontSize: 12, marginTop: 8 }}>{resolveResult}</p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>
                Target Branch
              </label>
              <select
                value={targetBranch}
                onChange={e => setTargetBranch(e.target.value)}
                disabled={loading}
                style={{
                  width: '100%', background: '#1e293b', border: '1px solid #334155',
                  color: '#e2e8f0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                  outline: 'none',
                }}
              >
                {branches.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name} {b.is_default ? '(default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d1d5db', fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={pushToRemote}
                onChange={e => setPushToRemote(e.target.checked)}
                disabled={loading}
                style={{ accentColor: '#2563eb' }}
              />
              Push to remote after merge
            </label>

            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, marginBottom: 4 }}>
                Cleanup after merge
              </label>
              <select
                value={cleanup}
                onChange={e => setCleanup(e.target.value)}
                disabled={loading}
                style={{
                  width: '100%', background: '#1e293b', border: '1px solid #334155',
                  color: '#e2e8f0', padding: '8px 12px', borderRadius: 6, fontSize: 13,
                  outline: 'none',
                }}
              >
                <option value="archive">Archive workspace</option>
                <option value="delete">Delete workspace + branch</option>
                <option value="none">No cleanup</option>
              </select>
            </div>
          </div>
        )}

        {error && !result?.success && (
          <p style={{ color: '#ef4444', fontSize: 12, margin: '12px 0 0' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={loading || resolving}
            style={{
              background: '#23263a', border: '1px solid #374151', color: '#9ca3af',
              borderRadius: 6, padding: '7px 16px', fontSize: 13, cursor: 'pointer',
            }}
          >
            {result?.success ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleMerge}
              disabled={loading || hasChanges || !targetBranch}
              style={{
                background: loading || hasChanges || !targetBranch ? '#334155' : '#2563eb',
                border: 'none', color: '#fff', borderRadius: 6, padding: '7px 18px',
                fontSize: 13, cursor: loading || hasChanges || !targetBranch ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Merging...' : hasChanges ? 'Commit changes first' : 'Merge'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
