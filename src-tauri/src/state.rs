use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::sync::Mutex;
use sqlx::SqlitePool;
use serde::Serialize;

/// Directories that frequently contain user-installed binaries on Linux/macOS.
/// Used as a safety net when shell-init files aren't sourced properly (e.g. Ubuntu's
/// `bash -l` skips `~/.bashrc`, which is where nvm, fnm, volta, asdf, cargo, and
/// `npm install -g` PATH exports usually live).
pub fn well_known_binary_dirs() -> Vec<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut dirs: Vec<String> = vec![
        format!("{}/.local/bin", home),
        format!("{}/.npm-global/bin", home),
        format!("{}/.cargo/bin", home),
        format!("{}/.local/share/cargo/bin", home),
        format!("{}/.kilo/bin", home),
        "/usr/local/bin".to_string(),
        "/usr/bin".to_string(),
        "/snap/bin".to_string(),
    ];

    if let Ok(entries) = std::fs::read_dir(format!("{}/.nvm/versions/node", home)) {
        let mut versions: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().into_string().ok())
            .collect();
        versions.sort();
        if let Some(v) = versions.last() {
            dirs.push(format!("{}/.nvm/versions/node/{}/bin", home, v));
        }
    }

    if let Ok(entries) = std::fs::read_dir(format!("{}/.fnm/node-versions", home)) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path().join("installation/bin");
            if path.is_dir() {
                dirs.push(path.to_string_lossy().to_string());
            }
        }
    }

    let volta_bin = format!("{}/.volta/bin", home);
    if std::path::Path::new(&volta_bin).is_dir() {
        dirs.push(volta_bin);
    }

    dirs
}

/// Try to source a single init file in `shell` and emit `env`. Returns the parsed
/// env map if it produced a non-empty PATH, None otherwise.
fn try_shell_capture(shell: &str, args: &[&str]) -> Option<HashMap<String, String>> {
    let out = std::process::Command::new(shell).args(args.iter()).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut env = HashMap::new();
    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once('=') {
            env.insert(key.to_string(), value.to_string());
        }
    }
    if !env.is_empty() && env.contains_key("PATH") {
        Some(env)
    } else {
        None
    }
}

/// Probe `bash` with strategies tuned for Ubuntu and similar distros. The key
/// fix: explicitly source `~/.bashrc` because `bash -l` only reads profile
/// files, and on Ubuntu the user's PATH customisations typically live in
/// `~/.bashrc` (nvm, fnm, volta, asdf, `npm install -g` exports).
fn probe_bash() -> Option<HashMap<String, String>> {
    let candidates: &[&[&str]] = &[
        // Login + interactive, with explicit sourcing of the user init files
        // that Ubuntu's default `~/.bashrc`/`~/.profile` don't always load.
        &[
            "-l",
            "-i",
            "-c",
            "for f in $HOME/.bash_profile $HOME/.bash_login $HOME/.profile $HOME/.bashrc; do [ -r \"$f\" ] && . \"$f\" >/dev/null 2>&1; done; env",
        ],
        // Non-login, with explicit sourcing of all common init files.
        &[
            "-c",
            "for f in $HOME/.bash_profile $HOME/.bash_login $HOME/.profile $HOME/.bashrc; do [ -r \"$f\" ] && . \"$f\" >/dev/null 2>&1; done; env",
        ],
        // Login only (kept as a last-resort fallback).
        &["-l", "-c", "env"],
        // Non-interactive plain env (no init files loaded).
        &["-c", "env"],
    ];

    for args in candidates {
        if let Some(env) = try_shell_capture("/bin/bash", args) {
            tracing::info!("Resolved shell env via bash {:?}", args);
            return Some(env);
        }
    }
    None
}

