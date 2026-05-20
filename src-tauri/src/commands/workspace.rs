use tauri::{AppHandle, Emitter, State};
use crate::state::{AppState, AgentHandle};
use crate::db::schema::{Workspace, Repository};
use crate::services::{git_service, workspace_service};
use serde::{Deserialize, Serialize};
use crate::agent_runner;

#[derive(Deserialize)]
pub struct CreateWorkspaceRequest {
    pub repo_id: String,
    pub provider: String,
}

#[derive(Serialize)]
pub struct WorkspaceDetail {
    pub workspace: Workspace,
    pub repo: Repository,
}

#[tauri::command]
pub fn ping() -> String {
    "pong from Forge backend".to_string()
}

#[tauri::command]
pub async fn list_providers(
    _state: State<'_, AppState>,
) -> Result<Vec<crate::commands::workspace::ProviderInfoDto>, String> {
    use crate::providers;
    let providers = providers::all_providers()
        .into_iter()
        .map(|p| {
            let info = p.info();
            ProviderInfoDto {
                id: info.id.to_string(),
                display_name: info.display_name.to_string(),
                cli_binary: info.cli_binary.to_string(),
                description: info.description.to_string(),
                available: p.is_available(),
            }
        })
        .collect();
    Ok(providers)
}

#[derive(Serialize)]
pub struct ProviderInfoDto {
    pub id: String,
    pub display_name: String,
    pub cli_binary: String,
    pub description: String,
    pub available: bool,
}

