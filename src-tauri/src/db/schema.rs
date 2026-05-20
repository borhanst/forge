use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub local_path: String,
    pub github_url: Option<String>,
    pub owner: Option<String>,
    pub repo_name: Option<String>,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Workspace {
    pub id: String,
    pub repo_id: String,
    pub city_name: String,
    pub branch: String,
    pub worktree_path: String,
    pub provider: String,
    pub status: String,
    pub created_at: NaiveDateTime,
    pub archived_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: String,
    pub workspace_id: String,
    pub prompt: Option<String>,
    pub exit_code: Option<i64>,
    pub created_at: NaiveDateTime,
    pub finished_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OutputLine {
    pub id: Option<i64>,
    pub session_id: String,
    pub stream: String,
    pub content: String,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub repo_id: String,
    pub provider: String,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceWithRepo {
    pub workspace: Workspace,
    pub repository: Repository,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PullRequestRecord {
    pub id:           Option<String>,
    pub workspace_id: Option<String>,
    pub pr_number:    Option<i64>,
    pub title:        Option<String>,
    pub html_url:     Option<String>,
    pub state:        Option<String>,
    pub merged:       Option<i64>,
    pub draft:        Option<i64>,
    pub created_at:   Option<NaiveDateTime>,
    pub updated_at:   Option<NaiveDateTime>,
}
