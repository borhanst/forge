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

    let branch_name = ws.branch.clone();
    let message = req.commit_message.clone();
    let repo_path_c = repo_path.clone();
    let branch_c = branch_name.clone();

    let commit_sha = tokio::task::spawn_blocking(move || {
        git_service::stage_and_commit_to_branch(&repo_path, &message, &branch_name)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || {
        git_service::push_branch_cli(&repo_path_c, &branch_c)
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
pub async fn list_branches(
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<git_service::BranchInfo>, String> {
    let (_, repo_path) = fetch_workspace_and_repo(&state, &workspace_id).await?;

    tokio::task::spawn_blocking(move || {
        git_service::list_local_branches(&repo_path)
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
        "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at, merge_push, merge_cleanup FROM workspaces WHERE id = ?",
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

struct WorkspaceDetail {
    workspace: Workspace,
    worktree_path: String,
    repo_path: String,
}

async fn fetch_workspace_detail(
    state:        &State<'_, AppState>,
    workspace_id: &str,
) -> Result<WorkspaceDetail, String> {
    use crate::db::schema::Repository;
    let ws = sqlx::query_as!(
        Workspace,
        "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at, merge_push, merge_cleanup FROM workspaces WHERE id = ?",
        workspace_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| format!("Workspace not found: {}", e))?;

    let repo = sqlx::query_as!(
        Repository,
        "SELECT * FROM repositories WHERE id = ?",
        ws.repo_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| format!("Repo not found: {}", e))?;

    Ok(WorkspaceDetail {
        worktree_path: ws.worktree_path.clone(),
        repo_path: repo.local_path.clone(),
        workspace: ws,
    })
}

#[derive(Serialize)]
pub struct MergeResult {
    pub success: bool,
    pub conflicted_files: Vec<String>,
    pub message: String,
}

#[derive(serde::Deserialize)]
pub struct MergeRequest {
    pub workspace_id: String,
    pub target_branch: String,
    pub push_to_remote: bool,
    pub cleanup: String,
}

#[tauri::command]
pub async fn merge_worktree(
    state: State<'_, AppState>,
    req:   MergeRequest,
) -> Result<MergeResult, String> {
    let detail = fetch_workspace_detail(&state, &req.workspace_id).await?;

    // Check for uncommitted changes
    let has_changes = {
        let wt = detail.worktree_path.clone();
        tokio::task::spawn_blocking(move || {
            git_service::get_changed_files(&wt)
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?
    };
    if !has_changes.is_empty() {
        return Err("Workspace has uncommitted changes. Commit before merging.".to_string());
    }

    let forge_branch = detail.workspace.branch.clone();
    let forge_branch2 = forge_branch.clone();
    let main_repo = detail.repo_path.clone();
    let worktree_path = detail.worktree_path.clone();
    let target_branch = req.target_branch.clone();
    let target_branch2 = target_branch.clone();
    let push_to_remote = req.push_to_remote;
    let cleanup = req.cleanup.clone();
    let cleanup_mode = cleanup.clone();

    // Step 1: Ensure forge branch exists in main repo
    let merge_result = tokio::task::spawn_blocking(move || -> Result<MergeResult, String> {
        let exists = git_service::branch_exists(&main_repo, &forge_branch2)
            .map_err(|e| e.to_string())?;

        if !exists {
            git_service::push_local(&worktree_path, &forge_branch2)
                .map_err(|e| format!("Failed to push forge branch to main repo: {}", e))?;
            git_service::fetch_branch(&main_repo, "origin", &forge_branch2)
                .map_err(|e| format!("Failed to fetch forge branch: {}", e))?;
        }

        git_service::checkout_branch(&main_repo, &target_branch2)
            .map_err(|e| format!("Failed to checkout '{}': {}", e, target_branch2))?;

        let conflicted = git_service::merge_branch(&main_repo, &forge_branch2)
            .map_err(|e| format!("Merge failed: {}", e))?;

        if !conflicted.is_empty() {
            return Ok(MergeResult {
                success: false,
                conflicted_files: conflicted,
                message: "Merge conflicts detected".to_string(),
            });
        }

        if push_to_remote {
            git_service::push_branch_cli(&main_repo, &target_branch2)
                .map_err(|e| format!("Failed to push '{}': {}", target_branch2, e))?;
        }

        if cleanup_mode == "delete" {
            let _ = git_service::delete_local_branch(&main_repo, &forge_branch2);
            let _ = git_service::delete_remote_branch_cli(&main_repo, &forge_branch2);
        }

        Ok(MergeResult {
            success: true,
            conflicted_files: vec![],
            message: format!("Merged '{}' into '{}'", forge_branch2, target_branch2),
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e)?;

    if !merge_result.success {
        return Ok(merge_result);
    }

    // Step 6: Workspace DB cleanup
    match cleanup.as_str() {
        "archive" => {
            let now = chrono::Utc::now().naive_utc();
            sqlx::query!(
                "UPDATE workspaces SET status = 'archived', archived_at = ? WHERE id = ?",
                now, req.workspace_id
            )
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
        }
        "delete" => {
            // Remove worktree files
            let wt = detail.worktree_path.clone();
            let rp = detail.repo_path.clone();
            tokio::task::spawn_blocking(move || {
                let _ = git_service::remove_worktree(&rp, &wt);
                true
            })
            .await
            .ok();

            sqlx::query!("DELETE FROM workspaces WHERE id = ?", req.workspace_id)
                .execute(&state.db)
                .await
                .map_err(|e| e.to_string())?;
        }
        _ => {} // "none" — no DB cleanup
    }

    Ok(MergeResult {
        success: true,
        conflicted_files: vec![],
        message: format!("Merged '{}' into '{}'", forge_branch, target_branch),
    })
}

#[derive(serde::Deserialize)]
pub struct ResolveMergeRequest {
    pub workspace_id: String,
    pub target_branch: String,
    pub push_to_remote: bool,
    pub cleanup: String,
}

#[tauri::command]
pub async fn resolve_and_finish_merge(
    state: State<'_, AppState>,
    req:   ResolveMergeRequest,
    app:   tauri::AppHandle,
) -> Result<MergeResult, String> {
    let detail = fetch_workspace_detail(&state, &req.workspace_id).await?;
    let forge_branch = detail.workspace.branch.clone();
    let forge_branch2 = forge_branch.clone();
    let main_repo = detail.repo_path.clone();
    let worktree_path = detail.worktree_path.clone();
    let worktree_path2 = detail.worktree_path.clone();
    let target_branch = req.target_branch.clone();
    let target_branch2 = target_branch.clone();
    let push_to_remote = req.push_to_remote;
    let cleanup = req.cleanup.clone();
    let cleanup_mode = cleanup.clone();
    let ws_id = req.workspace_id.clone();
    let repo_path2 = detail.repo_path.clone();

    let provider_id = detail.workspace.provider.clone();
    let provider_config = detail.workspace.provider_config.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<MergeResult, String> {
        // Step 1: Ensure forge branch exists in main repo
        let exists = git_service::branch_exists(&main_repo, &forge_branch)
            .map_err(|e| e.to_string())?;

        if !exists {
            git_service::push_local(&worktree_path, &forge_branch)
                .map_err(|e| format!("Failed to push forge branch: {}", e))?;
            git_service::fetch_branch(&main_repo, "origin", &forge_branch)
                .map_err(|e| format!("Failed to fetch forge branch: {}", e))?;
        }

        // Step 2: Checkout target branch
        git_service::checkout_branch(&main_repo, &target_branch)
            .map_err(|e| format!("Failed to checkout '{}': {}", e, target_branch))?;

        // Step 3: Merge (no abort — stay in conflicted state)
        let conflicted = git_service::merge_no_abort(&main_repo, &forge_branch)
            .map_err(|e| format!("Merge failed: {}", e))?;

        if conflicted.is_empty() {
            // No conflicts — just push and cleanup
            if push_to_remote {
                git_service::push_branch_cli(&main_repo, &target_branch)
                    .map_err(|e| format!("Failed to push: {}", e))?;
            }
            return Ok(MergeResult {
                success: true,
                conflicted_files: vec![],
                message: format!("Merged '{}' into '{}'", forge_branch, target_branch),
            });
        }

        // Step 4: Run the agent to resolve conflicts
        let provider = crate::providers::get_provider(&provider_id)
            .ok_or_else(|| format!("Unknown provider: {}", provider_id))?;

        let options: std::collections::HashMap<String, String> = provider_config
            .as_ref()
            .and_then(|c| serde_json::from_str(c).ok())
            .unwrap_or_default();

        let prompt = format!(
            "Resolve all merge conflicts in this repository. \
             Conflicted files: {}. \
             Do NOT make any other changes. After resolving, run `git add -A` to stage the fixes. \
             Do NOT commit — I will handle that.",
            conflicted.join(", ")
        );

        let (binary, args) = provider.build_command(&prompt, &main_repo, &options);

        let resolved_path = crate::providers::resolve_binary_path(&binary, &std::env::var("PATH").unwrap_or_default())
            .ok_or_else(|| format!("{} CLI not found on PATH", binary))?;

        let agent_output = std::process::Command::new(&resolved_path)
            .args(&args)
            .current_dir(&main_repo)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to spawn agent: {}", e))?;

        if !agent_output.status.success() {
            let stderr = String::from_utf8_lossy(&agent_output.stderr);
            tracing::warn!("Conflict resolution agent exited with non-zero: {}", stderr.trim());
            // Continue anyway — agent may have partially resolved
        }

        // Step 5: Stage all resolved files
        let _ = git_service::stage_all(&main_repo);

        // Step 6: Check if any conflicts remain
        let remaining = git_service::list_unmerged_files(&main_repo).unwrap_or_default();

        if !remaining.is_empty() {
            // Conflicts remain — abort
            let _ = git_service::abort_merge(&main_repo);
            return Ok(MergeResult {
                success: false,
                conflicted_files: remaining,
                message: "Agent could not resolve all conflicts".to_string(),
            });
        }

        // Step 7: Commit the resolution
        let _ = git_service::commit(&main_repo, "resolve merge conflicts")
            .map_err(|e| format!("Failed to commit resolution: {}", e))?;

        // Step 8: Push if needed
        if push_to_remote {
            git_service::push_branch_cli(&main_repo, &target_branch2)
                .map_err(|e| format!("Failed to push: {}", e))?;
        }

        // Step 9: Cleanup
        if cleanup_mode == "delete" {
            let _ = git_service::delete_local_branch(&main_repo, &forge_branch2);
            let _ = git_service::delete_remote_branch_cli(&main_repo, &forge_branch2);
        }

        Ok(MergeResult {
            success: true,
            conflicted_files: vec![],
            message: format!("Conflicts resolved and merged '{}' into '{}'", forge_branch2, target_branch2),
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e)?;

    // Workspace DB cleanup
    match cleanup.as_str() {
        "archive" => {
            let now = chrono::Utc::now().naive_utc();
            sqlx::query!(
                "UPDATE workspaces SET status = 'archived', archived_at = ? WHERE id = ?",
                now, ws_id
            )
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
        }
        "delete" => {
            let _ = tokio::task::spawn_blocking(move || {
                let _ = git_service::remove_worktree(&repo_path2, &worktree_path2);
            })
            .await;
            sqlx::query!("DELETE FROM workspaces WHERE id = ?", ws_id)
                .execute(&state.db)
                .await
                .map_err(|e| e.to_string())?;
        }
        _ => {}
    }

    Ok(result)
}

#[derive(serde::Deserialize)]
pub struct UpdateMergeSettingsRequest {
    pub workspace_id: String,
    pub merge_push: bool,
    pub merge_cleanup: String,
}

#[tauri::command]
pub async fn update_workspace_merge_settings(
    state: State<'_, AppState>,
    req:   UpdateMergeSettingsRequest,
) -> Result<(), String> {
    let push: i64 = if req.merge_push { 1 } else { 0 };
    let cleanup = req.merge_cleanup;
    let ws_id = req.workspace_id;
    sqlx::query!(
        "UPDATE workspaces SET merge_push = ?, merge_cleanup = ? WHERE id = ?",
        push,
        cleanup,
        ws_id,
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn get_stored_token() -> anyhow::Result<String> {
    let entry = keyring::Entry::new("forge-app", "github-token")?;
    Ok(entry.get_password()?)
}
