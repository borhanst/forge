use anyhow::{Context, Result};
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;
use chrono::Utc;
use serde::Serialize;

use crate::providers;

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
    prompt: String,
    worktree_path: String,
    shell_path: String,
) -> Result<oneshot::Sender<()>> {
    let provider = providers::get_provider(&provider_id)
        .with_context(|| format!("Unknown provider: {}", provider_id))?;

    let (binary, args) = provider.build_command(&prompt, &worktree_path);
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
        let result = run_inner(
            app.clone(),
            db.clone(),
            workspace_id.clone(),
            session_id.clone(),
            binary,
            args,
            worktree_path,
            shell_path,
            cancel_rx,
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
            "SELECT * FROM workspaces WHERE id = ?",
            workspace_id
        )
        .fetch_one(&db)
        .await {
            let _ = app.emit("workspace:status", serde_json::json!({
                "id": ws.id,
                "status": ws.status,
            }));
        }
    });

    Ok(cancel_tx)
}

async fn run_inner(
    app: AppHandle,
    db: SqlitePool,
    workspace_id: String,
    session_id: String,
    binary: String,
    args: Vec<String>,
    worktree_path: String,
    shell_path: String,
    cancel_rx: oneshot::Receiver<()>,
) -> Result<i32> {
    let shell = std::env::var("SHELL")
        .unwrap_or_else(|_| "/bin/bash".to_string());

    // Build a single shell command string.
    let args_escaped = args
        .iter()
        .map(|a| shell_quote(a))
        .collect::<Vec<_>>()
        .join(" ");

    let full_cmd = if args_escaped.is_empty() {
        binary.clone()
    } else {
        format!("{} {}", binary, args_escaped)
    };

    // Ensure the worktree directory exists
    let worktree_dir = std::path::Path::new(&worktree_path);
    if !worktree_dir.exists() {
        return Err(anyhow::anyhow!(
            "Working directory does not exist: {}",
            worktree_path
        ));
    }

    tracing::info!("Spawning via shell: {} -l -c \"{}\" in {}", shell, full_cmd, worktree_path);

    emit_line(
        &app, &db, &workspace_id, &session_id, "system",
        &format!("[Forge] Running: {}", full_cmd),
    ).await;

    // Use login shell (-l) to ensure we pick up the user's full environment (nvm, path, etc.)
    // Note: Some shells might behave differently with -l and -c. 
    // Usually `shell -l -c "command"` works for bash/zsh.
    let mut child = Command::new(&shell)
        .arg("-l")
        .arg("-c")
        .arg(&full_cmd)
        .current_dir(&worktree_path)
        .env("PATH", &shell_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .with_context(|| {
            let io_err = std::io::Error::last_os_error();
            format!(
                "Failed to spawn agent process.\nBinary: {}\nShell: {}\nArgs: -l -c \"{}\"\nWorkdir: {}\nOS Error: {}\nPATH: {}",
                binary, shell, full_cmd, worktree_path, io_err, shell_path
            )
        })?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = BufReader::new(stderr).lines();
    let mut cancel_rx = cancel_rx;

    loop {
        tokio::select! {
            // Cancel signal from stop_agent command
            _ = &mut cancel_rx => {
                let _ = child.kill().await;
                emit_line(&app, &db, &workspace_id, &session_id, "system",
                    "[Forge] Agent stopped by user.").await;
                return Ok(-1);
            }

            // stdout line
            line = stdout_lines.next_line() => {
                match line {
                    Ok(Some(content)) => {
                        emit_line(&app, &db, &workspace_id, &session_id,
                            "stdout", &content).await;
                    }
                    Ok(None) => break,   // EOF — process finished
                    Err(e) => {
                        tracing::warn!("stdout read error: {}", e);
                        break;
                    }
                }
            }

            // stderr line
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
        &format!("[Forge] Process exited with code {}", code),
    ).await;

    Ok(code)
}

/// Emit a line to the frontend and persist it to the DB.
async fn emit_line(
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

/// Safely single-quote a shell argument.
/// Wraps in single quotes and escapes any single quotes inside the value.
/// e.g.  it's fine  →  'it'"'"'s fine'
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}