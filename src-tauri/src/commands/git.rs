use tauri::State;
use crate::state::AppState;
use crate::db::schema::Workspace;
use crate::services::git_service;
use serde::Serialize;

#[derive(Serialize)]
pub struct GitStatus {
    pub workspace_id:    String,
    pub branch:          String,
    pub changed_files:   Vec<String>,
    pub changed_count:   usize,
    pub has_changes:     bool,
}

#[tauri::command]
pub async fn get_git_status(
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<GitStatus, String> {
    let ws = fetch_workspace(&state, &workspace_id).await?;

    let path  = ws.worktree_path.clone();
    let branch = ws.branch.clone();

    let changed_files = tokio::task::spawn_blocking(move || {
        git_service::get_changed_files(&path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let changed_count = changed_files.len();

    Ok(GitStatus {
        workspace_id,
        branch,
        changed_files,
        changed_count,
        has_changes: changed_count > 0,
    })
}

#[tauri::command]
pub async fn get_diff(
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<String, String> {
    let ws = fetch_workspace(&state, &workspace_id).await?;
    let path = ws.worktree_path.clone();

    tokio::task::spawn_blocking(move || {
        git_service::get_full_diff(&path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
pub struct CommitAndPushRequest {
    pub workspace_id:   String,
    pub commit_message: String,
}

#[tauri::command]
pub async fn commit_and_push(
    state: State<'_, AppState>,
    req:   CommitAndPushRequest,
) -> Result<String, String> {
    let ws = fetch_workspace(&state, &req.workspace_id).await?;

    let token = get_stored_token().map_err(|e| format!("No GitHub token: {}", e))?;

    let path    = ws.worktree_path.clone();
    let message = req.commit_message.clone();
    let token_c = token.clone();
    let path_c  = path.clone();

    let commit_sha = tokio::task::spawn_blocking(move || {
        git_service::stage_and_commit(&path, &message)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || {
        git_service::push_branch(&path_c, &token_c)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    Ok(commit_sha)
}

async fn fetch_workspace(
    state:        &State<'_, AppState>,
    workspace_id: &str,
) -> Result<Workspace, String> {
    sqlx::query_as!(
        Workspace,
        "SELECT * FROM workspaces WHERE id = ?",
        workspace_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| format!("Workspace not found: {}", e))
}

fn get_stored_token() -> anyhow::Result<String> {
    let entry = keyring::Entry::new("forge-app", "github-token")?;
    Ok(entry.get_password()?)
}
