import { create } from 'zustand'
import type { Repository, Workspace, ProviderInfo } from '../lib/tauri'

export interface TerminalLine {
  stream:  'stdout' | 'stderr' | 'system'
  content: string
  ts:      number
}

interface ForgeStore {
  repositories: Repository[]
  workspaces: Workspace[]
  providers: ProviderInfo[]

  activeWorkspaceId: string | null
  activeRepoId: string | null

  agentOutputs: Record<string, TerminalLine[]>
  runningAgents: Set<string>           // workspace IDs with active agents
  currentSessionId: Record<string, string>  // workspaceId -> sessionId

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
}

export const useForgeStore = create<ForgeStore>((set) => ({
  repositories: [],
  workspaces: [],
  providers: [],
  activeWorkspaceId: null,
  activeRepoId: null,
  agentOutputs: {},
  runningAgents: new Set<string>(),
  currentSessionId: {},

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
}))
