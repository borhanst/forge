import { useEffect, useRef, type RefObject } from 'react'

export function useModalEscape(rootRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const root = rootRef.current
      if (!root) return
      const modals = Array.from(document.querySelectorAll('[data-forge-modal]'))
      const top = modals[modals.length - 1]
      if (top === root) {
        closeRef.current()
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [rootRef])
}
