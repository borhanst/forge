use super::{AgentProvider, ProviderInfo, resolve_provider_binary};
use async_trait::async_trait;
use std::collections::HashMap;

pub struct OpenCodeProvider;

#[async_trait]
impl AgentProvider for OpenCodeProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "opencode",
            display_name: "OpenCode",
            cli_binary: "opencode",
            description: "Open-source multi-model coding agent (local or cloud)",
            supports_model: true,
            supports_mode: true,
        }
    }

    fn build_command(
        &self,
        prompt: &str,
        _worktree_path: &str,
        options: &HashMap<String, String>,
        shell_path: &str,
    ) -> (String, Vec<String>) {
        let mut args = vec!["run".to_string(), prompt.to_string()];

        if let Some(model) = options.get("model") {
            args.push("--model".to_string());
            args.push(model.to_string());
        }

        if let Some(agent) = options.get("agent") {
            args.push("--agent".to_string());
            args.push(agent.to_string());
        }

        let binary = resolve_provider_binary(self.info().cli_binary, shell_path)
            .unwrap_or_else(|| self.info().cli_binary.to_string());
        (binary, args)
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
