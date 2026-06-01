use anyhow::{Context, Result};
use std::collections::HashMap;
use std::sync::Arc;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, oneshot};
use chrono::Utc;
use serde::Serialize;
use serde_json;

use crate::providers;
use crate::state::RunningAgent;
/// Event payloads emitted to the frontend
#[derive(Clone, Serialize)]
pub struct AgentOutputEvent {
    pub workspace_id: String,
    pub session_id: String,
    pub stream: String,   // "stdout" | "stderr" | "system"
    pub content: String,
}

#[derive(Clone, Serialize)]
pub struct AgentStatusEvent {
    pub workspace_id: String,
    pub session_id: String,
    pub status: String,   // "running" | "done" | "error" | "stopped"
    pub exit_code: Option<i32>,
}

/// Spawn an agent process and stream its output to the frontend via Tauri events.
/// Returns a cancel sender — dropping it or sending () stops the process.
pub async fn run(
    app: AppHandle,
    db: SqlitePool,
    workspace_id: String,
    session_id: String,
    provider_id: String,
    provider_options: HashMap<String, String>,
    prompt: String,
    worktree_path: String,
    shell_env: HashMap<String, String>,
    running_agents: Arc<Mutex<HashMap<String, RunningAgent>>>,
) -> Result<oneshot::Sender<()>> {
    let provider = providers::get_provider(&provider_id)
        .with_context(|| format!("Unknown provider: {}", provider_id))?;

    let (binary, args) = provider.build_command(&prompt, &worktree_path, &provider_options);
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    // Emit "running" status immediately
    let _ = app.emit("agent:status", AgentStatusEvent {
        workspace_id: workspace_id.clone(),
        session_id: session_id.clone(),
        status: "running".to_string(),
        exit_code: None,
    });

    // Persist session start
    let now = Utc::now().naive_utc();
    sqlx::query!(
        "INSERT INTO sessions (id, workspace_id, prompt, created_at) VALUES (?, ?, ?, ?)",
        session_id, workspace_id, prompt, now
    )
    .execute(&db)
    .await?;

    // Update workspace status -> running
    sqlx::query!(
        "UPDATE workspaces SET status = 'running' WHERE id = ?",
        workspace_id
    )
    .execute(&db)
    .await?;

    // Spawn the async task
    tokio::spawn(async move {
        let result = spawn_streaming(
            app.clone(),
            db.clone(),
            workspace_id.clone(),
            session_id.clone(),
            binary,
            args,
            worktree_path,
            shell_env,
            cancel_rx,
            "[Forge]",
        )
        .await;

        let (final_status, exit_code) = match result {
            Ok(code) => {
                if code == 0 {
                    ("done".to_string(), Some(code))
                } else {
                    ("error".to_string(), Some(code))
                }
            }
            Err(ref e) => {
                tracing::error!("Agent runner error: {}", e);
                ("error".to_string(), None)
            }
        };

        // Emit final status
        let _ = app.emit("agent:status", AgentStatusEvent {
            workspace_id: workspace_id.clone(),
            session_id: session_id.clone(),
            status: final_status.clone(),
            exit_code,
        });

        // Persist session end
        let finished = Utc::now().naive_utc();
        let code_i64 = exit_code.map(|c| c as i64);
        let _ = sqlx::query!(
            "UPDATE sessions SET finished_at = ?, exit_code = ? WHERE id = ?",
            finished, code_i64, session_id
        )
        .execute(&db)
        .await;

        // Update workspace status
        let _ = sqlx::query!(
            "UPDATE workspaces SET status = ? WHERE id = ?",
            final_status, workspace_id
        )
        .execute(&db)
        .await;

        // Emit workspace updated event
        if let Ok(ws) = sqlx::query!(
            "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at FROM workspaces WHERE id = ?",
            workspace_id
        )
        .fetch_one(&db)
        .await {
            let _ = app.emit("workspace:status", serde_json::json!({
                "id": ws.id,
                "status": ws.status,
            }));
        }

        // Remove from running agents map so the workspace can be reused
        running_agents.lock().await.remove(&workspace_id);
    });

    Ok(cancel_tx)
}

