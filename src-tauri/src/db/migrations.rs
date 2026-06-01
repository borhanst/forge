use sqlx::SqlitePool;
use anyhow::Result;

pub async fn run(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS repositories (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            local_path   TEXT NOT NULL UNIQUE,
            github_url   TEXT,
            owner        TEXT,
            repo_name    TEXT,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id              TEXT PRIMARY KEY,
            repo_id         TEXT NOT NULL,
            city_name       TEXT NOT NULL,
            branch          TEXT NOT NULL,
            worktree_path   TEXT NOT NULL UNIQUE,
            provider        TEXT NOT NULL DEFAULT 'claude',
            provider_config TEXT,
            status          TEXT NOT NULL DEFAULT 'idle',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            archived_at     DATETIME,
            FOREIGN KEY(repo_id) REFERENCES repositories(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            prompt       TEXT,
            exit_code    INTEGER,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_at  DATETIME,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS output_lines (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   TEXT NOT NULL,
            stream       TEXT NOT NULL DEFAULT 'stdout',
            content      TEXT NOT NULL,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workspaces_repo_id  ON workspaces(repo_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_workspace   ON sessions(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_output_session       ON output_lines(session_id);

        CREATE TABLE IF NOT EXISTS pull_requests (
            id            TEXT PRIMARY KEY,
            workspace_id  TEXT NOT NULL UNIQUE,
            pr_number     INTEGER NOT NULL,
            title         TEXT NOT NULL,
            html_url      TEXT NOT NULL,
            state         TEXT NOT NULL DEFAULT 'open',
            merged        INTEGER DEFAULT 0,
            draft         INTEGER DEFAULT 0,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_pr_workspace ON pull_requests(workspace_id);

        CREATE TABLE IF NOT EXISTS line_comments (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id TEXT NOT NULL,
            file_path    TEXT NOT NULL,
            line_number  INTEGER NOT NULL,
            content      TEXT NOT NULL,
            author       TEXT NOT NULL DEFAULT 'User',
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_line_comments_workspace ON line_comments(workspace_id);
    "#,
    )
    .execute(pool)
    .await?;

    // Migration: add provider_config column to existing workspaces table
    let _ = sqlx::query("ALTER TABLE workspaces ADD COLUMN provider_config TEXT")
        .execute(pool)
        .await;

    // Migration: add merge settings columns
    let _ = sqlx::query("ALTER TABLE workspaces ADD COLUMN merge_push INTEGER DEFAULT 0")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE workspaces ADD COLUMN merge_cleanup TEXT DEFAULT 'archive'")
        .execute(pool)
        .await;

    Ok(())
}
