use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub local_path: String,
    pub github_url: Option<String>,
    pub owner: Option<String>,
    pub repo_name: Option<String>,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Workspace {
    pub id: String,
    pub repo_id: String,
    pub city_name: String,
    pub branch: String,
    pub worktree_path: String,
    pub provider: String,
    pub provider_config: Option<String>,
    pub status: String,
    pub created_at: NaiveDateTime,
    pub archived_at: Option<NaiveDateTime>,
    pub merge_push: Option<i64>,
    pub merge_cleanup: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Session {
    pub id: String,
    pub workspace_id: String,
    pub prompt: Option<String>,
    pub exit_code: Option<i64>,
    pub created_at: NaiveDateTime,
    pub finished_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OutputLine {
    pub id: Option<i64>,
    pub session_id: String,
    pub stream: String,
    pub content: String,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub repo_id: String,
    pub provider: String,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceWithRepo {
    pub workspace: Workspace,
    pub repository: Repository,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct LineComment {
    pub id:           Option<i64>,
    pub workspace_id: String,
    pub file_path:    String,
    pub line_number:  i64,
    pub content:      String,
    pub author:       String,
    pub created_at:   Option<chrono::NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PullRequestRecord {
    pub id:           Option<String>,
    pub workspace_id: Option<String>,
    pub pr_number:    Option<i64>,
    pub title:        Option<String>,
    pub html_url:     Option<String>,
    pub state:        Option<String>,
    pub merged:       Option<i64>,
    pub draft:        Option<i64>,
    pub created_at:   Option<NaiveDateTime>,
    pub updated_at:   Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GeneralSettings {
    #[serde(default = "default_provider")]
    pub default_provider:      String,
    #[serde(default)]
    pub default_base_branch:   String,
    #[serde(default = "default_cleanup")]
    pub default_cleanup:       String,
    #[serde(default = "default_true")]
    pub confirm_before_archive: bool,
    #[serde(default = "default_true")]
    pub confirm_before_delete:  bool,
    #[serde(default = "default_true")]
    pub show_keyboard_hints:    bool,
}

fn default_provider() -> String { String::new() }
fn default_cleanup() -> String  { "archive".to_string() }
fn default_true() -> bool       { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeSettings {
    #[serde(default = "default_accent")]
    pub accent:           String,
    #[serde(default = "default_density")]
    pub density:          String,
    #[serde(default = "default_term_size")]
    pub terminal_font_size: u32,
}

impl Default for ThemeSettings {
    fn default() -> Self {
        Self {
            accent:            default_accent(),
            density:           default_density(),
            terminal_font_size: default_term_size(),
        }
    }
}

fn default_accent() -> String   { "ember".to_string() }
fn default_density() -> String  { "cozy".to_string() }
fn default_term_size() -> u32   { 13 }

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentSettings {
    #[serde(default)]
    pub default_provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GithubSettings {
    #[serde(default)]
    pub has_token: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub general: GeneralSettings,
    #[serde(default)]
    pub theme:   ThemeSettings,
    #[serde(default)]
    pub agents:  AgentSettings,
    #[serde(default)]
    pub github:  GithubSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings::default(),
            theme:   ThemeSettings::default(),
            agents:  AgentSettings::default(),
            github:  GithubSettings::default(),
        }
    }
}
