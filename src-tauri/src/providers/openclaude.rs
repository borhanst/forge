use super::{AgentProvider, ProviderInfo};
use async_trait::async_trait;
use std::collections::HashMap;

pub struct OpenClaudeProvider;

#[async_trait]
impl AgentProvider for OpenClaudeProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "openclaude",
            display_name: "OpenClaude",
            cli_binary: "openclaude",
            description: "Open-source Claude CLI — local Ollama or custom endpoint",
        }
    }

    fn build_command(&self, prompt: &str, _worktree_path: &str, _options: &HashMap<String, String>) -> (String, Vec<String>) {
        (
            "openclaude".to_string(),
            vec!["-p".to_string(), prompt.to_string()],
        )
    }

    fn install_options(&self) -> Vec<Vec<String>> {
        vec![vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "openclaude@latest".to_string(),
        ]]
    }
}
