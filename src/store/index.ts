import { create } from 'zustand'
import type { Repository, Workspace, ProviderInfo, AppSettings } from '../lib/tauri'
import { defaultAppSettings } from '../lib/settings'

export interface TerminalLine {
  stream:  'stdout' | 'stderr' | 'system'
  content: string
  ts:      number
}

export type SettingsTabId = 'general' | 'theme' | 'agents' | 'github' | 'about'

interface ForgeStore {
  repositories: Repository[]
  workspaces: Workspace[]
  providers: ProviderInfo[]

  activeWorkspaceId: string | null
  activeRepoId: string | null

  agentOutputs: Record<string, TerminalLine[]>
  runningAgents: Set<string>           // workspace IDs with active agents
  currentSessionId: Record<string, string>  // workspaceId -> sessionId

  settings:          AppSettings
  settingsLoaded:    boolean
  settingsOpen:      boolean
  settingsInitialTab: SettingsTabId

  setRepositories: (repos: Repository[]) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  setProviders: (providers: ProviderInfo[]) => void
  setActiveWorkspace: (id: string | null) => void
  setActiveRepo: (id: string | null) => void

  appendAgentOutput: (workspaceId: string, line: TerminalLine) => void
  setAgentOutput:    (workspaceId: string, lines: TerminalLine[]) => void
  clearAgentOutput:  (workspaceId: string) => void

  updateWorkspaceStatus: (
    workspaceId: string,
    status: Workspace['status']
  ) => void

  setRunningAgent: (workspaceId: string, sessionId: string) => void
  clearRunningAgent: (workspaceId: string) => void

  setSettings: (settings: AppSettings) => void
  patchSettings: (updater: (s: AppSettings) => AppSettings) => void
  openSettings: (tab?: SettingsTabId) => void
  closeSettings: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useForgeStore = create<ForgeStore>((set, get) => ({
  repositories: [],
  workspaces: [],
  providers: [],
  activeWorkspaceId: null,
  activeRepoId: null,
  agentOutputs: {},
  runningAgents: new Set<string>(),
  currentSessionId: {},

  settings:           defaultAppSettings,
  settingsLoaded:     false,
  settingsOpen:       false,
  settingsInitialTab: 'general',

  setRepositories: (repositories) => set({ repositories }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setProviders: (providers) => set({ providers }),
  setActiveWorkspace: (activeWorkspaceId) => set({ activeWorkspaceId }),
  setActiveRepo: (activeRepoId) => set({ activeRepoId }),

  appendAgentOutput: (workspaceId, line) =>
    set((s) => ({
      agentOutputs: {
        ...s.agentOutputs,
        [workspaceId]: [...(s.agentOutputs[workspaceId] ?? []), line],
      },
    })),

  setAgentOutput: (workspaceId, lines) =>
    set((s) => ({
      agentOutputs: {
        ...s.agentOutputs,
        [workspaceId]: lines,
      },
    })),

  clearAgentOutput: (workspaceId) =>
    set((s) => ({
      agentOutputs: { ...s.agentOutputs, [workspaceId]: [] },
    })),

  updateWorkspaceStatus: (workspaceId, status) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, status } : w
      ),
    })),

  setRunningAgent: (workspaceId, sessionId) =>
    set((s) => ({
      runningAgents: new Set([...s.runningAgents, workspaceId]),
      currentSessionId: { ...s.currentSessionId, [workspaceId]: sessionId },
    })),

  clearRunningAgent: (workspaceId) =>
    set((s) => {
      const next = new Set(s.runningAgents)
      next.delete(workspaceId)
      return { runningAgents: next }
    }),

  setSettings: (settings) => {
    set({ settings, settingsLoaded: true })
    scheduleSave(settings)
  },

  patchSettings: (updater) => {
    const next = updater(get().settings)
    set({ settings: next, settingsLoaded: true })
    scheduleSave(next)
  },

  openSettings: (tab) =>
    set({ settingsOpen: true, settingsInitialTab: tab ?? 'general' }),

  closeSettings: () => set({ settingsOpen: false }),
}))

function scheduleSave(settings: AppSettings) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    import('../lib/tauri').then(({ forge }) => {
      forge.updateAppSettings(settings).catch((e) => {
        console.error('[settings] save failed:', e)
      })
    })
  }, 300)
}