/// Shared spawn-and-stream logic, reused by both agent runner and provider installer.
/// Returns the exit code on success, or an error if spawn/wait fails.
pub async fn spawn_streaming(
    app: AppHandle,
    db: SqlitePool,
    workspace_id: String,
    session_id: String,
    binary: String,
    args: Vec<String>,
    worktree_path: String,
    shell_env: HashMap<String, String>,
    cancel_rx: oneshot::Receiver<()>,
    log_prefix: &str,
) -> Result<i32> {
    let worktree_dir = std::path::Path::new(&worktree_path);
    if !worktree_dir.exists() {
        return Err(anyhow::anyhow!(
            "Working directory does not exist: {}",
            worktree_path
        ));
    }

    let path_env = shell_env.get("PATH").cloned().unwrap_or_default();
    let resolved = providers::resolve_binary_path(&binary, &path_env)
        .ok_or_else(|| anyhow::anyhow!(
            "{} CLI `{}` not found on PATH. Install it from the providers panel.",
            log_prefix, binary
        ))?;

    let full_cmd = format!("{} {}", resolved, args.join(" "));
    tracing::info!("Spawning: {} in {}", full_cmd, worktree_path);

    emit_line(
        &app, &db, &workspace_id, &session_id, "system",
        &format!("{} Running: {}", log_prefix, full_cmd),
    ).await;

    let mut cmd = Command::new(&resolved);
    cmd.args(&args)
       .current_dir(&worktree_path)
       .envs(&shell_env)
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped())
       .kill_on_drop(true);

    // Process group: child becomes leader of its own pgroup so we can killpg on cancel.
    // On unix, setpgid(0,0) runs in the forked child between fork() and exec().
    // On Windows, kill_on_drop is all we have for now.
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setpgid(0, 0);
            Ok(())
        });
    }
    // TODO Windows: wrap in JobObject with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE

    let mut child = cmd.spawn()
        .with_context(|| {
            let io_err = std::io::Error::last_os_error();
            format!(
                "Failed to spawn `{}`.\nResolved path: {}\nOS Error: {}\nPATH: {}",
                binary, resolved, io_err, path_env
            )
        })?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = BufReader::new(stderr).lines();
    let mut cancel_rx = cancel_rx;

    loop {
        tokio::select! {
            _ = &mut cancel_rx => {
                // Kill the entire process group on cancel
                #[cfg(unix)]
                {
                    if let Some(pid) = child.id() {
                        let _ = nix::sys::signal::killpg(
                            nix::unistd::Pid::from_raw(pid as i32),
                            nix::sys::signal::Signal::SIGKILL,
                        );
                    }
                }
                #[cfg(not(unix))]
                {
                    let _ = child.kill().await;
                }
                emit_line(&app, &db, &workspace_id, &session_id, "system",
                    &format!("{} Stopped by user.", log_prefix)).await;
                return Ok(-1);
            }

            line = stdout_lines.next_line() => {
                match line {
                    Ok(Some(content)) => {
                        emit_line(&app, &db, &workspace_id, &session_id,
                            "stdout", &content).await;
                    }
                    Ok(None) => break,
                    Err(e) => {
                        tracing::warn!("stdout read error: {}", e);
                        break;
                    }
                }
            }

            line = stderr_lines.next_line() => {
                match line {
                    Ok(Some(content)) => {
                        emit_line(&app, &db, &workspace_id, &session_id,
                            "stderr", &content).await;
                    }
                    Ok(None) => {}
                    Err(e) => {
                        tracing::warn!("stderr read error: {}", e);
                    }
                }
            }
        }
    }

    // Drain any remaining stderr after stdout EOF
    while let Ok(Some(content)) = stderr_lines.next_line().await {
        emit_line(&app, &db, &workspace_id, &session_id, "stderr", &content).await;
    }

    let status = child.wait().await.context("Failed to wait for child process")?;
    let code = status.code().unwrap_or(-1);

    emit_line(
        &app, &db, &workspace_id, &session_id, "system",
        &format!("{} Process exited with code {}", log_prefix, code),
    ).await;

    Ok(code)
}

/// Emit a line to the frontend and persist it to the DB.
pub async fn emit_line(
    app: &AppHandle,
    db: &SqlitePool,
    workspace_id: &str,
    session_id: &str,
    stream: &str,
    content: &str,
) {
    let _ = app.emit("agent:output", AgentOutputEvent {
        workspace_id: workspace_id.to_string(),
        session_id:   session_id.to_string(),
        stream:       stream.to_string(),
        content:      content.to_string(),
    });

    let now = Utc::now().naive_utc();
    let _ = sqlx::query!(
        "INSERT INTO output_lines (session_id, stream, content, created_at) VALUES (?, ?, ?, ?)",
        session_id, stream, content, now
    )
    .execute(db)
    .await;
}
