import { useCallback, useEffect, useRef, useState } from 'react'
import { colors, fonts, labelStyle } from '../theme'
import { useModalEscape } from '../hooks/useModalEscape'

interface ConfirmOptions {
  title:        string
  body:         string
  confirmText?: string
  cancelText?:  string
  destructive?: boolean
  requireText?: string
}

let pending: ((v: boolean) => void) | null = null
let setState: ((s: { open: boolean; opts: ConfirmOptions | null }) => void) | null = null

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    pending = resolve
    setState?.({ open: true, opts })
  })
}

export function ConfirmDialogHost() {
  const [state, set] = useState<{ open: boolean; opts: ConfirmOptions | null }>({ open: false, opts: null })
  const [typed, setTyped] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setState = set
    return () => { setState = null }
  }, [])

  const close = useCallback((v: boolean) => {
    pending?.(v)
    pending = null
    set({ open: false, opts: null })
    setTyped('')
  }, [])

  useModalEscape(rootRef, () => close(false))

  if (!state.open || !state.opts) return null

  const opts = state.opts
  const isDestructive = opts.destructive
  const matches = opts.requireText ? typed === opts.requireText : true

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
        zIndex: 130,
        animation: 'forge-fade-in 0.16s ease',
      }}
      onClick={() => close(false)}
    >
      <div
        className="forge-rise"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.iron,
          border: `1px solid ${colors.steelHi}`,
          borderRadius: 12,
          padding: 24,
          width: 420,
          color: colors.ivory,
          fontFamily: fonts.body,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
          position: 'relative',
        }}
      >
        <div style={labelStyle}>Confirm</div>
        <h3
          style={{
            margin: '4px 0 10px',
            fontFamily: fonts.body,
            fontSize: 18,
            fontWeight: 600,
            color: colors.cream,
            letterSpacing: '-0.005em',
          }}
        >
          {opts.title}
        </h3>
        <p style={{ color: colors.bone, fontSize: 12.5, lineHeight: 1.6, margin: opts.requireText ? '0 0 14px' : '0 0 20px' }}>
          {opts.body}
        </p>
        {opts.requireText && (
          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 11,
                color: colors.ash,
                marginBottom: 6,
              }}
            >
              Type <code style={{ color: colors.ivory, background: colors.coal, padding: '1px 6px', borderRadius: 4, fontFamily: fonts.mono, fontSize: 11 }}>{opts.requireText}</code> to confirm
            </div>
            <input
              className="forge-input"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches) {
                  e.preventDefault()
                  close(true)
                }
              }}
              spellCheck={false}
              autoComplete="off"
              style={{ width: '100%' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-secondary" onClick={() => close(false)}>
            {opts.cancelText ?? 'Cancel'}
          </button>
          <button
            className={isDestructive ? 'btn-danger' : 'btn-primary'}
            onClick={() => close(true)}
            disabled={!matches}
          >
            {opts.confirmText ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
