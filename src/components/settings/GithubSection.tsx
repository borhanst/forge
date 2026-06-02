import { useEffect, useState } from 'react'
import { useForgeStore } from '../../store'
import { colors, fonts } from '../../theme'
import type { GitHubUser } from '../../lib/tauri'
import { confirmDialog } from '../ConfirmDialog'

export function GithubSection() {
  const [hasToken, setHasToken] = useState(false)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [info, setInfo]   = useState('')
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [user, setUser] = useState<GitHubUser | null>(null)
  const [testError, setTestError] = useState('')
  const patch = useForgeStore(s => s.patchSettings)

  useEffect(() => {
    let alive = true
    const check = () => {
      import('../../lib/tauri').then(({ forge }) => {
        forge.hasGithubToken().then((v) => {
          if (!alive) return
          setHasToken(v)
          patch(s => ({ ...s, github: { hasToken: v } }))
        }).catch(() => {})
      })
    }
    check()
    return () => { alive = false }
  }, [patch])

  const save = async () => {
    const trimmed = token.trim()
    if (!trimmed) return
    setError(''); setInfo('')
    setLoading(true)
    try {
      const { forge } = await import('../../lib/tauri')
      await forge.saveGithubToken(trimmed)
      setHasToken(true)
      setToken('')
      setInfo('Token saved to keychain.')
      patch(s => ({ ...s, github: { hasToken: true } }))
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const forget = async () => {
    const ok = await confirmDialog({
      title: 'Forget GitHub token?',
      body: 'Removes the token from the OS keychain. Future pull requests will fail until you add a new one. Commit and push are not affected — they use your local git credentials.',
      confirmText: 'Forget',
      cancelText: 'Keep',
      destructive: true,
    })
    if (!ok) return
    setError(''); setInfo('')
    setLoading(true)
    try {
      const { forge } = await import('../../lib/tauri')
      await forge.deleteGithubToken()
      setHasToken(false)
      setInfo('Token removed from keychain.')
      patch(s => ({ ...s, github: { hasToken: false } }))
      setUser(null)
    } catch (e: any) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const test = async () => {
    setTestError('')
    setTesting(true)
    try {
      const { forge } = await import('../../lib/tauri')
      const result = await forge.getGithubUser()
      setUser(result)
    } catch (e: any) {
      setUser(null)
      setTestError(String(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, fontFamily: fonts.body, fontSize: 13, color: colors.bone }}>
      <Group label="GitHub authentication">
        <p style={{ color: colors.ash, fontSize: 11.5, lineHeight: 1.5, margin: '0 0 14px' }}>
          Stored in the OS keychain. Only used to open pull requests via the
          GitHub REST API. Commit and push use your local git credentials.
        </p>

        {hasToken ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              background: 'rgba(93,180,140,0.06)',
              border: '1px solid rgba(93,180,140,0.22)',
              borderRadius: 6,
            }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: colors.patina,
                boxShadow: `0 0 8px ${colors.patina}`,
              }}
            />
            <span style={{ color: colors.ivory, fontSize: 12.5, flex: 1 }}>
              Connected — token present in keychain
            </span>
            <button
              className="btn-ghost"
              onClick={forget}
              disabled={loading}
              style={{ fontSize: 11 }}
            >
              {loading ? 'Removing…' : 'Forget token'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="forge-input"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save() }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                style={{ flex: 1, fontFamily: fonts.mono, fontSize: 12 }}
              />
              <button
                className="btn-strike"
                onClick={save}
                disabled={loading || !token.trim()}
              >
                {loading ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p style={{ color: colors.ash, fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
              Create a personal access token at{' '}
              <span style={{ color: colors.smoke }}>github.com → Settings → Developer settings → PAT (classic)</span>{' '}
              with the <span style={{ color: colors.smoke }}>repo</span> scope.
            </p>
          </div>
        )}

        {info && (
          <div style={{ marginTop: 10, fontSize: 12, color: colors.patina }}>{info}</div>
        )}
        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: colors.rust }}>{error}</div>
        )}
      </Group>

      {hasToken && (
        <Group label="Verify connection">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn-ghost"
              onClick={test}
              disabled={testing}
              style={{ minWidth: 160 }}
            >
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            {user && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 12px 6px 6px',
                  background: 'rgba(93,180,140,0.06)',
                  border: '1px solid rgba(93,180,140,0.22)',
                  borderRadius: 6,
                }}
              >
                {user.avatar_url && (
                  <img
                    src={user.avatar_url}
                    alt=""
                    style={{
                      width: 22, height: 22,
                      borderRadius: '50%',
                      border: `1px solid ${colors.patina}`,
                    }}
                  />
                )}
                <span style={{ color: colors.ivory, fontSize: 12.5 }}>
                  Authenticated as{' '}
                  <span style={{ fontFamily: fonts.mono, color: colors.patina }}>
                    @{user.login}
                  </span>
                </span>
              </div>
            )}
          </div>
          {testError && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: colors.rust,
                background: 'rgba(208,90,62,0.06)',
                border: '1px solid rgba(208,90,62,0.22)',
                padding: '8px 10px',
                borderRadius: 4,
              }}
            >
              {testError}
            </div>
          )}
        </Group>
      )}
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: colors.smoke,
          marginBottom: 14,
        }}
      >
        {label}
      </div>
      {children}
    </section>
  )
}
