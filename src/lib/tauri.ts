import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type { UnlistenFn }

export interface Repository {
  id: string
  name: string
  local_path: string
  github_url: string | null
  owner: string | null
  repo_name: string | null
  created_at: string
}

export interface Workspace {
  id: string
  repo_id: string
  city_name: string
  branch: string
  worktree_path: string
  provider: string
  provider_config: string | null
  status: 'idle' | 'running' | 'done' | 'error' | 'archived'
  created_at: string
  archived_at: string | null
  merge_push: number | null
  merge_cleanup: string | null
}

export interface ProviderInfo {
  id: string
  display_name: string
  cli_binary: string
  description: string
  available: boolean
  supports_model: boolean
  supports_mode: boolean
}

export interface Session {
  id: string
  workspace_id: string
  prompt: string | null
  exit_code: number | null
  created_at: string
  finished_at: string | null
}

export interface OutputLine {
  id: number
  session_id: string
  stream: 'stdout' | 'stderr' | 'system'
  content: string
  created_at: string
}

export interface AgentOutputEvent {
  workspace_id: string
  session_id: string
  stream: 'stdout' | 'stderr' | 'system'
  content: string
}

export interface AgentStatusEvent {
  workspace_id: string
  session_id: string
  status: 'running' | 'done' | 'error' | 'stopped'
  exit_code: number | null
}

export interface AgentStatusSnapshot {
  workspace_id: string
  session_id: string
  provider_id: string
}

export interface MergeResult {
  success: boolean
  conflicted_files: string[]
  message: string
}

export interface BranchInfo {
  name: string
  is_default: boolean
}

export interface GitStatus {
  workspace_id:  string
  branch:        string
  changed_files: string[]
  changed_count: number
  has_changes:   boolean
}

export interface FileDiff {
  path:      string
  status:    'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
  diff:      string
}

export interface LineComment {
  id:           number
  workspace_id: string
  file_path:    string
  line_number:  number
  content:      string
  author:       string
  created_at:   string
}

export interface CommitInfo {
  hash:        string
  short_hash:  string
  author:      string
  message:     string
  timestamp:   number
}

export interface PullRequestRecord {
  id:           string | null
  workspace_id: string | null
  pr_number:    number | null
  title:        string | null
  html_url:     string | null
  state:        string | null
  merged:       number | null
  draft:        number | null
  created_at:   string | null
  updated_at:   string | null
}

export interface TerminalDataEvent {
  workspace_id: string
  data_b64:     string
}

export interface TerminalExitEvent {
  workspace_id: string
  exit_code:    number | null
}

export interface TerminalAttachInfo {
  workspace_id:    string
  scrollback_b64:  string
  is_running:      boolean
}

export interface GitHubUser {
  login:      string
  name:       string | null
  html_url:   string
  avatar_url: string
}

export interface AppSettings {
  general: {
    defaultProvider:      string
    defaultBaseBranch:    string
    defaultCleanup:       'archive' | 'delete' | 'keep'
    confirmBeforeArchive: boolean
    confirmBeforeDelete:  boolean
    showKeyboardHints:    boolean
  }
  theme: {
    accent:           'ember' | 'brass' | 'cobalt' | 'patina' | 'rust'
    density:          'compact' | 'cozy' | 'spacious'
    terminalFontSize: number
  }
  agents: { defaultProvider: string }
  github: { hasToken: boolean }
}

