pub mod claude;
pub mod codex;
pub mod gemini;
pub mod mock;
pub mod opencode;
pub mod openclaude;

use async_trait::async_trait;
use std::collections::HashMap;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProviderInfo {
    pub id: &'static str,
    pub display_name: &'static str,
    pub cli_binary: &'static str,
    pub description: &'static str,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentOutput {
    pub workspace_id: String,
    pub session_id: String,
    pub stream: String,
    pub content: String,
}

#[async_trait]
pub trait AgentProvider: Send + Sync {
    fn info(&self) -> ProviderInfo;

    fn is_available(&self) -> bool {
        which::which(self.info().cli_binary).is_ok()
    }

    /// Check availability using the resolved shell PATH (catches nvm/pyenv binaries)
    fn is_available_in_shell(&self, shell_path: &str) -> bool {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| {
            #[cfg(target_os = "macos")]
            { "/bin/zsh".to_string() }
            #[cfg(not(target_os = "macos"))]
            { "/bin/bash".to_string() }
        });
        let binary = self.info().cli_binary;
        let escaped = format!("'{}'", binary.replace('\'', "'\\''"));

        std::process::Command::new(&shell)
            .args(["-c", &format!("command -v {} 2>/dev/null || which {} 2>/dev/null", escaped, escaped)])
            .env("PATH", shell_path)
            .output()
            .map(|o| o.status.success())
            .unwrap_or_else(|_| {
                std::process::Command::new("sh")
                    .args(["-c", &format!("command -v {} 2>/dev/null || which {} 2>/dev/null", escaped, escaped)])
                    .env("PATH", shell_path)
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            })
    }

    fn build_command(&self, prompt: &str, worktree_path: &str, options: &HashMap<String, String>) -> (String, Vec<String>);

    /// Ordered list of install attempts. Runner tries each in order, stops at first exit-0.
    fn install_options(&self) -> Vec<Vec<String>> {
        vec![]
    }

    /// Display label for the install command in the confirm modal.
    fn install_label(&self) -> &'static str {
        self.info().display_name
    }
}

/// Resolve a binary name to its absolute path via the user's shell.
/// Returns None if the binary cannot be found on PATH.
pub fn resolve_binary_path(binary: &str, shell_path: &str) -> Option<String> {
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
        let cmd = format!("command -v {} 2>/dev/null || which {} 2>/dev/null", escaped, escaped);
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
        Box::new(opencode::OpenCodeProvider),
        Box::new(openclaude::OpenClaudeProvider),
        Box::new(mock::MockProvider),
    ]
}

pub fn get_provider(id: &str) -> Option<Box<dyn AgentProvider>> {
    all_providers().into_iter().find(|p| p.info().id == id)
}
