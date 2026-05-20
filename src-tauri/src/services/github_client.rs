use anyhow::{Result, Context};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const GITHUB_API: &str = "https://api.github.com";

pub struct GithubClient {
    token:  String,
    client: Client,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PullRequest {
    pub number:    u64,
    pub title:     String,
    pub html_url:  String,
    pub state:     String,
    pub merged:    Option<bool>,
    pub draft:     Option<bool>,
    pub body:      Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CreatePrBody {
    title: String,
    head:  String,
    base:  String,
    body:  String,
    draft: bool,
}

impl GithubClient {
    pub fn new(token: String) -> Self {
        Self {
            token,
            client: Client::new(),
        }
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.token)
    }

    pub async fn create_pr(
        &self,
        owner:  &str,
        repo:   &str,
        title:  &str,
        head:   &str,
        base:   &str,
        body:   &str,
        draft:  bool,
    ) -> Result<PullRequest> {
        let url = format!("{}/repos/{}/{}/pulls", GITHUB_API, owner, repo);

        let pr: PullRequest = self.client
            .post(&url)
            .header("Authorization", self.auth_header())
            .header("User-Agent",    "forge-app/1.0")
            .header("Accept",        "application/vnd.github+json")
            .json(&CreatePrBody {
                title: title.to_string(),
                head:  head.to_string(),
                base:  base.to_string(),
                body:  body.to_string(),
                draft,
            })
            .send()
            .await
            .context("Failed to send create PR request")?
            .error_for_status()
            .context("GitHub API error on create PR")?
            .json()
            .await
            .context("Failed to parse PR response")?;

        Ok(pr)
    }

    pub async fn get_pr(
        &self,
        owner:     &str,
        repo:      &str,
        pr_number: u64,
    ) -> Result<PullRequest> {
        let url = format!("{}/repos/{}/{}/pulls/{}", GITHUB_API, owner, repo, pr_number);

        let pr: PullRequest = self.client
            .get(&url)
            .header("Authorization", self.auth_header())
            .header("User-Agent",    "forge-app/1.0")
            .header("Accept",        "application/vnd.github+json")
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        Ok(pr)
    }

    pub async fn find_pr_for_branch(
        &self,
        owner:  &str,
        repo:   &str,
        branch: &str,
    ) -> Result<Option<PullRequest>> {
        let url = format!(
            "{}/repos/{}/{}/pulls?head={}:{}&state=all&per_page=1",
            GITHUB_API, owner, repo, owner, branch
        );

        let prs: Vec<PullRequest> = self.client
            .get(&url)
            .header("Authorization", self.auth_header())
            .header("User-Agent",    "forge-app/1.0")
            .header("Accept",        "application/vnd.github+json")
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        Ok(prs.into_iter().next())
    }
}
