pub mod claude;
pub mod codex;
pub mod gemini;
pub mod mock;

use async_trait::async_trait;

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
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        let binary = self.info().cli_binary;
        let escaped = format!("'{}'", binary.replace('\'', "'\\''"));
        
        // Try using the same shell as the runner with -c
        std::process::Command::new(&shell)
            .args(["-c", &format!("which {}", escaped)])
            .env("PATH", shell_path)
            .output()
            .map(|o| o.status.success())
            .unwrap_or_else(|_| {
                // Fallback to basic sh if $SHELL fails to spawn
                std::process::Command::new("sh")
                    .args(["-c", &format!("which {}", escaped)])
                    .env("PATH", shell_path)
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            })
    }

    fn build_command(&self, prompt: &str, worktree_path: &str) -> (String, Vec<String>);
}

pub fn all_providers() -> Vec<Box<dyn AgentProvider>> {
    vec![
        Box::new(claude::ClaudeProvider),
        Box::new(codex::CodexProvider),
        Box::new(gemini::GeminiProvider),
        Box::new(mock::MockProvider),
    ]
}

pub fn get_provider(id: &str) -> Option<Box<dyn AgentProvider>> {
    all_providers().into_iter().find(|p| p.info().id == id)
}