#[tauri::command]
pub async fn list_repositories(
    state: State<'_, AppState>,
) -> Result<Vec<Repository>, String> {
    sqlx::query_as!(
        Repository,
        "SELECT * FROM repositories ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_workspaces(
    state: State<'_, AppState>,
    repo_id: Option<String>,
) -> Result<Vec<Workspace>, String> {
    match repo_id {
        Some(rid) => sqlx::query_as!(
            Workspace,
            "SELECT * FROM workspaces WHERE repo_id = ? AND archived_at IS NULL ORDER BY created_at DESC",
            rid
        )
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string()),

        None => sqlx::query_as!(
            Workspace,
            "SELECT * FROM workspaces WHERE archived_at IS NULL ORDER BY created_at DESC"
        )
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn create_workspace(
    app:   AppHandle,
    state: State<'_, AppState>,
    req:   CreateWorkspaceRequest,
) -> Result<Workspace, String> {
    let repo = sqlx::query_as!(
        Repository,
        "SELECT * FROM repositories WHERE id = ?",
        req.repo_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| format!("Repo not found: {}", e))?;

    let provider = crate::providers::get_provider(&req.provider)
        .ok_or_else(|| format!("Unknown provider: {}", req.provider))?;
    if !provider.is_available_in_shell(&state.shell_path) {
        return Err(format!(
            "'{}' CLI not found. Install it or choose another provider.",
            provider.info().cli_binary
        ));
    }

    let worktree_base = format!("{}/.forge-worktrees", repo.local_path);
    std::fs::create_dir_all(&worktree_base).map_err(|e| e.to_string())?;

    let workspace = workspace_service::create_workspace(
        &state.db,
        &req.repo_id,
        &req.provider,
        &worktree_base,
    )
    .await
    .map_err(|e| e.to_string())?;

    let repo_path     = repo.local_path.clone();
    let worktree_path = workspace.worktree_path.clone();
    let branch        = workspace.branch.clone();

    tokio::task::spawn_blocking(move || {
        git_service::add_worktree(&repo_path, &worktree_path, &branch)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Git worktree error: {}", e))?;

    let _ = app.emit("workspace:created", &workspace);

    Ok(workspace)
}

#[tauri::command]
pub async fn archive_workspace(
    app:          AppHandle,
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    workspace_service::archive_workspace(&state.db, &workspace_id)
        .await
        .map_err(|e| e.to_string())?;
    let _ = app.emit("workspace:updated", workspace_id);
    Ok(())
}

#[tauri::command]
pub async fn delete_workspace(
    app:          AppHandle,
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    let ws = sqlx::query_as!(
        Workspace,
        "SELECT * FROM workspaces WHERE id = ?",
        workspace_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let repo = sqlx::query_as!(
        Repository,
        "SELECT * FROM repositories WHERE id = ?",
        ws.repo_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let repo_path     = repo.local_path.clone();
    let worktree_path = ws.worktree_path.clone();

    tokio::task::spawn_blocking(move || {
        git_service::remove_worktree(&repo_path, &worktree_path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Git worktree remove error: {}", e))?;

    workspace_service::delete_workspace_record(&state.db, &workspace_id)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("workspace:updated", workspace_id);
    Ok(())
}

#[tauri::command]
pub async fn list_archived_workspaces(
    state: State<'_, AppState>,
    repo_id: Option<String>,
) -> Result<Vec<Workspace>, String> {
    match repo_id {
        Some(rid) => sqlx::query_as!(
            Workspace,
            "SELECT * FROM workspaces WHERE repo_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC",
            rid
        )
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string()),

        None => sqlx::query_as!(
            Workspace,
            "SELECT * FROM workspaces WHERE archived_at IS NOT NULL ORDER BY archived_at DESC"
        )
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn restore_workspace(
    app:          AppHandle,
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    sqlx::query!(
        "UPDATE workspaces SET status = 'idle', archived_at = NULL WHERE id = ?",
        workspace_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;
    let _ = app.emit("workspace:updated", workspace_id);
    Ok(())
}

// ── Agent commands ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RunAgentRequest {
    pub workspace_id: String,
    pub prompt: String,
}

/// Start an agent in a workspace
#[tauri::command]
pub async fn run_agent(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    request: RunAgentRequest,
) -> Result<String, String> {
    let ws = sqlx::query_as!(
        Workspace,
        "SELECT * FROM workspaces WHERE id = ?",
        request.workspace_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    // Reject if already running
    {
        let mut agents = state.running_agents.lock().await;
        if agents.contains_key(&request.workspace_id) {
            return Err("An agent is already running in this workspace".to_string());
        }
        // Insert placeholder to prevent race condition during setup
        agents.insert(
            request.workspace_id.clone(),
            crate::state::RunningAgent {
                workspace_id: request.workspace_id.clone(),
                session_id: "starting".to_string(),
                provider_id: ws.provider.clone(),
                handle: AgentHandle { cancel_tx: None },
            },
        );
    }

    // Helper to cleanup on error
    let cleanup = || async {
        state.running_agents.lock().await.remove(&request.workspace_id);
    };

    if ws.status == "archived" {
        cleanup().await;
        return Err("Cannot run agent in archived workspace".to_string());
    }

    // Ensure the worktree directory exists, repair if needed
    let repo = match sqlx::query_as!(
        Repository,
        "SELECT * FROM repositories WHERE id = ?",
        ws.repo_id
    )
    .fetch_one(&state.db)
    .await {
        Ok(r) => r,
        Err(e) => {
            cleanup().await;
            return Err(format!("Repo not found for workspace: {}", e));
        }
    };

    let repo_path = repo.local_path.clone();
    let worktree_path = ws.worktree_path.clone();
    let branch = ws.branch.clone();

    let ensure_res = tokio::task::spawn_blocking(move || {
        git_service::ensure_worktree(&repo_path, &worktree_path, &branch)
    })
    .await;

    if let Err(e) = ensure_res.map_err(|e| e.to_string()).and_then(|r| r.map_err(|e| e.to_string())) {
        cleanup().await;
        return Err(format!("Failed to ensure workspace directory: {}", e));
    }

    // Check that the provider's CLI is available (using resolved shell PATH)
    let provider = match crate::providers::get_provider(&ws.provider) {
        Some(p) => p,
        None => {
            cleanup().await;
            return Err(format!("Unknown provider: {}", ws.provider));
        }
    };

    if !provider.is_available_in_shell(&state.shell_path) {
        cleanup().await;
        return Err(format!(
            "'{}' CLI not found. Install it or choose another provider.",
            provider.info().cli_binary
        ));
    }

    let session_id = uuid::Uuid::new_v4().to_string();

    let run_res = agent_runner::run(
        app,
        state.db.clone(),
        request.workspace_id.clone(),
        session_id.clone(),
        ws.provider.clone(),
        request.prompt,
        ws.worktree_path.clone(),
        state.shell_path.clone(),
    )
    .await;

    match run_res {
        Ok(cancel_tx) => {
            // Update the real agent handle
            let mut agents = state.running_agents.lock().await;
            if let Some(agent) = agents.get_mut(&request.workspace_id) {
                agent.session_id = session_id.clone();
                agent.handle.cancel_tx = Some(cancel_tx);
            }
            Ok(session_id)
        }
        Err(e) => {
            cleanup().await;
            Err(e.to_string())
        }
    }
}

/// Stop a running agent
#[tauri::command]
pub async fn stop_agent(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    let mut agents = state.running_agents.lock().await;
    if let Some(mut agent) = agents.remove(&workspace_id) {
        // Drop the cancel_tx to signal the runner to stop
        let _ = agent.handle.cancel_tx.take();
        Ok(())
    } else {
        Err("No running agent found for this workspace".to_string())
    }
}

/// Returns the resolved shell PATH
#[tauri::command]
pub fn get_resolved_path(state: State<'_, AppState>) -> String {
    state.shell_path.clone()
}

/// Debug command: shows shell_path, system PATH, and which output for all agents
#[tauri::command]
pub fn debug_path(state: State<'_, AppState>) -> serde_json::Value {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let binaries = ["gemini", "claude", "codex"];
    let which_results: serde_json::Map<String, serde_json::Value> = binaries.iter().map(|bin| {
        let result = std::process::Command::new(&shell)
            .args(["-c", &format!("which {}", bin)])
            .env("PATH", &state.shell_path)
            .output();
        let output = match result {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
                serde_json::json!({
                    "found": o.status.success(),
                    "path": stdout,
                    "stderr": stderr,
                    "exit_code": o.status.code(),
                })
            }
            Err(e) => serde_json::json!({
                "found": false,
                "error": e.to_string(),
            }),
        };
        (bin.to_string(), output)
    }).collect();

    serde_json::json!({
        "shell": shell,
        "shell_path": state.shell_path,
        "system_path": std::env::var("PATH").unwrap_or_default(),
        "binaries": which_results,
    })
}

/// Get all output lines for a session (for loading history)
#[tauri::command]
pub async fn get_session_output(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<crate::db::schema::OutputLine>, String> {
    sqlx::query_as!(
        crate::db::schema::OutputLine,
        "SELECT * FROM output_lines WHERE session_id = ? ORDER BY id ASC",
        session_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())
}

/// Get the most recent session for a workspace
#[tauri::command]
pub async fn get_latest_session(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<crate::db::schema::Session>, String> {
    sqlx::query_as!(
        crate::db::schema::Session,
        "SELECT * FROM sessions WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1",
        workspace_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())
}

/// List all running agent statuses
#[tauri::command]
pub async fn list_running_agents(
    state: State<'_, AppState>,
) -> Result<Vec<crate::state::AgentStatusSnapshot>, String> {
    let agents = state.running_agents.lock().await;
    Ok(agents.values().map(|a| crate::state::AgentStatusSnapshot {
        workspace_id: a.workspace_id.clone(),
        session_id: a.session_id.clone(),
        provider_id: a.provider_id.clone(),
    }).collect())
}
