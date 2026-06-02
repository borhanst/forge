use anyhow::{Context, Result};
use base64::Engine;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const SCROLLBACK_CAP: usize = 64 * 1024;
const READ_CHUNK: usize = 4096;

#[derive(Clone, Serialize)]
pub struct TerminalDataEvent {
    pub workspace_id: String,
    pub data_b64: String,
}

#[derive(Clone, Serialize)]
pub struct TerminalExitEvent {
    pub workspace_id: String,
    pub exit_code: Option<i32>,
}

#[derive(Serialize)]
pub struct TerminalAttachInfo {
    pub workspace_id: String,
    pub scrollback_b64: String,
    pub is_running: bool,
}

pub struct TerminalSession {
    /// Workspace this session is tied to. Diagnostic only.
    #[allow(dead_code)]
    pub workspace_id: String,
    pub writer: Mutex<Box<dyn Write + Send>>,
    pub master: Box<dyn MasterPty + Send>,
    pub pid: Option<u32>,
    /// Current PTY size in columns. Read by the attach endpoint.
    #[allow(dead_code)]
    pub cols: u16,
    /// Current PTY size in rows. Read by the attach endpoint.
    #[allow(dead_code)]
    pub rows: u16,
    /// Std mutex (not tokio): the protected section is a small VecDeque
    /// append/drain, so blocking is fine and avoids the Send-bound issues
    /// that come from holding a tokio mutex inside an async critical section.
    pub scrollback: std::sync::Mutex<VecDeque<u8>>,
    pub running: std::sync::atomic::AtomicBool,
}

fn b64_engine() -> base64::engine::general_purpose::GeneralPurpose {
    base64::engine::general_purpose::STANDARD
}

fn encode_b64(bytes: &[u8]) -> String {
    b64_engine().encode(bytes)
}

/// Resolve the shell to spawn. Unix: $SHELL with -l. Windows: %COMSPEC% or cmd.exe.
fn build_shell_command(shell_env: &std::collections::HashMap<String, String>) -> CommandBuilder {
    #[cfg(windows)]
    let (shell, login_args): (String, Vec<String>) = {
        let s = shell_env
            .get("COMSPEC")
            .cloned()
            .or_else(|| std::env::var("COMSPEC").ok())
            .unwrap_or_else(|| "cmd.exe".to_string());
        (s, vec![])
    };

    #[cfg(not(windows))]
    let (shell, login_args): (String, Vec<String>) = {
        let s = shell_env
            .get("SHELL")
            .cloned()
            .or_else(|| std::env::var("SHELL").ok())
            .unwrap_or_else(|| "/bin/bash".to_string());
        // -l: login shell so nvm/pyenv/rbenv init scripts load
        (s, vec!["-l".to_string()])
    };

    let mut cmd = CommandBuilder::new(&shell);
    for a in &login_args {
        cmd.arg(a);
    }

    // Inject the resolved shell env
    for (k, v) in shell_env {
        cmd.env(k, v);
    }

    // Note: portable-pty's CommandBuilder has no pre_exec hook, so we cannot
    // put the child in its own process group via setsid. That's fine — we
    // kill the shell directly via its process_id. Any background processes
    // the shell forked become orphans and are reaped by the OS.

    cmd
}

