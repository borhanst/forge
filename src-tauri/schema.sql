CREATE TABLE IF NOT EXISTS repositories (
    id           TEXT PRIMARY KEY NOT NULL,
    name         TEXT NOT NULL,
    local_path   TEXT NOT NULL UNIQUE,
    github_url   TEXT,
    owner        TEXT,
    repo_name    TEXT,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
    id            TEXT PRIMARY KEY NOT NULL,
    repo_id       TEXT NOT NULL,
    city_name     TEXT NOT NULL,
    branch        TEXT NOT NULL,
    worktree_path TEXT NOT NULL UNIQUE,
    provider      TEXT NOT NULL DEFAULT 'claude',
    status        TEXT NOT NULL DEFAULT 'idle',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at   DATETIME,
    FOREIGN KEY(repo_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    prompt       TEXT,
    exit_code    INTEGER,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at  DATETIME,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS output_lines (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT NOT NULL,
    stream       TEXT NOT NULL DEFAULT 'stdout',
    content      TEXT NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workspaces_repo_id  ON workspaces(repo_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace   ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_output_lines_session ON output_lines(session_id);

CREATE TABLE IF NOT EXISTS pull_requests (
    id           TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    pr_number    INTEGER,
    title        TEXT,
    html_url     TEXT,
    state        TEXT,
    merged       INTEGER DEFAULT 0,
    draft        INTEGER DEFAULT 0,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pull_requests_workspace ON pull_requests(workspace_id);
