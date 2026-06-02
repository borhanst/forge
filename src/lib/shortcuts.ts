export type Combo = string

export type ShortcutGroup = 'Global' | 'Navigation' | 'Workspace' | 'Editing'

export interface Shortcut {
  id:          string
  combo:       Combo
  description: string
  group:       ShortcutGroup
  action:      () => void
  allowInInputs?: boolean
  enabled?:      boolean
}

const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.userAgent || navigator.platform || '')

export function isMac(): boolean {
  return IS_MAC
}

export function modKeyName(): 'metaKey' | 'ctrlKey' {
  return IS_MAC ? 'metaKey' : 'ctrlKey'
}

export function formatCombo(combo: string): string[] {
  return combo.split('+').map(part => {
    switch (part) {
      case 'Mod':       return IS_MAC ? '⌘' : 'Ctrl'
      case 'Shift':     return IS_MAC ? '⇧' : 'Shift'
      case 'Alt':       return IS_MAC ? '⌥' : 'Alt'
      case 'Enter':     return '⏎'
      case 'Escape':    return 'Esc'
      case 'ArrowUp':   return '↑'
      case 'ArrowDown': return '↓'
      case 'ArrowLeft': return '←'
      case 'ArrowRight':return '→'
      case 'Tab':       return 'Tab'
      case 'Backspace': return '⌫'
      default:          return part
    }
  })
}

export function comboMatches(combo: string, e: KeyboardEvent): boolean {
  if (combo === '?') {
    if (e[modKeyName()]) return false
    if (e.altKey) return false
    return e.key === '?' || (e.key === '/' && e.shiftKey)
  }

  const parts = combo.split('+')
  const key   = parts[parts.length - 1]
  const mods  = parts.slice(0, -1)

  const needMod   = mods.includes('Mod')
  const needShift = mods.includes('Shift')
  const needAlt   = mods.includes('Alt')

  if (needMod   !== e[modKeyName()]) return false
  if (needShift !== e.shiftKey)      return false
  if (needAlt   !== e.altKey)        return false

  if (key === e.key) return true
  if (key.length === 1 && e.key.length === 1) {
    return key.toLowerCase() === e.key.toLowerCase()
  }
  return false
}