/// Spawn a PTY-backed shell inside the worktree. Idempotent per workspace_id.
pub async fn spawn(
    app: AppHandle,
    terminals: Arc<Mutex<std::collections::HashMap<String, TerminalSession>>>,
    workspace_id: String,
    worktree_path: String,
    shell_env: std::collections::HashMap<String, String>,
) -> Result<()> {
    {
        let map = terminals.lock().await;
        if map.contains_key(&workspace_id) {
            tracing::info!("Terminal already running for workspace {}", workspace_id);
            return Ok(());
        }
    }

    // PTY allocation is blocking (openpty / ConPTY init).
    let workspace_id_for_task = workspace_id.clone();
    let worktree_path_for_task = worktree_path.clone();
    let shell_env_for_task = shell_env.clone();

    let (master, slave) = tokio::task::spawn_blocking(move || -> Result<_> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: DEFAULT_ROWS,
                cols: DEFAULT_COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("Failed to open PTY")?;
        Ok((pair.master, pair.slave))
    })
    .await
    .context("spawn_blocking join")??;

    let mut cmd = build_shell_command(&shell_env_for_task);
    cmd.cwd(&worktree_path_for_task);

    // Spawn the shell inside the slave PTY. Spawn is blocking, so hop to a blocking task.
    let mut child = {
        let slave = slave;
        let cmd = cmd;
        tokio::task::spawn_blocking(move || slave.spawn_command(cmd))
            .await
            .context("spawn_blocking join")?
            .context("Failed to spawn shell in PTY")?
    };

    let pid = child.process_id();
    tracing::info!(
        "Terminal spawned for workspace {}: pid={:?}, cwd={}",
        workspace_id_for_task,
        pid,
        worktree_path_for_task
    );

    // Take writer + reader from the master.
    let writer = master
        .take_writer()
        .context("Failed to take PTY writer")?;
    let mut reader = master
        .try_clone_reader()
        .context("Failed to clone PTY reader")?;

    let session = TerminalSession {
        workspace_id: workspace_id_for_task.clone(),
        writer: Mutex::new(writer),
        master,
        pid,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        scrollback: std::sync::Mutex::new(VecDeque::with_capacity(SCROLLBACK_CAP)),
        running: std::sync::atomic::AtomicBool::new(true),
    };

    // Insert into the map BEFORE spawning the reader so attach_replay can find it.
    {
        let mut map = terminals.lock().await;
        map.insert(workspace_id_for_task.clone(), session);
    }

    // ── Reader task: blocking, reads PTY output in chunks ────────────────────
    {
        let app_r = app.clone();
        let terminals_r = terminals.clone();
        let wid_r = workspace_id_for_task.clone();
        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; READ_CHUNK];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = &buf[..n];
                        // Append to ring buffer (capped). Std mutex is fine here
                        // since the critical section is short.
                        if let Ok(mut map) = terminals_r.try_lock() {
                            if let Some(sess) = map.get_mut(&wid_r) {
                                if let Ok(mut sb) = sess.scrollback.lock() {
                                    sb.extend(chunk.iter().copied());
                                    while sb.len() > SCROLLBACK_CAP {
                                        sb.pop_front();
                                    }
                                }
                            }
                        }
                        // Emit to frontend
                        let _ = app_r.emit(
                            "terminal:data",
                            TerminalDataEvent {
                                workspace_id: wid_r.clone(),
                                data_b64: encode_b64(chunk),
                            },
                        );
                    }
                    Err(e) => {
                        tracing::warn!("PTY read error for {}: {}", wid_r, e);
                        break;
                    }
                }
            }
            tracing::info!("PTY reader EOF for workspace {}", wid_r);
        });
    }

    // ── Waiter task: blocking, calls child.wait() and emits exit event ────────
    {
        let app_w = app.clone();
        let terminals_w = terminals.clone();
        let wid_w = workspace_id_for_task.clone();
        tokio::task::spawn_blocking(move || {
            let exit_code = match child.wait() {
                Ok(status) => status.exit_code() as i32,
                Err(e) => {
                    tracing::warn!("child.wait() failed for {}: {}", wid_w, e);
                    -1
                }
            };
            // Mark not running and remove from map
            if let Ok(mut map) = terminals_w.try_lock() {
                if let Some(sess) = map.get_mut(&wid_w) {
                    sess.running
                        .store(false, std::sync::atomic::Ordering::SeqCst);
                }
                map.remove(&wid_w);
            }
            let _ = app_w.emit(
                "terminal:exit",
                TerminalExitEvent {
                    workspace_id: wid_w,
                    exit_code: Some(exit_code),
                },
            );
        });
    }

    Ok(())
}

