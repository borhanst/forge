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
            supports_model: true,
            supports_mode: false,
        }
    }

    fn build_command(&self, prompt: &str, _worktree_path: &str, options: &HashMap<String, String>) -> (String, Vec<String>) {
        let mut args: Vec<String> = Vec::new();
        if let Some(model) = options.get("model").filter(|m| !m.is_empty()) {
            args.push("--model".to_string());
            args.push(model.to_string());
        }
        args.push("-p".to_string());
        args.push(prompt.to_string());
        ("gemini".to_string(), args)
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
