use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use sqlx::SqlitePool;
use serde::Serialize;

/// Resolve the user's full shell environment by querying their login shell.
/// This catches nvm, pyenv, rbenv, and other version-manager paths,
/// as well as custom env vars like OPENAI_BASE_URL, etc.
pub fn resolve_shell_env() -> HashMap<String, String> {
    let shell = std::env::var("SHELL")
        .unwrap_or_else(|_| "/bin/bash".to_string());

    // Strategies: try different shell flags (login, interactive, both, plain)
    let strategies: &[&[&str]] = &[
        &["-l", "-c", "env"],
        &["-i", "-c", "env"],
        &["-l", "-i", "-c", "env"],
        &["-c", "env"],
    ];

    for args in strategies {
        if let Ok(out) = std::process::Command::new(&shell)
            .args(args.iter())
            .output()
        {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut env = HashMap::new();
            for line in stdout.lines() {
                // Some vars might have '=' in them (not common for keys but possible for values)
                if let Some((key, value)) = line.split_once('=') {
                    env.insert(key.to_string(), value.to_string());
                }
            }

            if !env.is_empty() && env.contains_key("PATH") {
                tracing::info!("Resolved shell environment using {:?}", args);
                return env;
            }
        }
    }

    // Fallback: manually construct a basic environment with nvm support if possible
    let mut env: HashMap<String, String> = std::env::vars().collect();
    let home = std::env::var("HOME").unwrap_or_default();
    
    let nvm_dir = format!("{}/.nvm/versions/node", home);
    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        let mut versions: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .collect();
        versions.sort();

        if let Some(v) = versions.last() {
            let nvm_path = format!("{}/{}/bin", nvm_dir, v);
            let current_path = env.get("PATH").cloned().unwrap_or_default();
            let new_path = format!("{}:{}/bin:{}/.local/bin:{}", nvm_path, home, home, current_path);
            env.insert("PATH".to_string(), new_path);
            tracing::info!("Enhanced fallback PATH with nvm: {}", nvm_path);
        }
    }

    tracing::warn!("Could not resolve full shell environment, using enhanced system env");
    env
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
    pub running_agents: Arc<Mutex<HashMap<String, RunningAgent>>>,
    pub app_data_dir: String,
    pub shell_env: HashMap<String, String>,
}

impl AppState {
    pub fn new(db: SqlitePool, app_data_dir: String) -> Self {
        let shell_env = resolve_shell_env();
        let path = shell_env.get("PATH").cloned().unwrap_or_default();
        tracing::info!("Resolved shell PATH: {}", path);
        Self {
            db,
            running_agents: Arc::new(Mutex::new(HashMap::new())),
            app_data_dir,
            shell_env,
        }
    }
    
    pub fn shell_path(&self) -> String {
        self.shell_env.get("PATH").cloned().unwrap_or_default()
    }
}

#[derive(Debug, Serialize)]
pub struct AgentStatusSnapshot {
    pub workspace_id: String,
    pub session_id: String,
    pub provider_id: String,
}