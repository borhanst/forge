import { useEffect } from 'react'
import Sidebar from './components/Sidebar'
import { MainPanel } from './components/MainPanel'
import { useAgentEvents } from './hooks/useAgentEvents'
import { forge } from './lib/tauri'
import { useForgeStore } from './store'
import './App.css'

const spinStyle = document.createElement('style')
spinStyle.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
document.head.appendChild(spinStyle)

export default function App() {
  const { 
    setProviders, 
    setRepositories, 
    setWorkspaces, 
    setRunningAgent 
  } = useForgeStore()

  useAgentEvents()

  useEffect(() => {
    forge.listProviders().then(setProviders).catch(e => console.error('[App] listProviders failed:', e))
    forge.listRepositories().then(setRepositories).catch(e => console.error('[App] listRepositories failed:', e))
    forge.listWorkspaces().then(setWorkspaces).catch(e => console.error('[App] listWorkspaces failed:', e))

    // Restore any agents that were running before the window reloaded
    forge.listRunningAgents().then((agents) => {
      agents.forEach((a) => setRunningAgent(a.workspace_id, a.session_id))
    }).catch(e => console.error('[App] listRunningAgents failed:', e))
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0d0e11', overflow: 'hidden' }}>
      <Sidebar />
      <MainPanel />
    </div>
  )
}
