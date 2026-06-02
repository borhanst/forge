import { useEffect, useRef, useState } from 'react'
import { forge } from '../lib/tauri'
import type { BranchInfo } from '../lib/tauri'
import { colors, fonts, displayItalic, labelStyle } from '../theme'
import { useModalEscape } from '../hooks/useModalEscape'

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
  const rootRef = useRef<HTMLDivElement>(null)
  useModalEscape(rootRef, onClose)

  const [branches, setBranches]   = useState<BranchInfo[]>([])
  const [targetBranch, setTargetBranch] = useState('')
  const [pushToRemote, setPushToRemote] = useState(defaultPush)
  const [cleanup, setCleanup]     = useState(defaultCleanup)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [hasChanges, setHasChanges] = useState(true)
  const [result, setResult]       = useState<{ success: boolean; message: string; conflicted_files?: string[] } | null>(null)
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
    <div
      ref={rootRef}
      data-forge-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        animation: 'forge-fade-in 0.18s ease',
      }}
      onClick={onClose}
    >
      <div
        className="forge-rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.iron,
          border: `1px solid ${colors.steelHi}`,
          borderRadius: 10,
          padding: 32,
          width: 460,
          color: colors.ivory,
          fontFamily: fonts.body,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,106,31,0.06)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0, left: 28, right: 28, height: 1,
            background: `linear-gradient(90deg, transparent, var(--accent), transparent)`,
            opacity: 0.5,
          }}
        />

        <div style={labelStyle}>Quench & weld</div>
        <h2
          style={{
            ...displayItalic,
            margin: '4px 0 4px',
            fontSize: 26,
            color: colors.cream,
            letterSpacing: '-0.015em',
          }}
        >
          Merge {workspaceName}
        </h2>
        <p style={{ color: colors.smoke, fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
          Fold this anvil's work into the target branch.
        </p>

        {result?.success ? (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(93,180,140,0.06)',
              border: `1px solid rgba(93,180,140,0.25)`,
              padding: '12px 14px',
              borderRadius: 6,
              color: colors.patina,
              fontSize: 13,
              margin: '8px 0',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.patina, boxShadow: `0 0 6px ${colors.patina}` }} />
            {result.message}
          </div>
        ) : result?.conflicted_files?.length ? (
          <div>
            <p
              style={{
                color: colors.brass,
                fontSize: 12.5,
                marginBottom: 10,
                fontFamily: fonts.mono,
                letterSpacing: '0.04em',
              }}
            >
              ⚠ Conflicts in {result.conflicted_files.length} file(s)
            </p>
            <ul
              style={{
                color: colors.bone,
                fontSize: 11.5,
                margin: '0 0 14px',
                paddingLeft: 18,
                maxHeight: 150,
                overflowY: 'auto',
                fontFamily: fonts.mono,
                lineHeight: 1.7,
              }}
            >
              {result.conflicted_files.map(f => (
                <li key={f} style={{ padding: '1px 0' }}>{f}</li>
              ))}
            </ul>
            <p style={{ color: colors.smoke, fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
              Let the smith resolve the seam and finish the weld automatically.
            </p>
            <button
              onClick={handleResolve}
              disabled={resolving}
              className="btn-strike"
              style={{ width: '100%' }}
            >
              {resolving ? 'Resolving…' : 'Resolve with agent'}
            </button>
            {resolveResult && (
              <p style={{ color: colors.patina, fontSize: 12, marginTop: 10 }}>
                {resolveResult}
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ ...labelStyle, fontSize: 9, marginBottom: 6 }}>
                Target branch
              </div>
              <select
                className="forge-select"
                value={targetBranch}
                onChange={e => setTargetBranch(e.target.value)}
                disabled={loading}
              >
                {branches.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name} {b.is_default ? '(default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: colors.bone,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={pushToRemote}
                onChange={e => setPushToRemote(e.target.checked)}
                disabled={loading}
                style={{ accentColor: colors.accent, width: 14, height: 14 }}
              />
              Push to remote after merge
            </label>

            <div>
              <div style={{ ...labelStyle, fontSize: 9, marginBottom: 6 }}>
                Cleanup after merge
              </div>
              <select
                className="forge-select"
                value={cleanup}
                onChange={e => setCleanup(e.target.value)}
                disabled={loading}
              >
                <option value="archive">Archive workspace</option>
                <option value="delete">Delete workspace + branch</option>
                <option value="none">No cleanup</option>
              </select>
            </div>
          </div>
        )}

        {error && !result?.success && (
          <p
            style={{
              color: colors.rust,
              fontSize: 12,
              margin: '14px 0 0',
              background: 'rgba(208,90,62,0.06)',
              border: `1px solid rgba(208,90,62,0.25)`,
              padding: '8px 10px',
              borderRadius: 4,
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 22,
            justifyContent: 'flex-end',
          }}
        >
          <button
            className="btn-ghost"
            onClick={onClose}
            disabled={loading || resolving}
          >
            {result?.success ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              className="btn-strike"
              onClick={handleMerge}
              disabled={loading || hasChanges || !targetBranch}
              title={hasChanges ? 'Commit pending changes first' : ''}
            >
              {loading ? 'Welding…' : hasChanges ? 'Commit first' : 'Weld'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
