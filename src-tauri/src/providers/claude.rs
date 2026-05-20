use super::{AgentProvider, ProviderInfo};
use async_trait::async_trait;

pub struct ClaudeProvider;

#[async_trait]
impl AgentProvider for ClaudeProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "claude",
            display_name: "Claude Code",
            cli_binary: "claude",
            description: "Anthropic Claude Code CLI",
        }
    }

    fn build_command(&self, prompt: &str, _worktree_path: &str) -> (String, Vec<String>) {
        (
            "claude".to_string(),
            vec!["--print".to_string(), prompt.to_string()],
        )
    }
}
