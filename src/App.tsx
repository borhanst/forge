import { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import { MainPanel } from './components/MainPanel'
import { ConfirmDialogHost } from './components/ConfirmDialog'
import { useAgentEvents } from './hooks/useAgentEvents'
import { useThemeStyle } from './hooks/useThemeStyle'
import { forge, forgeEvents } from './lib/tauri'
import { useForgeStore } from './store'
import { colors } from './theme'
import '@xterm/xterm/css/xterm.css'
import './App.css'

export default function App() {
  const {
    setProviders,
    setRepositories,
    setWorkspaces,
    setRunningAgent,
    setSettings,
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
      <Sidebar />
      <MainPanel />
      <ConfirmDialogHost />
    </div>
  )
}
