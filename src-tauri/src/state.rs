use std::collections::HashMap;
use tokio::sync::Mutex;
use sqlx::SqlitePool;
use serde::Serialize;

/// Resolve the user's full shell PATH by querying their login shell.
/// This catches nvm, pyenv, rbenv, and other version-manager paths
/// that Tauri's process PATH misses when launched from a desktop/IDE.
pub fn resolve_shell_path() -> String {
    let shell = std::env::var("SHELL")
        .unwrap_or_else(|_| "/bin/bash".to_string());

    // Strategy 1-4: try different shell flags (login, interactive, both, plain)
    let strategies: &[&[&str]] = &[
        &["-l", "-c", "echo $PATH"],
        &["-i", "-c", "echo $PATH"],
        &["-l", "-i", "-c", "echo $PATH"],
        &["-c", "echo $PATH"],
    ];

    for args in strategies {
        if let Ok(out) = std::process::Command::new(&shell)
            .args(args.iter())
            .output()
        {
            let path = String::from_utf8_lossy(&out.stdout)
                .lines()
                .find(|l| l.contains('/'))
                .unwrap_or("")
                .trim()
                .to_string();

            if !path.is_empty() && path.contains("bin") {
                tracing::info!("Resolved PATH using {:?}: {}", args, path);
                return path;
            }
        }
    }

    // Strategy 5: scan nvm directory directly
    let home = std::env::var("HOME").unwrap_or_default();
    let system_path = std::env::var("PATH").unwrap_or_default();

    let nvm_dir = format!("{}/.nvm/versions/node", home);
    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        let mut versions: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .collect();
        versions.sort();

        let nvm_paths: Vec<String> = versions.iter().rev()
            .map(|v| format!("{}/{}/bin", nvm_dir, v))
            .collect();

        let extra = nvm_paths.join(":");
        let full = format!("{}:{}/bin:{}/.local/bin:{}",
            extra, home, home, system_path,
        );
        tracing::info!("Resolved PATH via nvm scan: {}", full);
        return full;
    }

    tracing::warn!("Could not resolve shell PATH, using system PATH");
    system_path
}

/// A cancellation handle for a running agent process
pub struct AgentHandle {
    pub cancel_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

/// Tracks a live running agent process
pub struct RunningAgent {
    pub workspace_id: String,
    pub session_id: String,
    pub provider_id: String,
    pub handle: AgentHandle,
}

pub struct AppState {
    pub db: SqlitePool,
    pub running_agents: Mutex<HashMap<String, RunningAgent>>,
    pub app_data_dir: String,
    pub shell_path: String,
}

impl AppState {
    pub fn new(db: SqlitePool, app_data_dir: String) -> Self {
        let shell_path = resolve_shell_path();
        tracing::info!("Resolved shell PATH: {}", shell_path);
        Self {
            db,
            running_agents: Mutex::new(HashMap::new()),
            app_data_dir,
            shell_path,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AgentStatusSnapshot {
    pub workspace_id: String,
    pub session_id: String,
    pub provider_id: String,
}