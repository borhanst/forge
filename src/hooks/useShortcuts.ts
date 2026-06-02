import { useEffect, useRef } from 'react'
import { comboMatches, type Shortcut } from '../lib/shortcuts'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function isModalOpen(): boolean {
  return document.querySelector('[data-forge-modal]') !== null
}

export function useShortcuts(getShortcuts: () => Shortcut[]) {
  const ref = useRef(getShortcuts)
  ref.current = getShortcuts

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isModalOpen()) return
      const editable = isEditableTarget(e.target)
      for (const s of ref.current()) {
        if (s.enabled === false) continue
        if (!comboMatches(s.combo, e)) continue
        if (editable && !s.allowInInputs) continue
        e.preventDefault()
        e.stopPropagation()
        s.action()
        return
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [])
}
