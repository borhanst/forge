use super::{AgentProvider, ProviderInfo};
use async_trait::async_trait;
use std::collections::HashMap;

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

    fn build_command(&self, prompt: &str, _worktree_path: &str, _options: &HashMap<String, String>) -> (String, Vec<String>) {
        (
            "gemini".to_string(),
            vec!["-p".to_string(), prompt.to_string()],
        )
    }

    fn install_options(&self) -> Vec<Vec<String>> {
        vec![vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "@google/gemini-cli".to_string(),
        ]]
    }
}
