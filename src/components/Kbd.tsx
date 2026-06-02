import type { ReactNode } from 'react'
import { colors, fonts } from '../theme'

interface Props {
  children: ReactNode
  size?: 'sm' | 'md'
}

export function Kbd({ children, size = 'sm' }: Props) {
  const isMd = size === 'md'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: isMd ? 22 : 18,
        height: isMd ? 22 : 18,
        padding: isMd ? '0 6px' : '0 5px',
        background: colors.iron,
        border: `1px solid ${colors.steel}`,
        borderBottomWidth: 2,
        borderRadius: 4,
        fontFamily: fonts.mono,
        fontSize: isMd ? 11 : 9.5,
        fontWeight: 500,
        color: colors.bone,
        letterSpacing: 0,
        lineHeight: 1,
        boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

export function KbdRow({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: fonts.mono,
        color: colors.ash,
      }}
    >
      {children}
    </span>
  )
}