export const forge = {
  ping: () =>
    invoke<string>('ping'),

  listProviders: () =>
    invoke<ProviderInfo[]>('list_providers'),

  listRepositories: () =>
    invoke<Repository[]>('list_repositories'),

  listWorkspaces: (repoId?: string) =>
    invoke<Workspace[]>('list_workspaces', { repoId }),

  addRepoLocal: (localPath: string, name?: string) =>
    invoke<Repository>('add_repo_local', { req: { local_path: localPath, name } }),

  addRepoClone: (githubUrl: string, cloneTo: string) =>
    invoke<Repository>('add_repo_clone', { req: { github_url: githubUrl, clone_to: cloneTo } }),

  removeRepo: (repoId: string) =>
    invoke<void>('remove_repo', { repoId }),

  createWorkspace: (repoId: string, provider: string, providerConfig?: Record<string, string>) =>
    invoke<Workspace>('create_workspace', { req: { repo_id: repoId, provider, provider_config: providerConfig } }),

  archiveWorkspace: (workspaceId: string) =>
    invoke<void>('archive_workspace', { workspaceId }),

  restoreWorkspace: (workspaceId: string) =>
    invoke<void>('restore_workspace', { workspaceId }),

  deleteWorkspace: (workspaceId: string) =>
    invoke<void>('delete_workspace', { workspaceId }),

  updateWorkspaceProvider: (workspaceId: string, provider: string) =>
    invoke<void>('update_workspace_provider', { workspaceId, provider }),

  updateWorkspaceConfig: (workspaceId: string, config: Record<string, string>) =>
    invoke<void>('update_workspace_config', { workspaceId, config }),

  listArchivedWorkspaces: (repoId?: string) =>
    invoke<Workspace[]>('list_archived_workspaces', { repoId }),

  runAgent: (workspaceId: string, prompt: string) =>
    invoke<string>('run_agent', { request: { workspace_id: workspaceId, prompt } }),

  stopAgent: (workspaceId: string) =>
    invoke<void>('stop_agent', { workspaceId }),

  getSessionOutput: (sessionId: string) =>
    invoke<OutputLine[]>('get_session_output', { sessionId }),

  getLatestSession: (workspaceId: string) =>
    invoke<Session | null>('get_latest_session', { workspaceId }),

  listRunningAgents: () =>
    invoke<AgentStatusSnapshot[]>('list_running_agents'),

  listBranches: (workspaceId: string) =>
    invoke<BranchInfo[]>('list_branches', { workspaceId }),

  mergeWorktree: (workspaceId: string, targetBranch: string, pushToRemote: boolean, cleanup: string) =>
    invoke<MergeResult>('merge_worktree', { req: { workspace_id: workspaceId, target_branch: targetBranch, push_to_remote: pushToRemote, cleanup } }),

  resolveAndFinishMerge: (workspaceId: string, targetBranch: string, pushToRemote: boolean, cleanup: string) =>
    invoke<MergeResult>('resolve_and_finish_merge', { req: { workspace_id: workspaceId, target_branch: targetBranch, push_to_remote: pushToRemote, cleanup } }),

  getGitStatus: (workspaceId: string) =>
    invoke<GitStatus>('get_git_status', { workspaceId }),

  getDiff: (workspaceId: string) =>
    invoke<string>('get_diff', { workspaceId }),

  getStructuredDiff: (workspaceId: string) =>
    invoke<FileDiff[]>('get_structured_diff', { workspaceId }),

  addLineComment: (workspaceId: string, filePath: string, lineNumber: number, content: string) =>
    invoke<number>('add_line_comment', { workspaceId, filePath, lineNumber, content }),

  getLineComments: (workspaceId: string) =>
    invoke<LineComment[]>('get_line_comments', { workspaceId }),

  deleteLineComment: (id: number) =>
    invoke<void>('delete_line_comment', { id }),

  getCommitHistory: (workspaceId: string) =>
    invoke<CommitInfo[]>('get_commit_history', { workspaceId }),

  getCommitDiff: (workspaceId: string, commitHash: string) =>
    invoke<string>('get_commit_diff', { workspaceId, commitHash }),

  commitAndPush: (workspaceId: string, commitMessage: string) =>
    invoke<string>('commit_and_push', { req: { workspace_id: workspaceId, commit_message: commitMessage } }),

  getResolvedPath: () =>
    invoke<string>('get_resolved_path'),

  saveGithubToken: (token: string) =>
    invoke<void>('save_github_token', { token }),

  hasGithubToken: () =>
    invoke<boolean>('has_github_token'),

  deleteGithubToken: () =>
    invoke<void>('delete_github_token'),

  getGithubUser: () =>
    invoke<GitHubUser | null>('get_github_user'),

  createPr: (
    workspaceId: string,
    title: string,
    body: string,
    baseBranch: string,
    draft: boolean
  ) =>
    invoke<PullRequestRecord>('create_pr', {
      req: { workspace_id: workspaceId, title, body, base_branch: baseBranch, draft }
    }),

  getPrStatus: (workspaceId: string) =>
    invoke<PullRequestRecord | null>('get_pr_status', { workspaceId }),

  installProvider: (providerId: string) =>
    invoke<void>('install_provider', { providerId }),

  updateWorkspaceMergeSettings: (workspaceId: string, mergePush: boolean, mergeCleanup: string) =>
    invoke<void>('update_workspace_merge_settings', { req: { workspace_id: workspaceId, merge_push: mergePush, merge_cleanup: mergeCleanup } }),

  terminalOpen: (workspaceId: string) =>
    invoke<void>('terminal_open', { workspaceId }),

  terminalWrite: (workspaceId: string, dataB64: string) =>
    invoke<void>('terminal_write', { workspaceId, dataB64 }),

  terminalResize: (workspaceId: string, cols: number, rows: number) =>
    invoke<void>('terminal_resize', { workspaceId, cols, rows }),

  terminalClose: (workspaceId: string) =>
    invoke<void>('terminal_close', { workspaceId }),

  terminalAttach: (workspaceId: string) =>
    invoke<TerminalAttachInfo | null>('terminal_attach', { workspaceId }),

  getAppSettings: () =>
    invoke<AppSettings>('get_app_settings'),

  updateAppSettings: (settings: AppSettings) =>
    invoke<void>('update_app_settings', { settings }),
}

export const forgeEvents = {
  onAgentOutput: (cb: (e: AgentOutputEvent) => void): Promise<UnlistenFn> =>
    listen<AgentOutputEvent>('agent:output', (e) => cb(e.payload)),

  onAgentStatus: (cb: (e: AgentStatusEvent) => void): Promise<UnlistenFn> =>
    listen<AgentStatusEvent>('agent:status', (e) => cb(e.payload)),

  onWorkspaceUpdated: (cb: (e: Workspace) => void): Promise<UnlistenFn> =>
    listen<Workspace>('workspace:updated', (e) => cb(e.payload)),

  onWorkspaceCreated: (cb: (e: Workspace) => void): Promise<UnlistenFn> =>
    listen<Workspace>('workspace:created', (e) => cb(e.payload)),

  onProvidersRefresh: (cb: () => void): Promise<UnlistenFn> =>
    listen('providers:refresh', () => cb()),

  onTerminalData: (cb: (e: TerminalDataEvent) => void): Promise<UnlistenFn> =>
    listen<TerminalDataEvent>('terminal:data', (e) => cb(e.payload)),

  onTerminalExit: (cb: (e: TerminalExitEvent) => void): Promise<UnlistenFn> =>
    listen<TerminalExitEvent>('terminal:exit', (e) => cb(e.payload)),
}
