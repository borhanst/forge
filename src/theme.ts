/**
 * Forge design tokens — "Foundry" aesthetic.
 *
 * A blacksmith's workshop interpretation. Soot-deep panels, ember-orange used
 * with restraint as the single accent of conviction. Warm cream typography
 * rather than cold white. Fraunces for display, JetBrains Mono for technical,
 * Inter Tight as the workhorse body face.
 */

export const colors = {
  soot:        '#0a0807',
  iron:        '#13100c',
  coal:        '#1c1813',
  ore:         '#241e17',
  steel:       '#2a241c',
  steelHi:     '#3a3225',

  ash:         '#5a5247',
  smoke:       '#8a8275',
  bone:        '#c9c1b1',
  ivory:       '#f5efe2',
  cream:       '#faf5e9',

  // The accent family. Use these in CSS values to read from the runtime
  // swatch. They resolve to var(--accent) which useThemeStyle.ts updates.
  accent:      'var(--accent)',
  accentDeep:  'var(--accent-deep)',
  accentGlow:  'var(--accent-glow)',
  accentDim:   'var(--accent-dim)',

  // Legacy ember hex values. Kept for any code paths that need a real color
  // string (e.g., canvas, setProperty, etc.). Prefer the var-based accent.*
  // above so the swatch picker takes effect.
  ember:       '#ff6a1f',
  emberDeep:   '#c44712',
  emberGlow:   '#fb923c',
  emberDim:    '#7a3410',
  brass:       '#d4a015',

  patina:      '#5db48c',
  patinaBg:    '#0e2218',
  rust:        '#d05a3e',
  rustBg:      '#26100b',

  cobalt:      '#7ba6c2',
  cobaltBg:    '#0d1a24',
} as const

export const fonts = {
  display: '"Fraunces", "Iowan Old Style", Georgia, serif',
  body:    '"Inter Tight", -apple-system, system-ui, sans-serif',
  mono:    '"JetBrains Mono", "SF Mono", Menlo, monospace',
} as const

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
} as const

export const shadow = {
  panel: '0 1px 0 rgba(255,255,255,0.02) inset, 0 0 0 1px rgba(0,0,0,0.4)',
  modal: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.5)',
  ember: '0 0 0 1px rgba(255,106,31,0.25), 0 0 12px -2px rgba(255,106,31,0.25)',
  emberSoft: '0 0 16px -6px rgba(255,106,31,0.2)',
} as const

/**
 * uppercase, kerned label preset. Apply to inline style spreads on labels.
 */
export const labelStyle = {
  fontFamily: fonts.mono,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  color: colors.smoke,
}

export const displayItalic = {
  fontFamily: fonts.display,
  fontStyle: 'italic' as const,
  fontWeight: 500,
  fontVariationSettings: '"opsz" 144, "SOFT" 50, "WONK" 1',
}
