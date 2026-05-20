use super::{AgentProvider, ProviderInfo};
use async_trait::async_trait;

pub struct MockProvider;

#[async_trait]
impl AgentProvider for MockProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id:           "mock",
            display_name: "Mock Agent",
            cli_binary:   "echo",
            description:  "Test agent using echo",
        }
    }

    fn build_command(&self, prompt: &str, _worktree_path: &str) -> (String, Vec<String>) {
        (
            "echo".to_string(),
            vec![format!("Mock response to: {}", prompt)],
        )
    }
}
