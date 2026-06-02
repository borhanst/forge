use super::{AgentProvider, ProviderInfo};
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

    fn is_available_in_shell(&self, shell_path: &str) -> bool {
        if super::check_binary_in_shell(self.info().cli_binary, shell_path) {
            return true;
        }
        // kilo installs to ~/.kilo/bin by default which may not be on PATH
        let home = std::env::var("HOME").unwrap_or_default();
        std::path::Path::new(&format!("{}/.kilo/bin/kilo", home)).exists()
    }

    fn build_command(&self, prompt: &str, _worktree_path: &str, options: &HashMap<String, String>) -> (String, Vec<String>) {
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

        // Fall back to the default install path if not on PATH
        let binary = if which::which("kilo").is_ok() {
            "kilo".to_string()
        } else {
            let home = std::env::var("HOME").unwrap_or_default();
            format!("{}/.kilo/bin/kilo", home)
        };

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
