use super::{AgentProvider, ProviderInfo, resolve_provider_binary};
use async_trait::async_trait;
use std::collections::HashMap;

pub struct KiloProvider;

#[async_trait]
impl AgentProvider for KiloProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "kilo",
            display_name: "Kilo Code",
            cli_binary: "kilo",
            description: "Kilo Code CLI agent",
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
        // `kilo run <message..>` is the non-interactive entrypoint.
        // The default `kilo [project]` treats positional args as project paths,
        // which is why `kilo "hi"` tried to `cd` into `<cwd>/hi`.
        let mut args = vec!["run".to_string()];

        if let Some(model) = options.get("model").filter(|m| !m.is_empty()) {
            args.push("--model".to_string());
            args.push(model.to_string());
        }
        if let Some(agent) = options.get("agent").filter(|a| !a.is_empty()) {
            args.push("--agent".to_string());
            args.push(agent.to_string());
        }
        // `--` separates flags from the positional message so a prompt that
        // looks like a flag doesn't get parsed as one.
        args.push("--".to_string());
        args.push(prompt.to_string());

        // Shared resolver covers PATH entries, well-known dirs (incl.
        // `~/.kilo/bin`), and shell-resolution as a last resort.
        let binary = resolve_provider_binary(self.info().cli_binary, shell_path)
            .unwrap_or_else(|| self.info().cli_binary.to_string());

        (binary, args)
    }

    fn install_options(&self) -> Vec<Vec<String>> {
        vec![vec![
            "sh".to_string(),
            "-c".to_string(),
            "curl -fsSL https://kilo.ai/cli/install | bash".to_string(),
        ]]
    }
}
