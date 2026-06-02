use super::{AgentProvider, ProviderInfo};
use async_trait::async_trait;
use std::collections::HashMap;

pub struct CodexProvider;

#[async_trait]
impl AgentProvider for CodexProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "codex",
            display_name: "OpenAI Codex",
            cli_binary: "codex",
            description: "OpenAI Codex CLI agent",
            supports_model: true,
            supports_mode: false,
        }
    }

    fn build_command(&self, prompt: &str, _worktree_path: &str, options: &HashMap<String, String>) -> (String, Vec<String>) {
        let mut args = vec!["--full-auto".to_string()];
        if let Some(model) = options.get("model").filter(|m| !m.is_empty()) {
            args.push("--model".to_string());
            args.push(model.to_string());
        }
        args.push(prompt.to_string());
        ("codex".to_string(), args)
    }

    fn install_options(&self) -> Vec<Vec<String>> {
        let opts = vec![vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "@openai/codex".to_string(),
        ]];
        #[cfg(target_os = "macos")]
        opts.push(vec![
            "brew".to_string(),
            "install".to_string(),
            "--cask".to_string(),
            "codex".to_string(),
        ]);
        opts
    }
}
