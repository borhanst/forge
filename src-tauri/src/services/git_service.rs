use git2::{Repository, StatusOptions, DiffFormat, DiffOptions, Signature};
use anyhow::{Result, Context};
use std::process::Command;

pub fn clone_repo(url: &str, dest: &str) -> Result<()> {
    git2::Repository::clone(url, dest)
        .with_context(|| format!("Failed to clone {} to {}", url, dest))?;
    Ok(())
}

pub fn open_repo(path: &str) -> Result<()> {
    Repository::open(path)
        .with_context(|| format!("Not a git repository: {}", path))?;
    Ok(())
}

pub fn add_worktree(
    repo_path: &str,
    worktree_path: &str,
    branch_name: &str,
) -> Result<()> {
    let output = Command::new("git")
        .args([
            "-C", repo_path,
            "worktree", "add",
            "-b", branch_name,
            worktree_path,
        ])
        .output()
        .context("Failed to execute git worktree add")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!(
            "git worktree add failed: {}", stderr.trim()
        ));
    }

    Ok(())
}

/// Ensures a worktree exists at the given path.
/// If it doesn't exist, it attempts to re-create it.
pub fn ensure_worktree(
    repo_path: &str,
    worktree_path: &str,
    branch_name: &str,
) -> Result<()> {
    if std::path::Path::new(worktree_path).exists() {
        return Ok(());
    }

    // First, prune any stale worktree metadata
    let _ = Command::new("git")
        .args(["-C", repo_path, "worktree", "prune"])
        .output();

    // Try adding the worktree with -b first (assuming branch doesn't exist)
    let output = Command::new("git")
        .args([
            "-C", repo_path,
            "worktree", "add",
            "-b", branch_name,
            worktree_path,
        ])
        .output()
        .context("Failed to execute git worktree add")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If branch already exists, try adding without -b
        if stderr.contains("already exists") {
            let output2 = Command::new("git")
                .args([
                    "-C", repo_path,
                    "worktree", "add",
                    worktree_path,
                    branch_name,
                ])
                .output()
                .context("Failed to execute git worktree add (second attempt)")?;

            if !output2.status.success() {
                let stderr2 = String::from_utf8_lossy(&output2.stderr);
                return Err(anyhow::anyhow!(
                    "git worktree add failed (branch exists): {}", stderr2.trim()
                ));
            }
        } else {
            return Err(anyhow::anyhow!(
                "git worktree add failed: {}", stderr.trim()
            ));
        }
    }

    Ok(())
}

pub fn remove_worktree(repo_path: &str, worktree_path: &str) -> Result<()> {
    let output = Command::new("git")
        .args([
            "-C", repo_path,
            "worktree", "remove",
            "--force",
            worktree_path,
        ])
        .output()
        .context("Failed to execute git worktree remove")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!(
            "git worktree remove failed: {}", stderr.trim()
        ));
    }

    let _ = std::fs::remove_dir_all(worktree_path);
    Ok(())
}

pub fn default_branch(repo_path: &str) -> Result<String> {
    let repo = Repository::open(repo_path)?;
    let head = repo.head()?;
    Ok(head.shorthand().unwrap_or("main").to_string())
}

pub fn parse_github_url(url: &str) -> Option<(String, String)> {
    let url = url.trim_end_matches(".git");
    let parts: Vec<&str> = url.split('/').collect();
    if parts.len() >= 2 {
        let owner = parts[parts.len() - 2].to_string();
        let name  = parts[parts.len() - 1].to_string();
        Some((owner, name))
    } else {
        None
    }
}

pub fn get_changed_files(worktree_path: &str) -> Result<Vec<String>> {
    if !std::path::Path::new(worktree_path).exists() {
        return Ok(vec![]);
    }
    let repo = Repository::open(worktree_path)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut opts))?;
    let files = statuses
        .iter()
        .filter_map(|e| e.path().map(|p| p.to_string()))
        .collect();

    Ok(files)
}

pub fn get_full_diff(worktree_path: &str) -> Result<String> {
    if !std::path::Path::new(worktree_path).exists() {
        return Ok(String::new());
    }
    let repo = Repository::open(worktree_path)?;

    let head_tree = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_tree().ok());

    let mut diff_opts = DiffOptions::new();
    diff_opts.include_untracked(true);

    let diff = match head_tree {
        Some(tree) => repo.diff_tree_to_workdir_with_index(
            Some(&tree),
            Some(&mut diff_opts),
        )?,
        None => repo.diff_index_to_workdir(None, Some(&mut diff_opts))?,
    };

    let mut output = String::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' => "+",
            '-' => "-",
            ' ' => " ",
            'F' | 'H' => "",
            _ => "",
        };
        if let Ok(content) = std::str::from_utf8(line.content()) {
            let full = match line.origin() {
                'F' | 'H' | '<' | '>' | '=' => content.to_string(),
                _ => format!("{}{}", prefix, content),
            };
            output.push_str(&full);
        }
        true
    })?;

    Ok(output)
}

pub fn stage_and_commit(worktree_path: &str, message: &str) -> Result<String> {
    let repo = Repository::open(worktree_path)?;
    let mut index = repo.index()?;

    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
    index.write()?;

    let oid  = index.write_tree()?;
    let tree = repo.find_tree(oid)?;

    let sig = repo
        .signature()
        .unwrap_or_else(|_| {
            Signature::now("Forge", "forge@localhost").unwrap()
        });

    let parent_commit = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok());

    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

    let commit_oid = repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        message,
        &tree,
        &parents,
    )?;

    Ok(commit_oid.to_string())
}

pub fn push_branch(worktree_path: &str, token: &str) -> Result<()> {
    let repo   = Repository::open(worktree_path)?;
    let branch = repo.head()?.shorthand().unwrap_or("main").to_string();

    let mut remote = repo.find_remote("origin")?;

    let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);

    let mut push_opts = git2::PushOptions::new();
    let mut callbacks = git2::RemoteCallbacks::new();

    let token_clone = token.to_string();
    callbacks.credentials(move |_url, _username, _allowed| {
        git2::Cred::userpass_plaintext("x-access-token", &token_clone)
    });

    push_opts.remote_callbacks(callbacks);
    remote.push(&[&refspec], Some(&mut push_opts))?;

    Ok(())
}
