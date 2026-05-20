use super::{AgentProvider, ProviderInfo};
use async_trait::async_trait;

pub struct CodexProvider;

#[async_trait]
impl AgentProvider for CodexProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "codex",
            display_name: "OpenAI Codex",
            cli_binary: "codex",
            description: "OpenAI Codex CLI agent",
        }
    }

    fn build_command(&self, prompt: &str, _worktree_path: &str) -> (String, Vec<String>) {
        (
            "codex".to_string(),
            vec!["--full-auto".to_string(), prompt.to_string()],
        )
    }
}
