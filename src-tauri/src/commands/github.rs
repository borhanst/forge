use tauri::State;
use uuid::Uuid;
use chrono::Utc;
use crate::state::AppState;
use crate::db::schema::{Workspace, Repository, PullRequestRecord};
use crate::services::github_client::GithubClient;
use serde::Deserialize;

#[tauri::command]
pub async fn save_github_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new("forge-app", "github-token")
        .map_err(|e| e.to_string())?;
    entry.set_password(&token)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn has_github_token() -> Result<bool, String> {
    let entry = keyring::Entry::new("forge-app", "github-token")
        .map_err(|e| e.to_string())?;
    Ok(entry.get_password().is_ok())
}

#[tauri::command]
pub async fn delete_github_token() -> Result<(), String> {
    let entry = keyring::Entry::new("forge-app", "github-token")
        .map_err(|e| e.to_string())?;
    entry.delete_password()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
pub struct CreatePrRequest {
    pub workspace_id: String,
    pub title:        String,
    pub body:         String,
    pub base_branch:  String,
    pub draft:        bool,
}

#[tauri::command]
pub async fn create_pr(
    state: State<'_, AppState>,
    req:   CreatePrRequest,
) -> Result<PullRequestRecord, String> {
    let ws = fetch_workspace(&state, &req.workspace_id).await?;
    let repo = fetch_repo(&state, &ws.repo_id).await?;

    let owner     = repo.owner.ok_or("Repo has no owner (add via GitHub URL)")?;
    let repo_name = repo.repo_name.ok_or("Repo has no repo_name")?;

    let token = get_stored_token().map_err(|e| format!("No GitHub token: {}", e))?;
    let client = GithubClient::new(token);

    let pr = client
        .create_pr(&owner, &repo_name, &req.title, &ws.branch, &req.base_branch, &req.body, req.draft)
        .await
        .map_err(|e| format!("GitHub API error: {}", e))?;

    let id  = Uuid::new_v4().to_string();
    let now = Utc::now().naive_utc();
    let merged_val = pr.merged.unwrap_or(false) as i64;
    let draft_val  = pr.draft.unwrap_or(false) as i64;
    let pr_number  = pr.number as i64;
    let pr_title   = pr.title.clone();
    let pr_html    = pr.html_url.clone();
    let pr_state   = pr.state.clone();

    sqlx::query!(
        r#"INSERT INTO pull_requests
           (id, workspace_id, pr_number, title, html_url, state, merged, draft, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        id,
        req.workspace_id,
        pr_number,
        pr_title,
        pr_html,
        pr_state,
        merged_val,
        draft_val,
        now,
        now,
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let record = sqlx::query_as!(
        PullRequestRecord,
        "SELECT * FROM pull_requests WHERE id = ?",
        id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(record)
}

#[tauri::command]
pub async fn get_pr_status(
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<PullRequestRecord>, String> {
    let record = sqlx::query_as!(
        PullRequestRecord,
        "SELECT * FROM pull_requests WHERE workspace_id = ?",
        workspace_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let Some(mut record) = record else {
        return Ok(None);
    };

    if let Ok(token) = get_stored_token() {
        let ws   = fetch_workspace(&state, &workspace_id).await?;
        let repo = fetch_repo(&state, &ws.repo_id).await?;

        if let (Some(owner), Some(repo_name)) = (repo.owner, repo.repo_name) {
            let client = GithubClient::new(token);
            if let Ok(pr) = client.get_pr(&owner, &repo_name, record.pr_number.unwrap_or(0) as u64).await {
                let now = Utc::now().naive_utc();
                let merged_i = pr.merged.unwrap_or(false) as i64;
                let draft_i  = pr.draft.unwrap_or(false) as i64;

                sqlx::query!(
                    "UPDATE pull_requests SET state = ?, merged = ?, draft = ?, updated_at = ? WHERE id = ?",
                    pr.state, merged_i, draft_i, now, record.id
                )
                .execute(&state.db)
                .await
                .ok();

                record.state  = Some(pr.state);
                record.merged = Some(merged_i);
                record.draft  = Some(draft_i);
            }
        }
    }

    Ok(Some(record))
}

async fn fetch_workspace(
    state:        &State<'_, AppState>,
    workspace_id: &str,
) -> Result<Workspace, String> {
    sqlx::query_as!(
        Workspace,
        "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE id = ?",
        workspace_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| format!("Workspace not found: {}", e))
}

async fn fetch_repo(
    state:   &State<'_, AppState>,
    repo_id: &str,
) -> Result<Repository, String> {
    sqlx::query_as!(
        Repository,
        "SELECT * FROM repositories WHERE id = ?",
        repo_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| format!("Repo not found: {}", e))
}

fn get_stored_token() -> anyhow::Result<String> {
    let entry = keyring::Entry::new("forge-app", "github-token")?;
    Ok(entry.get_password()?)
}
