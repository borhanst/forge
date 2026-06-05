use super::{AgentProvider, ProviderInfo, resolve_provider_binary};
use async_trait::async_trait;
use std::collections::HashMap;

pub struct ClaudeProvider;

#[async_trait]
impl AgentProvider for ClaudeProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "claude",
            display_name: "Claude Code",
            cli_binary: "claude",
            description: "Anthropic Claude Code CLI",
            supports_model: true,
            supports_mode: false,
        }
    }

    fn build_command(
        &self,
        prompt: &str,
        _worktree_path: &str,
        options: &HashMap<String, String>,
        shell_path: &str,
    ) -> (String, Vec<String>) {
        let mut args = vec!["--print".to_string()];
        if let Some(model) = options.get("model").filter(|m| !m.is_empty()) {
            args.push("--model".to_string());
            args.push(model.to_string());
        }
        args.push(prompt.to_string());
        let binary = resolve_provider_binary(self.info().cli_binary, shell_path)
            .unwrap_or_else(|| self.info().cli_binary.to_string());
        (binary, args)
    }

    fn install_options(&self) -> Vec<Vec<String>> {
        let mut opts = vec![vec![
            "npm".to_string(),
            "install".to_string(),
            "-g".to_string(),
            "@anthropic-ai/claude-code".to_string(),
        ]];
        #[cfg(not(target_os = "windows"))]
        opts.push(vec![
            "sh".to_string(),
            "-c".to_string(),
            "curl -fsSL https://claude.ai/install.sh | bash".to_string(),
        ]);
        opts
    }
}
