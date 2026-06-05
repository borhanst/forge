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
        }

        // Merge without touching the main repo's working tree (prevents Vite HMR reload)
        let conflicted = git_service::merge_into_branch_no_checkout(
            &main_repo, &worktree_path, &forge_branch2, &target_branch2,
        )
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
    let shell_path = state.shell_path();

    let result = tokio::task::spawn_blocking(move || -> Result<MergeResult, String> {
        // Step 1: Ensure forge branch exists in main repo
        let exists = git_service::branch_exists(&main_repo, &forge_branch)
            .map_err(|e| e.to_string())?;

        if !exists {
            git_service::push_local(&worktree_path, &forge_branch)
                .map_err(|e| format!("Failed to push forge branch: {}", e))?;
        }

        // Step 2: Try a no-checkout merge first
        let conflicted = git_service::merge_into_branch_no_checkout(
            &main_repo, &worktree_path, &forge_branch, &target_branch,
        )
        .map_err(|e| format!("Merge failed: {}", e))?;

        if conflicted.is_empty() {
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

        // Conflicts exist — run agent in a temp worktree (never touch main repo working tree)
        let tmp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
        let tmp_path = tmp_dir.path().to_str().unwrap().to_string();

        let clone_out = std::process::Command::new("git")
            .args(["clone", "--local", &main_repo, &tmp_path])
            .output()
            .map_err(|e| e.to_string())?;
        if !clone_out.status.success() {
            return Err(format!("clone failed: {}", String::from_utf8_lossy(&clone_out.stderr).trim()));
        }

        // Checkout target branch and merge forge branch in the temp clone
        git_service::checkout_branch(&tmp_path, &target_branch)
            .map_err(|e| format!("checkout in temp clone failed: {}", e))?;
        let _ = git_service::merge_no_abort(&tmp_path, &forge_branch);

        // Run agent to resolve conflicts in the temp clone
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
        let (binary, args) = provider.build_command(&prompt, &tmp_path, &options, &shell_path);
        let resolved_path = crate::providers::resolve_provider_binary(&binary, &shell_path)
            .ok_or_else(|| format!("{} CLI not found on PATH", binary))?;
        let agent_output = std::process::Command::new(&resolved_path)
            .args(&args)
            .current_dir(&tmp_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .map_err(|e| format!("Failed to spawn agent: {}", e))?;
        if !agent_output.status.success() {
            tracing::warn!("Conflict resolution agent exited with non-zero: {}",
                String::from_utf8_lossy(&agent_output.stderr).trim());
        }

        let _ = git_service::stage_all(&tmp_path);
        let remaining = git_service::list_unmerged_files(&tmp_path).unwrap_or_default();
        if !remaining.is_empty() {
            let _ = git_service::abort_merge(&tmp_path);
            return Ok(MergeResult {
                success: false,
                conflicted_files: remaining,
                message: "Agent could not resolve all conflicts".to_string(),
            });
        }

        let _ = git_service::commit(&tmp_path, "resolve merge conflicts")
            .map_err(|e| format!("Failed to commit resolution: {}", e))?;

        // Fetch the resolved branch into a temp ref in the main repo (imports objects),
        // then update-ref the real branch. refs/forge-tmp/* is never checked out.
        let tmp_ref = format!("refs/forge-tmp/{}", target_branch.replace('/', "_"));
        let fetch_refspec = format!("refs/heads/{}:{}", target_branch, tmp_ref);
        let fetch_back = std::process::Command::new("git")
            .args(["-C", &main_repo, "fetch", &tmp_path, &fetch_refspec])
            .output()
            .map_err(|e| e.to_string())?;
        if !fetch_back.status.success() {
            return Err(format!("fetch objects failed: {}", String::from_utf8_lossy(&fetch_back.stderr).trim()));
        }
        let target_ref = format!("refs/heads/{}", target_branch);
        let update_out = std::process::Command::new("git")
            .args(["-C", &main_repo, "update-ref", &target_ref, &tmp_ref])
            .output()
            .map_err(|e| e.to_string())?;
        let _ = std::process::Command::new("git")
            .args(["-C", &main_repo, "update-ref", "-d", &tmp_ref])
            .output();
        if !update_out.status.success() {
            return Err(format!("update-ref failed: {}", String::from_utf8_lossy(&update_out.stderr).trim()));
        }

        if push_to_remote {
            git_service::push_branch_cli(&main_repo, &target_branch2)
                .map_err(|e| format!("Failed to push: {}", e))?;
        }
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