/// Write data to the PTY's stdin. `data_b64` is base64-encoded bytes (e.g. from xterm).
pub async fn write(
    terminals: &Arc<Mutex<std::collections::HashMap<String, TerminalSession>>>,
    workspace_id: &str,
    data_b64: &str,
) -> Result<()> {
    let map = terminals.lock().await;
    let session = map
        .get(workspace_id)
        .ok_or_else(|| anyhow::anyhow!("No terminal running for workspace {}", workspace_id))?;
    let bytes = b64_engine()
        .decode(data_b64)
        .context("Invalid base64 in terminal_write")?;
    let mut writer = session.writer.lock().await;
    writer
        .write_all(&bytes)
        .context("Failed to write to PTY")?;
    writer.flush().ok();
    Ok(())
}

/// Resize the PTY. Tauri command handler should call this on xterm.onResize.
pub async fn resize(
    terminals: &Arc<Mutex<std::collections::HashMap<String, TerminalSession>>>,
    workspace_id: &str,
    cols: u16,
    rows: u16,
) -> Result<()> {
    let map = terminals.lock().await;
    let session = map
        .get(workspace_id)
        .ok_or_else(|| anyhow::anyhow!("No terminal running for workspace {}", workspace_id))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("PTY resize failed")?;
    Ok(())
}

/// Close the PTY: send SIGTERM to the shell, then drop the master.
pub async fn close(
    terminals: &Arc<Mutex<std::collections::HashMap<String, TerminalSession>>>,
    workspace_id: &str,
) -> Result<()> {
    let mut map = terminals.lock().await;
    if let Some(session) = map.remove(workspace_id) {
        session
            .running
            .store(false, std::sync::atomic::Ordering::SeqCst);
        if let Some(pid) = session.pid {
            #[cfg(unix)]
            {
                let _ = nix::sys::signal::kill(
                    nix::unistd::Pid::from_raw(pid as i32),
                    nix::sys::signal::Signal::SIGTERM,
                );
            }
            #[cfg(not(unix))]
            {
                let _ = pid; // On Windows, dropping the master closes the ConPTY session.
            }
        }
        // Drop master to close the PTY (sends SIGHUP on Unix; closes the conhost on Windows).
        drop(session.master);
    }
    Ok(())
}

/// Drain the scrollback ring buffer for a workspace. Returns None if no session exists.
pub async fn attach_replay(
    terminals: &Arc<Mutex<std::collections::HashMap<String, TerminalSession>>>,
    workspace_id: &str,
) -> Result<Option<TerminalAttachInfo>> {
    // Snapshot the bytes and is_running flag while briefly holding the outer
    // lock. Both reads are sync (std::mutex, atomic), so no await happens
    // under the outer guard.
    let snapshot: Option<(Vec<u8>, bool)> = {
        let map = terminals.lock().await;
        map.get(workspace_id).map(|session| {
            let bytes: Vec<u8> = session
                .scrollback
                .lock()
                .map(|sb| sb.iter().copied().collect())
                .unwrap_or_default();
            let running = session
                .running
                .load(std::sync::atomic::Ordering::SeqCst);
            (bytes, running)
        })
    };

    Ok(snapshot.map(|(bytes, is_running)| TerminalAttachInfo {
        workspace_id: workspace_id.to_string(),
        scrollback_b64: encode_b64(&bytes),
        is_running,
    }))
}

/// Kill every running terminal. Called on app exit.
pub async fn kill_all(
    terminals: &Arc<Mutex<std::collections::HashMap<String, TerminalSession>>>,
) {
    let mut map = terminals.lock().await;
    let ids: Vec<String> = map.keys().cloned().collect();
    for id in ids {
        if let Some(session) = map.remove(&id) {
            session
                .running
                .store(false, std::sync::atomic::Ordering::SeqCst);
            if let Some(pid) = session.pid {
                #[cfg(unix)]
                {
                    let _ = nix::sys::signal::kill(
                        nix::unistd::Pid::from_raw(pid as i32),
                        nix::sys::signal::Signal::SIGTERM,
                    );
                }
                let _ = pid;
            }
            drop(session.master);
        }
    }
}