fn probe_zsh() -> Option<HashMap<String, String>> {
    let candidates: &[&[&str]] = &[
        &["-l", "-i", "-c", "env"],
        &["-c", "source $HOME/.zshrc 2>/dev/null; env"],
        &["-l", "-c", "env"],
        &["-c", "env"],
    ];
    for args in candidates {
        if let Some(env) = try_shell_capture("/bin/zsh", args) {
            tracing::info!("Resolved shell env via zsh {:?}", args);
            return Some(env);
        }
    }
    None
}

fn probe_fish() -> Option<HashMap<String, String>> {
    if let Some(env) = try_shell_capture("/usr/bin/fish", &["-l", "-c", "env"]) {
        tracing::info!("Resolved shell env via fish");
        return Some(env);
    }
    None
}

fn probe_sh() -> Option<HashMap<String, String>> {
    if let Some(env) = try_shell_capture("/bin/sh", &["-l", "-c", "env"]) {
        tracing::info!("Resolved shell env via /bin/sh");
        return Some(env);
    }
    None
}

/// Resolve the user's full shell environment by querying their login shell.
/// This catches nvm, pyenv, rbenv, fnm, volta, asdf, and other version-manager
/// paths, plus custom env vars. On Ubuntu in particular, the previous
/// implementation missed `~/.bashrc`; this version sources it explicitly.
pub fn resolve_shell_env() -> HashMap<String, String> {
    if let Some(env) = probe_bash() {
        return env;
    }
    if let Some(env) = probe_zsh() {
        return env;
    }
    if let Some(env) = probe_fish() {
        return env;
    }
    if let Some(env) = probe_sh() {
        return env;
    }

    let mut env: HashMap<String, String> = std::env::vars().collect();
    let well_known = well_known_binary_dirs();
    let current_path = env.get("PATH").cloned().unwrap_or_default();
    let new_path = if current_path.is_empty() {
        well_known.join(":")
    } else {
        format!("{}:{}", well_known.join(":"), current_path)
    };
    env.insert("PATH".to_string(), new_path);

    tracing::warn!(
        "Could not resolve shell environment from a login shell; using enhanced system env"
    );
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
    pub terminals: Arc<Mutex<HashMap<String, crate::services::terminal_service::TerminalSession>>>,
    pub app_data_dir: String,
    /// Wrapped in `Arc<RwLock>` so it can be cheaply read in both sync and
    /// async contexts, and atomically swapped out on `refresh_shell_env` (e.g.
    /// after `install_provider` adds a new binary directory).
    pub shell_env: Arc<RwLock<HashMap<String, String>>>,
}

impl AppState {
    pub fn new(db: SqlitePool, app_data_dir: String) -> Self {
        let shell_env = resolve_shell_env();
        if let Some(path) = shell_env.get("PATH") {
            tracing::info!("Resolved shell PATH: {}", path);
        }
        Self {
            db,
            running_agents: Arc::new(Mutex::new(HashMap::new())),
            terminals: Arc::new(Mutex::new(HashMap::new())),
            app_data_dir,
            shell_env: Arc::new(RwLock::new(shell_env)),
        }
    }

    pub fn shell_path(&self) -> String {
        self.shell_env
            .read()
            .map(|e| e.get("PATH").cloned().unwrap_or_default())
            .unwrap_or_default()
    }

    /// Return a snapshot of the full shell env for use as the child-process env.
    pub fn shell_env_snapshot(&self) -> HashMap<String, String> {
        self.shell_env
            .read()
            .map(|e| e.clone())
            .unwrap_or_default()
    }

    /// Re-resolve the shell environment. Called after installing a provider so
    /// the new binary (often placed in a directory the cached PATH didn't
    /// contain) becomes discoverable without restarting the app.
    pub fn refresh_shell_env(&self) {
        let new_env = resolve_shell_env();
        if let Some(path) = new_env.get("PATH") {
            tracing::info!("Refreshed shell PATH: {}", path);
        }
        if let Ok(mut env) = self.shell_env.write() {
            *env = new_env;
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AgentStatusSnapshot {
    pub workspace_id: String,
    pub session_id: String,
    pub provider_id: String,
}
