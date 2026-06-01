use tauri::State;
use uuid::Uuid;
use chrono::Utc;
use crate::state::AppState;
use crate::db::schema::Repository;
use crate::services::git_service;

#[derive(serde::Deserialize)]
pub struct AddRepoByPathRequest {
    pub local_path: String,
    pub name: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct AddRepoByUrlRequest {
    pub github_url: String,
    pub clone_to: String,
}

#[tauri::command]
pub async fn add_repo_local(
    state: State<'_, AppState>,
    req: AddRepoByPathRequest,
) -> Result<Repository, String> {
    let local_path = req.local_path.clone();
    git_service::open_repo(&local_path).map_err(|e| e.to_string())?;

    // Prevent old-style worktree dirs from being tracked by git
    git_service::gitignore_forge_worktrees(&local_path);

    let name = req.name.unwrap_or_else(|| {
        std::path::Path::new(&local_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });

    let id  = Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();

    sqlx::query!(
        "INSERT INTO repositories (id, name, local_path, created_at) VALUES (?, ?, ?, ?)",
        id, name, local_path, now
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let repo = sqlx::query_as!(
        Repository,
        "SELECT * FROM repositories WHERE id = ?",
        id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(repo)
}

#[tauri::command]
pub async fn add_repo_clone(
    state: State<'_, AppState>,
    req: AddRepoByUrlRequest,
) -> Result<Repository, String> {
    let (owner, repo_name) = git_service::parse_github_url(&req.github_url)
        .ok_or("Invalid GitHub URL")?;

    let local_path = format!("{}/{}", req.clone_to.trim_end_matches('/'), repo_name);

    let url       = req.github_url.clone();
    let dest      = local_path.clone();
    tokio::task::spawn_blocking(move || git_service::clone_repo(&url, &dest))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // Prevent old-style worktree dirs from being tracked by git
    git_service::gitignore_forge_worktrees(&local_path);
    let id  = Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();

    sqlx::query!(
        r#"INSERT INTO repositories (id, name, local_path, github_url, owner, repo_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)"#,
        id, repo_name, local_path, req.github_url, owner, repo_name, now
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let repo = sqlx::query_as!(
        Repository,
        "SELECT * FROM repositories WHERE id = ?",
        id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(repo)
}

#[tauri::command]
pub async fn remove_repo(
    state: State<'_, AppState>,
    repo_id: String,
) -> Result<(), String> {
    sqlx::query!("DELETE FROM repositories WHERE id = ?", repo_id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
