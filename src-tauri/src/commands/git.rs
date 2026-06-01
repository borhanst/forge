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
    let (ws, repo_path) = fetch_workspace_and_repo(&state, &workspace_id).await?;
    let branch = ws.branch.clone();

    let changed_files = tokio::task::spawn_blocking(move || {
        git_service::get_changed_files(&repo_path)
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
    let (_, repo_path) = fetch_workspace_and_repo(&state, &workspace_id).await?;

    tokio::task::spawn_blocking(move || {
        git_service::get_full_diff(&repo_path)
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
    let (ws, repo_path) = fetch_workspace_and_repo(&state, &req.workspace_id).await?;

    let token = get_stored_token().map_err(|e| format!("No GitHub token: {}", e))?;

    let branch_name = ws.branch.clone();
    let message = req.commit_message.clone();
    let repo_path_c = repo_path.clone();
    let branch_c = branch_name.clone();
    let token_c = token.clone();

    let commit_sha = tokio::task::spawn_blocking(move || {
        git_service::stage_and_commit_to_branch(&repo_path, &message, &branch_name)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || {
        git_service::push_branch(&repo_path_c, &branch_c, &token_c)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    Ok(commit_sha)
}

#[tauri::command]
pub async fn get_structured_diff(
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<git_service::FileDiff>, String> {
    let (_, repo_path) = fetch_workspace_and_repo(&state, &workspace_id).await?;

    tokio::task::spawn_blocking(move || {
        git_service::get_structured_diff(&repo_path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_commit_history(
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<git_service::CommitInfo>, String> {
    let (ws, repo_path) = fetch_workspace_and_repo(&state, &workspace_id).await?;
    let branch = ws.branch.clone();

    tokio::task::spawn_blocking(move || {
        git_service::get_commit_history(&repo_path, 50, &branch)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_commit_diff(
    state:        State<'_, AppState>,
    workspace_id: String,
    commit_hash:  String,
) -> Result<String, String> {
    let (_, repo_path) = fetch_workspace_and_repo(&state, &workspace_id).await?;

    tokio::task::spawn_blocking(move || {
        git_service::get_commit_diff(&repo_path, &commit_hash)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

async fn fetch_workspace_and_repo(
    state:        &State<'_, AppState>,
    workspace_id: &str,
) -> Result<(Workspace, String), String> {
    use crate::db::schema::Repository;
    let ws = sqlx::query_as!(
        Workspace,
        "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE id = ?",
        workspace_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| format!("Workspace not found: {}", e))?;

    let _repo = sqlx::query_as!(
        Repository,
        "SELECT * FROM repositories WHERE id = ?",
        ws.repo_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| format!("Repo not found: {}", e))?;

    let worktree_path = ws.worktree_path.clone();
    Ok((ws, worktree_path))
}

fn get_stored_token() -> anyhow::Result<String> {
    let entry = keyring::Entry::new("forge-app", "github-token")?;
    Ok(entry.get_password()?)
}
