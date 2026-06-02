import { useEffect } from 'react'
import { useForgeStore } from '../store'
import { ACCENT_SWATCHES, DENSITY_SCALE } from '../lib/settings'

/**
 * Writes the current theme settings to :root as CSS custom properties so the
 * rest of the app (CSS, inline styles) can read them via var(--accent), etc.
 *
 * The swatch table in `lib/settings.ts` is the single source of truth.
 */
export function useThemeStyle() {
  const accent           = useForgeStore(s => s.settings.theme.accent)
  const density          = useForgeStore(s => s.settings.theme.density)
  const terminalFontSize = useForgeStore(s => s.settings.theme.terminalFontSize)

  useEffect(() => {
    const root = document.documentElement
    const swatch = ACCENT_SWATCHES.find(s => s.id === accent) ?? ACCENT_SWATCHES[0]
    root.style.setProperty('--accent',      swatch.base)
    root.style.setProperty('--accent-deep', swatch.deep)
    root.style.setProperty('--accent-glow', swatch.glow)
    root.style.setProperty('--accent-dim',  swatch.dim)
    root.style.setProperty('--accent-rgb',  hexToRgb(swatch.base))
  }, [accent])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--ui-scale', String(DENSITY_SCALE[density]))
  }, [density])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--term-size', `${terminalFontSize}px`)
  }, [terminalFontSize])
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `${r}, ${g}, ${b}`
}
