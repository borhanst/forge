pub mod claude;
pub mod codex;
pub mod gemini;
pub mod kilo;
pub mod mock;
pub mod opencode;
pub mod openclaude;

use async_trait::async_trait;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProviderInfo {
    pub id: &'static str,
    pub display_name: &'static str,
    pub cli_binary: &'static str,
    pub description: &'static str,
    /// Whether this provider supports a --model flag
    pub supports_model: bool,
    /// Whether this provider supports a mode/agent flag
    pub supports_mode: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentOutput {
    pub workspace_id: String,
    pub session_id: String,
    pub stream: String,
    pub content: String,
}

/// The full set of directories that may legitimately contain a user-installed
/// provider binary. The first entry that contains `<dir>/<binary>` wins.
/// `well_known_binary_dirs()` is defined in `crate::state` and re-exported
/// through the `state` module to avoid duplicating the path list.
pub use crate::state::well_known_binary_dirs;

#[async_trait]
pub trait AgentProvider: Send + Sync {
    fn info(&self) -> ProviderInfo;

    fn is_available(&self) -> bool {
        which::which(self.info().cli_binary).is_ok()
    }

    /// Check availability using the resolved shell PATH plus the well-known
    /// fallback dirs. Catches nvm/fnm/volta/cargo/`npm install -g` binaries
    /// even when the user's `~/.bashrc` PATH exports weren't captured.
    fn is_available_in_shell(&self, shell_path: &str) -> bool {
        resolve_provider_binary(self.info().cli_binary, shell_path).is_some()
    }

    /// Build the command to spawn. `shell_path` is the resolved user PATH
    /// (from `state.shell_path()`) and is used to resolve the absolute path
    /// of `cli_binary` via the shared `resolve_provider_binary` helper.
    fn build_command(
        &self,
        prompt: &str,
        worktree_path: &str,
        options: &HashMap<String, String>,
        shell_path: &str,
    ) -> (String, Vec<String>);

    /// Ordered list of install attempts. Runner tries each in order, stops at first exit-0.
    fn install_options(&self) -> Vec<Vec<String>> {
        vec![]
    }

    /// Display label for the install command in the confirm modal.
    fn install_label(&self) -> &'static str {
        self.info().display_name
    }
}

/// Walk a PATH-style colon-separated string and return each directory.
fn split_path(path: &str) -> Vec<PathBuf> {
    path.split(':')
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .collect()
}

/// Check every directory in `shell_path` plus the well-known fallback list for
/// `binary`. Returns the first absolute path that exists, or None.
pub fn resolve_provider_binary(binary: &str, shell_path: &str) -> Option<String> {
    // If already an absolute path, return it directly if the file exists.
    if binary.starts_with('/') {
        return if std::path::Path::new(binary).exists() {
            Some(binary.to_string())
        } else {
            None
        };
    }

    let mut tried: Vec<PathBuf> = Vec::new();
    for dir in split_path(shell_path) {
        tried.push(dir.clone());
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    for dir in well_known_binary_dirs() {
        let pb = PathBuf::from(&dir);
        if tried.contains(&pb) {
            continue;
        }
        let candidate = pb.join(binary);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    // Last resort: ask the user's shell to resolve it. This catches the case
    // where the binary lives in a path the static list doesn't know about but
    // the shell's login environment does.
    if let Some(path) = resolve_binary_path(binary, shell_path) {
        return Some(path);
    }

    None
}

/// Check whether `binary` is on the user's shell PATH or in a well-known
/// fallback directory. Used by `is_available_in_shell` and the install modal.
pub fn check_binary_in_shell(binary: &str, shell_path: &str) -> bool {
    resolve_provider_binary(binary, shell_path).is_some()
}

/// Resolve a binary name to its absolute path via the user's shell.
/// Returns None if the binary cannot be found on PATH.
pub fn resolve_binary_path(binary: &str, shell_path: &str) -> Option<String> {
    // If already an absolute path, return it directly if the file exists
    if binary.starts_with('/') {
        return if std::path::Path::new(binary).exists() {
            Some(binary.to_string())
        } else {
            None
        };
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        #[cfg(target_os = "macos")]
        { "/bin/zsh".to_string() }
        #[cfg(not(target_os = "macos"))]
        { "/bin/bash".to_string() }
    });

    #[cfg(target_os = "windows")]
    {
        // Windows: use `where.exe`
        let out = std::process::Command::new("where.exe")
            .arg(binary)
            .output()
            .ok()?;
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            return stdout.lines().next().map(|s| s.trim().to_string());
        }
        return None;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let escaped = format!("'{}'", binary.replace('\'', "'\\''"));
        let cmd = format!(
            "command -v {} 2>/dev/null || which {} 2>/dev/null",
            escaped, escaped
        );
        let out = std::process::Command::new(&shell)
            .args(["-c", &cmd])
            .env("PATH", shell_path)
            .output()
            .ok()?;
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
        // Fallback to direct `which` without shell wrapping
        let out2 = std::process::Command::new("which")
            .arg(binary)
            .output()
            .ok()?;
        if out2.status.success() {
            let path = String::from_utf8_lossy(&out2.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
        None
    }
}

pub fn all_providers() -> Vec<Box<dyn AgentProvider>> {
    vec![
        Box::new(claude::ClaudeProvider),
        Box::new(codex::CodexProvider),
        Box::new(gemini::GeminiProvider),
        Box::new(kilo::KiloProvider),
        Box::new(opencode::OpenCodeProvider),
        Box::new(openclaude::OpenClaudeProvider),
        Box::new(mock::MockProvider),
    ]
}

pub fn get_provider(id: &str) -> Option<Box<dyn AgentProvider>> {
    all_providers().into_iter().find(|p| p.info().id == id)
}
