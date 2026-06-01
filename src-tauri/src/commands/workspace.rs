use tauri::{AppHandle, Emitter, State};
use crate::state::{AppState, AgentHandle};
use crate::db::schema::{Workspace, Repository};
use crate::services::{git_service, workspace_service};
use serde::{Deserialize, Serialize};
use crate::agent_runner;
use chrono::Utc;
use tokio::io::AsyncBufReadExt;

#[derive(Deserialize)]
pub struct CreateWorkspaceRequest {
    pub repo_id: String,
    pub provider: String,
    pub provider_config: Option<std::collections::HashMap<String, String>>,
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
    state: State<'_, AppState>,
) -> Result<Vec<crate::commands::workspace::ProviderInfoDto>, String> {
    use crate::providers;
    let shell_path = state.shell_path().clone();
    let providers = providers::all_providers()
        .into_iter()
        .map(|p| {
            let info = p.info();
            ProviderInfoDto {
                id: info.id.to_string(),
                display_name: info.display_name.to_string(),
                cli_binary: info.cli_binary.to_string(),
                description: info.description.to_string(),
                available: p.is_available_in_shell(&shell_path),
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
            "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE repo_id = ? AND archived_at IS NULL ORDER BY created_at DESC",
            rid
        )
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string()),

        None => sqlx::query_as!(
            Workspace,
            "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE archived_at IS NULL ORDER BY created_at DESC"
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
    if !provider.is_available_in_shell(&state.shell_path()) {
        return Err(format!(
            "'{}' CLI not found. Install it or choose another provider.",
            provider.info().cli_binary
        ));
    }

    // Worktrees live outside the main repo to prevent agents from
    // accidentally resolving the main repo root by walking up directories.
    let worktree_base = format!("{}/worktrees/{}", state.app_data_dir, repo.id);
    std::fs::create_dir_all(&worktree_base).map_err(|e| e.to_string())?;

    let provider_config_json = req.provider_config.as_ref().map(|cfg| {
        serde_json::to_string(cfg).unwrap_or_default()
    });

    let workspace = workspace_service::create_workspace(
        &state.db,
        &req.repo_id,
        &req.provider,
        provider_config_json.as_deref(),
        &worktree_base,
    )
    .await
    .map_err(|e| e.to_string())?;

    let repo_path     = repo.local_path.clone();
    let worktree_path = workspace.worktree_path.clone();
    let branch        = workspace.branch.clone();
    let remote_url    = repo.github_url.clone();

    // Create a standalone worktree repo via `git clone --shared`.
    // This avoids git's linked worktree mechanism entirely — no stale metadata,
    // no `.git` symlink confusion, no duplicate worktree entries.
    tokio::task::spawn_blocking({
        let rp = repo_path.clone();
        let wp = worktree_path.clone();
        let br = branch.clone();
        let url = remote_url.clone();
        move || git_service::clone_shared_worktree(&rp, &wp, &br, url.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("Failed to create worktree: {}", e))?;

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
        "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE id = ?",
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
            "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE repo_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC",
            rid
        )
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string()),

        None => sqlx::query_as!(
            Workspace,
            "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE archived_at IS NOT NULL ORDER BY archived_at DESC"
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

#[tauri::command]
pub async fn update_workspace_provider(
    app:          AppHandle,
    state:        State<'_, AppState>,
    workspace_id: String,
    provider:     String,
) -> Result<(), String> {
    // 1. Verify provider exists
    let p = crate::providers::get_provider(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;
    
    // 2. Verify CLI is available
    if !p.is_available_in_shell(&state.shell_path()) {
        return Err(format!(
            "'{}' CLI not found. Install it before switching.",
            p.info().cli_binary
        ));
    }

    // 3. Update DB
    sqlx::query!(
        "UPDATE workspaces SET provider = ? WHERE id = ?",
        provider, workspace_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let _ = app.emit("workspace:updated", workspace_id);
    Ok(())
}

#[tauri::command]
pub async fn update_workspace_config(
    app:          AppHandle,
    state:        State<'_, AppState>,
    workspace_id: String,
    config:       std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    sqlx::query!(
        "UPDATE workspaces SET provider_config = ? WHERE id = ?",
        json, workspace_id
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
        "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE id = ?",
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

    let repo_path_main = repo.local_path.clone();
    let worktree_path = ws.worktree_path.clone();
    let branch = ws.branch.clone();
    let remote_url = repo.github_url.clone();

    // Ensure the worktree is a standalone git repo.
    // For new workspaces: `clone_shared_worktree` creates via `git clone --shared`.
    // For legacy linked worktrees: fall back to `ensure_worktree_as_bare_repo`.
    {
        let git_path = std::path::Path::new(&worktree_path).join(".git");
        let is_linked = git_path.is_file();

        let setup_res = if is_linked {
            // Legacy: convert linked worktree to standalone
            tokio::task::spawn_blocking({
                let wp = worktree_path.clone();
                let rp = repo_path_main.clone();
                let url = remote_url.clone();
                let br = branch.clone();
                move || git_service::ensure_worktree_as_bare_repo(&wp, &rp, url.as_deref(), &br)
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())
        } else {
            // New path or already standalone: use clone-based approach
            tokio::task::spawn_blocking({
                let rp = repo_path_main.clone();
                let wp = worktree_path.clone();
                let br = branch.clone();
                let url = remote_url.clone();
                move || git_service::clone_shared_worktree(&rp, &wp, &br, url.as_deref())
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())
        };

        if let Err(e) = setup_res {
            cleanup().await;
            return Err(format!("Failed to setup worktree: {}", e));
        }
    }

    // Check that the provider's CLI is available (using resolved shell PATH)
    let provider = match crate::providers::get_provider(&ws.provider) {
        Some(p) => p,
        None => {
            cleanup().await;
            return Err(format!("Unknown provider: {}", ws.provider));
        }
    };

    if !provider.is_available_in_shell(&state.shell_path()) {
        cleanup().await;
        return Err(format!(
            "'{}' CLI not found. Install it or choose another provider.",
            provider.info().cli_binary
        ));
    }

    let session_id = uuid::Uuid::new_v4().to_string();

    let provider_options: std::collections::HashMap<String, String> = ws
        .provider_config
        .as_deref()
        .and_then(|cfg| serde_json::from_str(cfg).ok())
        .unwrap_or_default();

    // Run the agent in the standalone worktree repo so all file writes and
    // git operations resolve to the worktree, not the main repo.
    let agent_work_dir = ws.worktree_path.clone();

    let run_res = agent_runner::run(
        app,
        state.db.clone(),
        request.workspace_id.clone(),
        session_id.clone(),
        ws.provider.clone(),
        provider_options,
        request.prompt,
        agent_work_dir,
        state.shell_env.clone(),
        state.running_agents.clone(),
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
    state.shell_path().clone()
}

/// Debug command: shows shell_path, system PATH, and which output for all agents
#[tauri::command]
pub fn debug_path(state: State<'_, AppState>) -> serde_json::Value {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let binaries = ["gemini", "claude", "codex", "opencode", "openclaude"];
    let which_results: serde_json::Map<String, serde_json::Value> = binaries.iter().map(|bin| {
        let result = std::process::Command::new(&shell)
            .args(["-c", &format!("which {}", bin)])
            .env("PATH", &state.shell_path())
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
        "shell_path": state.shell_path(),
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

// ── Provider install commands ──────────────────────────────────────────────────

fn needs_sudo_for_npm(env: &std::collections::HashMap<String, String>) -> bool {
    let out = std::process::Command::new("npm")
        .args(["config", "get", "prefix"])
        .envs(env)
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let prefix = String::from_utf8_lossy(&o.stdout).trim().to_string();
            prefix == "/usr/local"
                || prefix == "/usr"
                || prefix.starts_with("/opt/homebrew")
        }
        _ => false,
    }
}

/// Install a provider's CLI. Tries each install option in order, stops at first success.
/// Streams output to the frontend with an [Install] prefix.
#[tauri::command]
pub async fn install_provider(
    app: AppHandle,
    state: State<'_, AppState>,
    provider_id: String,
) -> Result<(), String> {
    use crate::providers;

    let provider = providers::get_provider(&provider_id)
        .ok_or_else(|| format!("Unknown provider: {}", provider_id))?;

    let options = provider.install_options();
    if options.is_empty() {
        return Err(format!(
            "{} has no automated install options.",
            provider.info().display_name
        ));
    }

    let needs_sudo = needs_sudo_for_npm(&state.shell_env);

    // Use a synthetic workspace/session so install output streams into the terminal pane
    let workspace_id = format!("__install_{}", provider_id);
    let session_id = format!(
        "__install_{}_{}",
        provider_id,
        Utc::now().timestamp()
    );

    let mut last_err: Option<String> = None;
    for (i, argv) in options.iter().enumerate() {
        let full_argv: Vec<String> = if needs_sudo {
            std::iter::once("sudo".to_string())
                .chain(std::iter::once("-n".to_string()))
                .chain(argv.iter().cloned())
                .collect()
        } else {
            argv.clone()
        };

        crate::agent_runner::emit_line(
            &app, &state.db, &workspace_id, &session_id, "system",
            &format!(
                "[Install] Attempt {}/{}: {}",
                i + 1,
                options.len(),
                full_argv.join(" ")
            ),
        ).await;

        // Resolve the binary and spawn directly (cancel_rx not needed for install)
        let path_env = state.shell_env.get("PATH").cloned().unwrap_or_default();
        let resolved = providers::resolve_binary_path(&full_argv[0], &path_env)
            .ok_or_else(|| format!(
                "Could not find `{}` on PATH. Is npm installed?",
                full_argv[0]
            ))?;

        let mut cmd = tokio::process::Command::new(&resolved);
        cmd.args(&full_argv[1..])
           .current_dir(".")
           .envs(&state.shell_env)
           .stdout(std::process::Stdio::piped())
           .stderr(std::process::Stdio::piped())
           .kill_on_drop(true);

        #[cfg(unix)]
        unsafe {
            cmd.pre_exec(|| {
                libc::setpgid(0, 0);
                Ok(())
            });
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                last_err = Some(e.to_string());
                continue;
            }
        };

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let mut stdout_lines = tokio::io::BufReader::new(stdout).lines();
        let mut stderr_lines = tokio::io::BufReader::new(stderr).lines();

        let _code = loop {
            tokio::select! {
                line = stdout_lines.next_line() => {
                    match line {
                        Ok(Some(content)) => {
                            crate::agent_runner::emit_line(
                                &app, &state.db, &workspace_id, &session_id,
                                "stdout", &content,
                            ).await;
                        }
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
                line = stderr_lines.next_line() => {
                    match line {
                        Ok(Some(content)) => {
                            crate::agent_runner::emit_line(
                                &app, &state.db, &workspace_id, &session_id,
                                "stderr", &content,
                            ).await;
                        }
                        Ok(None) => {}
                        Err(_) => {}
                    }
                }
            }
        };

        while let Ok(Some(content)) = stderr_lines.next_line().await {
            crate::agent_runner::emit_line(
                &app, &state.db, &workspace_id, &session_id,
                "stderr", &content,
            ).await;
        }

        match child.wait().await {
            Ok(status) => {
                let exit_code = status.code().unwrap_or(-1);
                if exit_code == 0 {
                    crate::agent_runner::emit_line(
                        &app, &state.db, &workspace_id, &session_id, "system",
                        &format!("[Install] {} installed successfully.", provider.info().display_name),
                    ).await;
                    let _ = app.emit("providers:refresh", ());
                    return Ok(());
                }
                last_err = Some(format!("exit code {}", exit_code));
            }
            Err(e) => {
                last_err = Some(e.to_string());
            }
        }
    }

    let hint = if needs_sudo {
        "Sudo may be required. Try running the install command manually in your terminal."
    } else {
        "Make sure Node.js is installed: https://nodejs.org"
    };
    Err(format!(
        "All install attempts for {} failed ({}). {}",
        provider.info().display_name,
        last_err.unwrap_or_default(),
        hint
    ))
}


