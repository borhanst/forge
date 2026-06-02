import { useEffect, useState } from 'react'
import { colors, fonts, displayItalic, labelStyle } from '../theme'

interface ConfirmOptions {
  title:       string
  body:        string
  confirmText?: string
  cancelText?:  string
  destructive?: boolean
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

  useEffect(() => {
    setState = set
    return () => { setState = null }
  }, [])

  if (!state.open || !state.opts) return null

  const close = (v: boolean) => {
    pending?.(v)
    pending = null
    set({ open: false, opts: null })
  }

  const opts = state.opts
  const isDestructive = opts.destructive

  return (
    <div
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
          borderRadius: 10,
          padding: 26,
          width: 400,
          color: colors.ivory,
          fontFamily: fonts.body,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(208,90,62,0.08)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0, left: 24, right: 24, height: 1,
            background: `linear-gradient(90deg, transparent, ${isDestructive ? colors.rust : colors.accent}, transparent)`,
            opacity: 0.5,
          }}
        />
        <div style={labelStyle}>Confirm</div>
        <h3
          style={{
            ...displayItalic,
            margin: '4px 0 10px',
            fontSize: 22,
            color: colors.cream,
            letterSpacing: '-0.015em',
          }}
        >
          {opts.title}
        </h3>
        <p style={{ color: colors.bone, fontSize: 12.5, lineHeight: 1.6, margin: '0 0 22px' }}>
          {opts.body}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={() => close(false)}>
            {opts.cancelText ?? 'Cancel'}
          </button>
          <button
            className={isDestructive ? 'btn-danger' : 'btn-strike'}
            onClick={() => close(true)}
          >
            {opts.confirmText ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
