use git2::{Repository, StatusOptions, DiffFormat, DiffOptions, Signature, Oid, Sort};
use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
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

/// Convert a git-linked worktree into a standalone git repo by replacing the
/// `.git` symlink file with a real `.git` directory. This ensures that any
/// agent running in the worktree resolves `git rev-parse --show-toplevel` to
/// the worktree path, not the main repo.
pub fn ensure_worktree_as_bare_repo(
    worktree_path: &str,
    remote_url: &str,
    branch_name: &str,
) -> Result<()> {
    let git_path = std::path::Path::new(worktree_path).join(".git");

    // Already a standalone repo (real .git directory)
    if git_path.is_dir() {
        return Ok(());
    }

    // Remove the .git symlink file
    if git_path.exists() {
        std::fs::remove_file(&git_path)
            .with_context(|| format!("Failed to remove {}", git_path.display()))?;
    }

    // Initialize standalone repo
    let output = Command::new("git")
        .args(["-C", worktree_path, "init"])
        .output()
        .context("Failed to init standalone worktree repo")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("git init failed: {}", stderr.trim()));
    }

    // Add remote pointing to the original repository
    let output = Command::new("git")
        .args(["-C", worktree_path, "remote", "add", "origin", remote_url])
        .output()
        .context("Failed to add remote to worktree repo")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If remote already exists, that's fine
        if !stderr.contains("already exists") {
            return Err(anyhow::anyhow!("git remote add failed: {}", stderr.trim()));
        }
    }

    // Fetch the branch from origin
    let output = Command::new("git")
        .args(["-C", worktree_path, "fetch", "origin", branch_name])
        .output()
        .context("Failed to fetch branch into worktree repo")?;
    if !output.status.success() {
        // If fetch fails (e.g., branch doesn't exist on remote yet), we still
        // have an init'd repo — working-tree files are intact as untracked
        tracing::warn!(
            "fetch origin {} failed (branch may not exist yet): {}",
            branch_name,
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    // Check out the branch, creating it locally if it doesn't exist
    let output = Command::new("git")
        .args(["-C", worktree_path, "checkout", "--ignore-other-worktrees", branch_name])
        .output()
        .context("Failed to checkout branch in worktree repo")?;
    if !output.status.success() {
        // Branch doesn't exist locally yet — create it
        let _ = Command::new("git")
            .args(["-C", worktree_path, "checkout", "-b", branch_name])
            .output();
    }

    Ok(())
}

pub fn remove_worktree(repo_path: &str, worktree_path: &str) -> Result<()> {
    // Try git worktree remove (fails silently if already a standalone repo)
    let _ = Command::new("git")
        .args(["-C", repo_path, "worktree", "remove", "--force", worktree_path])
        .output();

    // Also clean up stale worktree metadata
    let _ = Command::new("git")
        .args(["-C", repo_path, "worktree", "prune"])
        .output();

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

pub fn get_full_diff(repo_path: &str) -> Result<String> {
    if !std::path::Path::new(repo_path).exists() {
        return Ok(String::new());
    }

    let has_head = Command::new("git")
        .args(["-C", repo_path, "rev-parse", "--verify", "HEAD"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let mut result = String::new();

    if has_head {
        if let Ok(output) = Command::new("git")
            .args(["-C", repo_path, "diff", "HEAD"])
            .output()
        {
            result.push_str(&String::from_utf8_lossy(&output.stdout));
        }
    } else {
        if let Ok(output) = Command::new("git")
            .args(["-C", repo_path, "diff", "--cached"])
            .output()
        {
            result.push_str(&String::from_utf8_lossy(&output.stdout));
        }
        if let Ok(output) = Command::new("git")
            .args(["-C", repo_path, "diff"])
            .output()
        {
            result.push_str(&String::from_utf8_lossy(&output.stdout));
        }
    }

    if let Ok(untracked_output) = Command::new("git")
        .args(["-C", repo_path, "ls-files", "--others", "--exclude-standard"])
        .output()
    {
        for file_path in String::from_utf8_lossy(&untracked_output.stdout).lines() {
            let full_path = format!("{}/{}", repo_path, file_path);
            if let Ok(content) = std::fs::read_to_string(&full_path) {
                let line_count = content.lines().count();
                if line_count > 0 {
                    result.push_str(&format!("diff --git a/{} b/{}\n", file_path, file_path));
                    result.push_str("new file mode 100644\n");
                    result.push_str("--- /dev/null\n");
                    result.push_str(&format!("+++ b/{}\n", file_path));
                    result.push_str(&format!("@@ -0,0 +1,{} @@\n", line_count));
                    for line in content.lines() {
                        result.push_str(&format!("+{}\n", line));
                    }
                }
            }
        }
    }

    Ok(result)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub diff: String,
}

pub fn get_structured_diff(repo_path: &str) -> Result<Vec<FileDiff>> {
    if !std::path::Path::new(repo_path).exists() {
        return Ok(vec![]);
    }

    let full = get_full_diff(repo_path)?;

    let mut files = Vec::new();
    let mut current = String::new();
    let mut in_diff = false;

    for line in full.lines() {
        if line.starts_with("diff --git") {
            if in_diff && !current.is_empty() {
                if let Some(fd) = parse_single_file_diff(&current) {
                    files.push(fd);
                }
            }
            current.clear();
            in_diff = true;
        }
        if in_diff {
            current.push_str(line);
            current.push('\n');
        }
    }
    if in_diff && !current.is_empty() {
        if let Some(fd) = parse_single_file_diff(&current) {
            files.push(fd);
        }
    }

    Ok(files)
}

fn parse_single_file_diff(diff: &str) -> Option<FileDiff> {
    let first_line = diff.lines().next()?;

    let path = first_line
        .strip_prefix("diff --git a/")?
        .split_whitespace()
        .next()?
        .to_string();

    let status = if diff.contains("new file mode") || diff.contains("--- /dev/null\n") {
        "added"
    } else if diff.contains("deleted file mode") || diff.contains("+++ /dev/null\n") {
        "deleted"
    } else {
        "modified"
    };

    let additions = diff.lines()
        .filter(|l| l.starts_with('+') && !l.starts_with("+++ "))
        .count();
    let deletions = diff.lines()
        .filter(|l| l.starts_with('-') && !l.starts_with("--- "))
        .count();

    Some(FileDiff {
        path,
        status: status.to_string(),
        additions,
        deletions,
        diff: diff.to_string(),
    })
}

pub fn stage_and_commit_to_branch(repo_path: &str, message: &str, branch_name: &str) -> Result<String> {
    let repo = Repository::open(repo_path)?;
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

    let branch_ref = format!("refs/heads/{}", branch_name);
    let parent_commit = repo
        .find_reference(&branch_ref)
        .ok()
        .and_then(|r| r.peel_to_commit().ok());

    let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

    let commit_oid = repo.commit(
        Some(&branch_ref),
        &sig,
        &sig,
        message,
        &tree,
        &parents,
    )?;

    Ok(commit_oid.to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub message: String,
    pub timestamp: i64,
}

pub fn get_commit_history(repo_path: &str, max_count: usize, branch_name: &str) -> Result<Vec<CommitInfo>> {
    if !std::path::Path::new(repo_path).exists() {
        return Ok(vec![]);
    }
    let repo = Repository::open(repo_path)?;
    let mut revwalk = repo.revwalk()?;
    let branch_ref = format!("refs/heads/{}", branch_name);

    if repo.find_reference(&branch_ref).is_ok() {
        revwalk.push_ref(&branch_ref)?;
    } else {
        revwalk.push_head()?;
    }
    revwalk.set_sorting(Sort::TIME)?;

    let mut commits = Vec::new();
    for (i, oid) in revwalk.enumerate() {
        if i >= max_count { break; }
        let oid = oid?;
        let commit = repo.find_commit(oid)?;
        commits.push(CommitInfo {
            hash: oid.to_string(),
            short_hash: oid.to_string()[..7].to_string(),
            author: commit.author().name().unwrap_or("unknown").to_string(),
            message: commit.message().unwrap_or("").trim().to_string(),
            timestamp: commit.time().seconds(),
        });
    }
    Ok(commits)
}

pub fn get_commit_diff(worktree_path: &str, commit_hash: &str) -> Result<String> {
    if !std::path::Path::new(worktree_path).exists() {
        return Ok(String::new());
    }
    let repo = Repository::open(worktree_path)?;
    let oid = commit_hash.parse::<Oid>()?;
    let commit = repo.find_commit(oid)?;
    let tree = commit.tree()?;

    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0)?.tree()?)
    } else {
        None
    };

    let mut diff_opts = DiffOptions::new();
    let diff = repo.diff_tree_to_tree(
        parent_tree.as_ref(),
        Some(&tree),
        Some(&mut diff_opts),
    )?;

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

pub fn push_branch(repo_path: &str, branch_name: &str, token: &str) -> Result<()> {
    let repo   = Repository::open(repo_path)?;

    let mut remote = repo.find_remote("origin")?;

    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

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
