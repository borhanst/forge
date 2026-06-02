import { useCallback, useEffect, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import { MainPanel } from './components/MainPanel'
import { ConfirmDialogHost } from './components/ConfirmDialog'
import ShortcutsModal from './components/ShortcutsModal'
import { useAgentEvents } from './hooks/useAgentEvents'
import { useThemeStyle } from './hooks/useThemeStyle'
import { useShortcuts } from './hooks/useShortcuts'
import { forge, forgeEvents } from './lib/tauri'
import { useForgeStore } from './store'
import { colors } from './theme'
import type { Shortcut } from './lib/shortcuts'
import '@xterm/xterm/css/xterm.css'
import './App.css'

export default function App() {
  const {
    setProviders,
    setRepositories,
    setWorkspaces,
    setRunningAgent,
    setSettings,
    sidebarOpen,
  } = useForgeStore()

  useAgentEvents()
  useThemeStyle()

  useEffect(() => {
    forge.listProviders().then(setProviders).catch(e => console.error('[App] listProviders failed:', e))
    forge.listRepositories().then(setRepositories).catch(e => console.error('[App] listRepositories failed:', e))
    forge.listWorkspaces().then(setWorkspaces).catch(e => console.error('[App] listWorkspaces failed:', e))

    forge.getAppSettings().then(setSettings).catch(e => console.error('[App] getAppSettings failed:', e))

    forge.listRunningAgents().then((agents) => {
      agents.forEach((a) => setRunningAgent(a.workspace_id, a.session_id))
    }).catch(e => console.error('[App] listRunningAgents failed:', e))
  }, [])

  useEffect(() => {
    const unlisten = forgeEvents.onProvidersRefresh(() => {
      forge.listProviders().then(setProviders).catch(e => console.error('[App] refreshProviders failed:', e))
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  const shortcuts = useShortcutsList()

  useShortcuts(() => shortcuts)

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: colors.soot,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {sidebarOpen && <Sidebar />}
      <MainPanel />
      <ConfirmDialogHost />
      <ShortcutsModal shortcuts={shortcuts} />
    </div>
  )
}

function useShortcutsList(): Shortcut[] {
  const {
    workspaces,
    activeWorkspaceId,
    runningAgents,
    openSettings,
    openAddRepoModal,
    openShortcuts,
    setActiveWorkspace,
    toggleSidebar,
    toggleRightPanel,
    clearAgentOutput,
  } = useForgeStore()

  const visible = useMemo(
    () => workspaces.filter(w => w.status !== 'archived'),
    [workspaces]
  )

  const fire = useCallback((name: string, detail?: string) => {
    window.dispatchEvent(new CustomEvent(name, { detail }))
  }, [])

  return useMemo<Shortcut[]>(() => {
    const list: Shortcut[] = [
      { id: 'openSettings',   combo: 'Mod+,',  description: 'Open settings',                 group: 'Global',     action: () => openSettings('general') },
      { id: 'addRepo',        combo: 'Mod+N',  description: 'Add repository',               group: 'Global',     action: () => openAddRepoModal() },
      { id: 'shortcuts',      combo: '?',      description: 'Show keyboard shortcuts',      group: 'Global',     action: () => openShortcuts() },
      { id: 'toggleSidebar',  combo: 'Mod+B',  description: 'Toggle sidebar',                group: 'Navigation', action: () => toggleSidebar() },
      { id: 'toggleRight',    combo: 'Mod+\\', description: 'Toggle right panel',            group: 'Navigation', action: () => toggleRightPanel() },
      { id: 'wsClear',        combo: 'Mod+0',  description: 'Clear active workspace',        group: 'Navigation', action: () => { setActiveWorkspace(null) } },
    ]

    for (let i = 0; i < 9; i++) {
      const idx = i
      const target = visible[idx]
      if (!target) {
        list.push({
          id: `ws${i + 1}`,
          combo: `Mod+${i + 1}`,
          description: `Switch to workspace ${i + 1}`,
          group: 'Navigation',
          enabled: false,
          action: () => {},
        })
        continue
      }
      list.push({
        id: `ws${i + 1}`,
        combo: `Mod+${i + 1}`,
        description: `Switch to ${truncate(target.city_name, 22)}`,
        group: 'Navigation',
        action: () => setActiveWorkspace(target.id),
      })
    }

    if (activeWorkspaceId) {
      list.push({
        id: 'focusPrompt',
        combo: 'Mod+E',
        description: 'Focus prompt',
        group: 'Editing',
        action: () => fire('forge:focus-prompt'),
      })
      list.push({
        id: 'clearOutput',
        combo: 'Mod+L',
        description: 'Clear agent output',
        group: 'Workspace',
        action: () => {
          if (activeWorkspaceId) clearAgentOutput(activeWorkspaceId)
        },
      })
      list.push({
        id: 'stop',
        combo: 'Mod+.',
        description: 'Quench running agent',
        group: 'Workspace',
        enabled: runningAgents.has(activeWorkspaceId),
        action: () => {
          if (activeWorkspaceId) forge.stopAgent(activeWorkspaceId).catch(() => {})
        },
      })
      list.push({
        id: 'toggleBottom',
        combo: 'Mod+J',
        description: 'Toggle Agent / Shell tab',
        group: 'Workspace',
        action: () => fire('forge:toggle-bottom-tab'),
      })
      list.push({
        id: 'tabDiff',
        combo: 'Mod+Shift+D',
        description: 'Show Changes',
        group: 'Workspace',
        action: () => fire('forge:set-right-tab', 'diff'),
      })
      list.push({
        id: 'tabPR',
        combo: 'Mod+Shift+P',
        description: 'Show Ship (PR)',
        group: 'Workspace',
        action: () => fire('forge:set-right-tab', 'pr'),
      })
      list.push({
        id: 'tabForge',
        combo: 'Mod+Shift+F',
        description: 'Show Forge (workspace settings)',
        group: 'Workspace',
        action: () => fire('forge:set-right-tab', 'settings'),
      })
    }

    return list
  }, [
    visible, activeWorkspaceId, runningAgents,
    openSettings, openAddRepoModal, openShortcuts,
    setActiveWorkspace, toggleSidebar, toggleRightPanel,
    clearAgentOutput, fire,
  ])
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
