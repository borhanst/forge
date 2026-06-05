import { create } from 'zustand'
import type { Repository, Workspace, ProviderInfo, AppSettings } from '../lib/tauri'
import { defaultAppSettings } from '../lib/settings'

export interface TerminalLine {
  stream:  'stdout' | 'stderr' | 'system'
  content: string
  ts:      number
}

export interface ToolCallInfo {
  name:   string
  args:   string
  status: 'running' | 'completed' | 'failed'
}

export interface FileChangeInfo {
  path: string
  type: 'created' | 'modified' | 'deleted'
}

export interface ChatMessage {
  id:          string
  role:        'user' | 'assistant'
  content:     string
  toolCalls:   ToolCallInfo[]
  fileChanges: FileChangeInfo[]
  diffContent?: string
  timestamp:   number
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

  chatMessages: Record<string, ChatMessage[]>

  settings:          AppSettings
  settingsLoaded:    boolean
  settingsOpen:      boolean
  settingsInitialTab: SettingsTabId

  sidebarOpen:        boolean
  rightPanelOpen:     boolean
  shortcutsOpen:      boolean
  addRepoModalOpen:   boolean

  setRepositories: (repos: Repository[]) => void
  setWorkspaces: (workspaces: Workspace[]) => void
  setProviders: (providers: ProviderInfo[]) => void
  setActiveWorkspace: (id: string | null) => void
  setActiveRepo: (id: string | null) => void

  appendAgentOutput: (workspaceId: string, line: TerminalLine) => void
  setAgentOutput:    (workspaceId: string, lines: TerminalLine[]) => void
  clearAgentOutput:  (workspaceId: string) => void

  addChatMessage:              (workspaceId: string, msg: ChatMessage) => void
  updateLastAssistantMessage:  (workspaceId: string, updater: (msg: ChatMessage) => ChatMessage) => void
  setChatMessages:             (workspaceId: string, msgs: ChatMessage[]) => void
  clearChatMessages:           (workspaceId: string) => void

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

  toggleSidebar:      () => void
  toggleRightPanel:   () => void
  openShortcuts:      () => void
  closeShortcuts:     () => void
  openAddRepoModal:   () => void
  closeAddRepoModal:  () => void
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
  chatMessages: {},

  settings:           defaultAppSettings,
  settingsLoaded:     false,
  settingsOpen:       false,
  settingsInitialTab: 'general',

  sidebarOpen:        true,
  rightPanelOpen:     true,
  shortcutsOpen:      false,
  addRepoModalOpen:   false,

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

  addChatMessage: (workspaceId, msg) =>
    set((s) => ({
      chatMessages: {
        ...s.chatMessages,
        [workspaceId]: [...(s.chatMessages[workspaceId] ?? []), msg],
      },
    })),

  updateLastAssistantMessage: (workspaceId, updater) =>
    set((s) => {
      const msgs = s.chatMessages[workspaceId]
      if (!msgs || msgs.length === 0) return s
      const last = msgs[msgs.length - 1]
      if (last.role !== 'assistant') return s
      const updated = updater(last)
      const next = [...msgs]
      next[next.length - 1] = updated
      return {
        chatMessages: { ...s.chatMessages, [workspaceId]: next },
      }
    }),

  setChatMessages: (workspaceId, msgs) =>
    set((s) => ({
      chatMessages: { ...s.chatMessages, [workspaceId]: msgs },
    })),

  clearChatMessages: (workspaceId) =>
    set((s) => ({
      chatMessages: { ...s.chatMessages, [workspaceId]: [] },
    })),

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

  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  toggleRightPanel: () => set(s => ({ rightPanelOpen: !s.rightPanelOpen })),
  openShortcuts: () => set({ shortcutsOpen: true }),
  closeShortcuts: () => set({ shortcutsOpen: false }),
  openAddRepoModal: () => set({ addRepoModalOpen: true }),
  closeAddRepoModal: () => set({ addRepoModalOpen: false }),
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
