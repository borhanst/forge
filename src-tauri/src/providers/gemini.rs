use super::{AgentProvider, ProviderInfo};
use async_trait::async_trait;

pub struct GeminiProvider;

#[async_trait]
impl AgentProvider for GeminiProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "gemini",
            display_name: "Gemini CLI",
            cli_binary: "gemini",
            description: "Google Gemini CLI agent",
        }
    }

    fn build_command(&self, prompt: &str, _worktree_path: &str) -> (String, Vec<String>) {
        (
            "gemini".to_string(),
            vec!["-p".to_string(), prompt.to_string()],
        )
    }
}
