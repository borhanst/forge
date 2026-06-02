import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { forge, forgeEvents } from '../lib/tauri'
import { useForgeStore } from '../store'

interface Props {
  workspaceId: string
}

const THEME = {
  background:           '#06040a',
  foreground:           '#f5efe2',
  cursor:               '#ff6a1f',
  cursorAccent:         '#06040a',
  selectionBackground:  '#3a2614',
  black:                '#1c1813',
  red:                  '#d05a3e',
  green:                '#5db48c',
  yellow:               '#d4a015',
  blue:                 '#7ba6c2',
  magenta:              '#c08a6b',
  cyan:                 '#8dbab0',
  white:                '#c9c1b1',
  brightBlack:          '#5a5247',
  brightRed:            '#f08060',
  brightGreen:          '#86d3a8',
  brightYellow:         '#fbbf24',
  brightBlue:           '#a8c8e0',
  brightMagenta:        '#e2b29a',
  brightCyan:           '#b0dfd5',
  brightWhite:          '#faf5e9',
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function TerminalShell({ workspaceId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const exitingRef = useRef(false)
  const fontSize = useForgeStore(s => s.settings.theme.terminalFontSize)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      scrollback: 5000,
      theme: THEME,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    termRef.current = term
    fitRef.current = fit

    // Initial fit + open the PTY
    let cancelled = false
    const init = async () => {
      try {
        fit.fit()
      } catch { /* container has zero size during first paint */ }

      // 1. Open / re-attach the PTY
      try {
        await forge.terminalOpen(workspaceId)
      } catch (e) {
        term.write(`\r\n\x1b[31m[forge] failed to open terminal: ${String(e)}\x1b[0m\r\n`)
        return
      }
      if (cancelled) return

      // 2. Replay scrollback if re-attaching to an existing session
      try {
        const info = await forge.terminalAttach(workspaceId)
        if (info && info.scrollback_b64) {
          const bytes = base64ToBytes(info.scrollback_b64)
          term.write(bytes)
        }
      } catch (e) {
        console.warn('terminal attach replay failed', e)
      }

      // 3. Push initial size to backend now that the fit is settled
      try {
        const { cols, rows } = term
        await forge.terminalResize(workspaceId, cols, rows)
      } catch { /* ignore */ }
    }
    init()

    // 4. Stream data from backend → xterm
    const dataUnsubPromise = forgeEvents.onTerminalData((e) => {
      if (e.workspace_id !== workspaceId) return
      if (exitingRef.current) return
      try {
        term.write(base64ToBytes(e.data_b64))
      } catch (err) {
        console.warn('term.write failed', err)
      }
    })

    // 5. Backend → xterm: shell exited
    const exitUnsubPromise = forgeEvents.onTerminalExit((e) => {
      if (e.workspace_id !== workspaceId) return
      exitingRef.current = true
      const code = e.exit_code
      const msg = code === 0
        ? '[— shell exited —]'
        : `[— shell exited with code ${code} —]`
      term.write(`\r\n\x1b[33m${msg}\x1b[0m\r\n`)
    })

    // 6. xterm → backend: keystrokes
    const dataDisp = term.onData((d) => {
      if (exitingRef.current) return
      const bytes = new TextEncoder().encode(d)
      forge.terminalWrite(workspaceId, bytesToBase64(bytes)).catch((e) => {
        console.warn('terminalWrite failed', e)
      })
    })

    // 7. xterm → backend: size changes
    const resizeDisp = term.onResize(({ cols, rows }) => {
      forge.terminalResize(workspaceId, cols, rows).catch(() => { /* ignore */ })
    })

    // 8. ResizeObserver for container size changes
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch { /* ignore */ }
    })
    ro.observe(containerRef.current)

    return () => {
      cancelled = true
      exitingRef.current = false
      dataDisp.dispose()
      resizeDisp.dispose()
      ro.disconnect()
      Promise.all([dataUnsubPromise, exitUnsubPromise]).then((unsubs) => {
        unsubs.forEach((fn) => fn())
      })
      term.dispose()
      termRef.current = null
      fitRef.current = null
      // Per design: do NOT close the PTY here — it stays alive across tab switches.
    }
  }, [workspaceId])

  // Apply font size changes from theme settings
  useEffect(() => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term) return
    term.options.fontSize = fontSize
    try { fit?.fit() } catch { /* ignore */ }
  }, [fontSize])

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        background: '#06040a',
        padding: '8px 12px 12px',
        overflow: 'hidden',
      }}
    />
  )
}
