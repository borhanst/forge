use super::{AgentProvider, ProviderInfo};
use async_trait::async_trait;

pub struct OpenCodeProvider;

#[async_trait]
impl AgentProvider for OpenCodeProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "opencode",
            display_name: "OpenCode",
            cli_binary: "opencode",
            description: "Open-source multi-model coding agent (local or cloud)",
        }
    }

    fn build_command(&self, prompt: &str, _worktree_path: &str) -> (String, Vec<String>) {
        (
            "opencode".to_string(),
            vec!["run".to_string(), prompt.to_string()],
        )
    }

    fn install_options(&self) -> Vec<Vec<String>> {
        vec![vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "opencode-ai@latest".to_string(),
        ]]
    }
}
