export type AccentId  = 'ember' | 'brass' | 'cobalt' | 'patina' | 'rust'
export type Density   = 'compact' | 'cozy' | 'spacious'
export type Cleanup   = 'archive' | 'delete' | 'keep'

export interface GeneralSettings {
  defaultProvider:       string
  defaultBaseBranch:     string
  defaultCleanup:        Cleanup
  confirmBeforeArchive:  boolean
  confirmBeforeDelete:   boolean
  showKeyboardHints:     boolean
}

export interface ThemeSettings {
  accent:           AccentId
  density:          Density
  terminalFontSize: number
}

export interface AgentSettings {
  defaultProvider: string
}

export interface GithubSettings {
  hasToken: boolean
}

export interface AppSettings {
  general: GeneralSettings
  theme:   ThemeSettings
  agents:  AgentSettings
  github:  GithubSettings
}

export const defaultAppSettings: AppSettings = {
  general: {
    defaultProvider:      '',
    defaultBaseBranch:    '',
    defaultCleanup:       'archive',
    confirmBeforeArchive: true,
    confirmBeforeDelete:  true,
    showKeyboardHints:    true,
  },
  theme: {
    accent:           'ember',
    density:          'cozy',
    terminalFontSize: 13,
  },
  agents: {
    defaultProvider: '',
  },
  github: {
    hasToken: false,
  },
}

export const ACCENT_SWATCHES: { id: AccentId; label: string; base: string; deep: string; glow: string; dim: string }[] = [
  { id: 'ember',  label: 'Ember',  base: '#ff6a1f', deep: '#c44712', glow: '#fb923c', dim: '#7a3410' },
  { id: 'brass',  label: 'Brass',  base: '#d4a015', deep: '#8a6810', glow: '#f1c545', dim: '#5a440a' },
  { id: 'cobalt', label: 'Cobalt', base: '#4a7bd6', deep: '#2a4f9a', glow: '#7ba3e8', dim: '#1c325e' },
  { id: 'patina', label: 'Patina', base: '#5db48c', deep: '#2f7e5e', glow: '#8fd4b1', dim: '#1c4a38' },
  { id: 'rust',   label: 'Rust',   base: '#d05a3e', deep: '#8e3525', glow: '#e08570', dim: '#561f15' },
]

export const DENSITY_SCALE: Record<Density, number> = {
  compact:  0.94,
  cozy:     1.0,
  spacious: 1.06,
}
