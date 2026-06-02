use git2::{Repository, BranchType, StatusOptions, DiffFormat, DiffOptions, Signature, Oid, Sort};
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

/// Create a standalone worktree repo via `git clone --shared`.
/// This avoids git's linked worktree mechanism entirely, so there's no stale
/// metadata in the main repo and no `.git` symlink confusion for agents.
pub fn clone_shared_worktree(
    main_repo_path: &str,
    worktree_path: &str,
    branch_name: &str,
    remote_url: Option<&str>,
) -> Result<()> {
    let path = std::path::Path::new(worktree_path);

    // Already a standalone repo
    if path.join(".git").is_dir() {
        return Ok(());
    }

    // Remove stale directory (e.g., from a previous linked worktree)
    if path.exists() {
        std::fs::remove_dir_all(worktree_path)
            .with_context(|| format!("Failed to remove stale worktree path: {}", worktree_path))?;
    }

    // Create parent directory
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create parent directory for worktree"))?;
    }

    // Clone --shared from the main repo (shares objects, no disk duplication)
    let output = Command::new("git")
        .args(["clone", "--shared", main_repo_path, worktree_path])
        .output()
        .context("Failed to execute git clone --shared")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("git clone --shared failed: {}", stderr.trim()));
    }

    // Create the worktree branch from current HEAD
    let checkout_output = Command::new("git")
        .args(["-C", worktree_path, "checkout", "-b", branch_name])
        .output()
        .context("Failed to create worktree branch")?;

    if !checkout_output.status.success() {
        let stderr = String::from_utf8_lossy(&checkout_output.stderr);
        return Err(anyhow::anyhow!(
            "Failed to create branch {}: {}",
            branch_name, stderr.trim()
        ));
    }

    // Update remote URL if we have a GitHub URL
    if let Some(url) = remote_url.filter(|u| !u.is_empty()) {
        let _ = Command::new("git")
            .args(["-C", worktree_path, "remote", "set-url", "origin", url])
            .output();
    }

    Ok(())
}

/// Convert a git-linked worktree into a standalone git repo.
/// Only needed for legacy workspaces created before the clone-based approach.
pub fn ensure_worktree_as_bare_repo(
    worktree_path: &str,
    main_repo_path: &str,
    remote_url: Option<&str>,
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

    // Determine the best remote URL: try GitHub first, then local main repo
    let origin_url = remote_url.filter(|u| !u.is_empty()).unwrap_or(main_repo_path);

    // Add remote
    let _ = Command::new("git")
        .args(["-C", worktree_path, "remote", "add", "origin", origin_url])
        .output();

    // Try to fetch the branch from origin (preserves commit history)
    let fetched = Command::new("git")
        .args(["-C", worktree_path, "fetch", "origin", branch_name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if fetched {
        // Branch exists on remote — check it out
        let _ = Command::new("git")
            .args(["-C", worktree_path, "checkout", branch_name])
            .output();
    } else {
        // No remote history — create an initial commit with all files so the
        // worktree has a proper git state (HEAD pointing at the branch)
        let _ = Command::new("git")
            .args(["-C", worktree_path, "checkout", "-b", branch_name])
            .output();
        let _ = Command::new("git")
            .args(["-C", worktree_path, "add", "-A"])
            .output();
        let _ = Command::new("git")
            .args(["-C", worktree_path, "commit", "--allow-empty", "-m", "Initial workspace snapshot"])
            .output();
    }

    Ok(())
}

pub fn remove_worktree(_repo_path: &str, worktree_path: &str) -> Result<()> {
    let _ = std::fs::remove_dir_all(worktree_path);
    Ok(())
}

/// Ensure `.forge-worktrees` is in the repo's `.gitignore` so git ignores any
/// leftover worktree directories inside the main repo (from workspaces created
/// before Forge moved worktrees outside the repo tree).
pub fn gitignore_forge_worktrees(repo_path: &str) {
    let gitignore_path = std::path::Path::new(repo_path).join(".gitignore");
    let entry = ".forge-worktrees\n";

    let content = std::fs::read_to_string(&gitignore_path).unwrap_or_default();
    if !content.lines().any(|l| l.trim() == ".forge-worktrees") {
        let _ = std::fs::write(&gitignore_path, format!("{}{}", content, entry));
    }
}

pub fn default_branch(repo_path: &str) -> Result<String> {
    let repo = Repository::open(repo_path)?;
    let head = repo.head()?;
    Ok(head.shorthand().unwrap_or("main").to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_default: bool,
}

pub fn list_local_branches(repo_path: &str) -> Result<Vec<BranchInfo>> {
    let repo = Repository::open(repo_path)?;
    let default = default_branch(repo_path).unwrap_or_default();

    let branches = repo.branches(Some(BranchType::Local))?
        .filter_map(|b| b.ok())
        .map(|(branch, _)| {
            let name = branch.name().ok().flatten().unwrap_or("").to_string();
            BranchInfo {
                is_default: name == default,
                name,
            }
        })
        .filter(|b| !b.name.starts_with("forge/"))
        .collect();

    Ok(branches)
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

/// Merge `source_branch` into `target_branch` without touching the **main repo's**
/// working tree (this is the property that keeps Vite HMR from reloading during a merge).
///
/// Implementation: the merge is performed inside `worktree_path`, which is briefly
/// flipped to a throwaway branch `__forge_target_<target>` and then restored to
/// `source_branch`. The resulting commit is imported back into `main_repo_path`
/// via `git fetch <worktree_path> refs/heads/<tmp>:refs/forge-tmp/<target>` followed
/// by `git update-ref refs/heads/<target>` — the main repo's HEAD/working tree is
/// never checked out or touched.
///
/// Requires the worktree to have no uncommitted changes (callers should verify
/// this upstream via `get_changed_files`). Works with or without an `origin` remote.
/// Returns the list of conflicted file paths (empty Vec on a successful merge).
pub fn merge_into_branch_no_checkout(
    main_repo_path: &str,
    worktree_path: &str,
    source_branch: &str,
    target_branch: &str,
) -> Result<Vec<String>> {
    // Fetch the target branch from the main repo into the worktree clone
    let fetch_out = Command::new("git")
        .args(["-C", worktree_path, "fetch", "origin", target_branch])
        .output()
        .context("Failed to fetch target branch")?;
    if !fetch_out.status.success() {
        // origin may be the local main repo path — try fetching directly
        let fetch_out2 = Command::new("git")
            .args(["-C", worktree_path, "fetch", main_repo_path, target_branch])
            .output()
            .context("Failed to fetch target branch from main repo")?;
        if !fetch_out2.status.success() {
            return Err(anyhow::anyhow!(
                "fetch target branch failed: {}",
                String::from_utf8_lossy(&fetch_out2.stderr).trim()
            ));
        }
    }

    // Create/reset a local tracking branch for target in the worktree
    let track_ref = format!("refs/heads/__forge_target_{}", target_branch.replace('/', "_"));
    let fetch_head = format!("origin/{}", target_branch);
    // Try origin/target first, fall back to FETCH_HEAD
    let base_ref = {
        let check = Command::new("git")
            .args(["-C", worktree_path, "rev-parse", "--verify", &fetch_head])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if check { fetch_head.clone() } else { "FETCH_HEAD".to_string() }
    };

    // Reset the temp target branch to the fetched state
    let update_out = Command::new("git")
        .args(["-C", worktree_path, "update-ref", &track_ref, &base_ref])
        .output()
        .context("Failed to update target ref")?;
    if !update_out.status.success() {
        return Err(anyhow::anyhow!(
            "update-ref failed: {}",
            String::from_utf8_lossy(&update_out.stderr).trim()
        ));
    }

    let tmp_branch = format!("__forge_target_{}", target_branch.replace('/', "_"));

    // Checkout the temp target branch in the worktree
    let co_out = Command::new("git")
        .args(["-C", worktree_path, "checkout", &tmp_branch])
        .output()
        .context("Failed to checkout temp target branch")?;
    if !co_out.status.success() {
        return Err(anyhow::anyhow!(
            "checkout failed: {}",
            String::from_utf8_lossy(&co_out.stderr).trim()
        ));
    }

    // Merge the forge (source) branch into the temp target branch
    let merge_out = Command::new("git")
        .args(["-C", worktree_path, "merge", source_branch])
        .output()
        .context("Failed to merge")?;

    if merge_out.status.success() {
        // Cleanup temp branch first (checkout back to source)
        let _ = Command::new("git").args(["-C", worktree_path, "checkout", source_branch]).output();

        // Fetch the tmp_branch into a temp ref namespace in the main repo.
        // refs/forge-tmp/* is never checked out so git allows this fetch unconditionally.
        let tmp_ref = format!("refs/forge-tmp/{}", target_branch.replace('/', "_"));
        let fetch_refspec = format!("refs/heads/{}:{}", tmp_branch, tmp_ref);
        let fetch_out = Command::new("git")
            .args(["-C", main_repo_path, "fetch", worktree_path, &fetch_refspec])
            .output()
            .context("Failed to fetch merge result into main repo")?;

        // Cleanup worktree temp branch
        let _ = Command::new("git").args(["-C", worktree_path, "branch", "-D", &tmp_branch]).output();

        if !fetch_out.status.success() {
            return Err(anyhow::anyhow!(
                "fetch objects failed: {}",
                String::from_utf8_lossy(&fetch_out.stderr).trim()
            ));
        }

        // Now the commit exists in the main repo — point the real branch at it
        let target_ref = format!("refs/heads/{}", target_branch);
        let update_out = Command::new("git")
            .args(["-C", main_repo_path, "update-ref", &target_ref, &tmp_ref])
            .output()
            .context("Failed to update branch ref in main repo")?;
        // Always delete the temp ref
        let _ = Command::new("git")
            .args(["-C", main_repo_path, "update-ref", "-d", &tmp_ref])
            .output();
        if !update_out.status.success() {
            return Err(anyhow::anyhow!(
                "update-ref failed: {}",
                String::from_utf8_lossy(&update_out.stderr).trim()
            ));
        }
        return Ok(vec![]);
    }

    let stderr = String::from_utf8_lossy(&merge_out.stderr);
    if stderr.contains("CONFLICT") || stderr.contains("conflict") {
        let conflict_out = Command::new("git")
            .args(["-C", worktree_path, "diff", "--name-only", "--diff-filter=U"])
            .output()
            .context("Failed to list conflicted files")?;
        let files: Vec<String> = String::from_utf8_lossy(&conflict_out.stdout)
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect();
        let _ = Command::new("git")
            .args(["-C", worktree_path, "merge", "--abort"])
            .output();
        // Cleanup temp branch
        let _ = Command::new("git")
            .args(["-C", worktree_path, "checkout", source_branch])
            .output();
        let _ = Command::new("git")
            .args(["-C", worktree_path, "branch", "-D", &tmp_branch])
            .output();
        return Ok(files);
    }

    // Cleanup temp branch on error too
    let _ = Command::new("git")
        .args(["-C", worktree_path, "checkout", source_branch])
        .output();
    let _ = Command::new("git")
        .args(["-C", worktree_path, "branch", "-D", &tmp_branch])
        .output();
    Err(anyhow::anyhow!("Merge failed: {}", stderr.trim()))
}

pub fn checkout_branch(repo_path: &str, branch_name: &str) -> Result<()> {
    let output = Command::new("git")
        .args(["-C", repo_path, "checkout", branch_name])
        .output()
        .with_context(|| format!("Failed to checkout {}", branch_name))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("git checkout failed: {}", stderr.trim()));
    }
    Ok(())
}

pub fn merge_branch(repo_path: &str, source_branch: &str) -> Result<Vec<String>> {
    let output = Command::new("git")
        .args(["-C", repo_path, "merge", source_branch])
        .output()
        .with_context(|| format!("Failed to merge {}", source_branch))?;

    if output.status.success() {
        return Ok(vec![]);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);

    // Check for conflicts
    if stderr.contains("CONFLICT") || stderr.contains("conflict") {
        // Get conflicting files
        let conflict_output = Command::new("git")
            .args(["-C", repo_path, "diff", "--name-only", "--diff-filter=U"])
            .output()
            .with_context(|| "Failed to list conflicted files")?;

        if conflict_output.status.success() {
            let files: Vec<String> = String::from_utf8_lossy(&conflict_output.stderr)
                .lines()
                .filter(|l| !l.is_empty())
                .map(|l| l.to_string())
                .collect();
            // Also check stdout
            let stdout_files: Vec<String> = String::from_utf8_lossy(&conflict_output.stdout)
                .lines()
                .filter(|l| !l.is_empty())
                .map(|l| l.to_string())
                .collect();
            let mut all = files;
            all.extend(stdout_files);
            if !all.is_empty() {
                abort_merge(repo_path)?;
                return Ok(all);
            }
        }
    }

    abort_merge(repo_path)?;
    Err(anyhow::anyhow!("Merge failed: {}", stderr.trim()))
}

pub fn abort_merge(repo_path: &str) -> Result<()> {
    let _ = Command::new("git")
        .args(["-C", repo_path, "merge", "--abort"])
        .output();
    Ok(())
}

/// Like merge_branch but does NOT abort on conflict — leaves the repo in MERGING state.
pub fn merge_no_abort(repo_path: &str, source_branch: &str) -> Result<Vec<String>> {
    let output = Command::new("git")
        .args(["-C", repo_path, "merge", source_branch])
        .output()
        .with_context(|| format!("Failed to merge {}", source_branch))?;

    if output.status.success() {
        return Ok(vec![]);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("CONFLICT") || stderr.contains("conflict") {
        let conflict_output = Command::new("git")
            .args(["-C", repo_path, "diff", "--name-only", "--diff-filter=U"])
            .output()
            .with_context(|| "Failed to list conflicted files")?;

        let mut all = Vec::new();
        if conflict_output.status.success() {
            for src in [&conflict_output.stdout, &conflict_output.stderr] {
                for line in String::from_utf8_lossy(src).lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        all.push(trimmed.to_string());
                    }
                }
            }
        }
        if !all.is_empty() {
            return Ok(all);
        }
    }

    Err(anyhow::anyhow!("Merge failed: {}", stderr.trim()))
}

pub fn list_unmerged_files(repo_path: &str) -> Result<Vec<String>> {
    let output = Command::new("git")
        .args(["-C", repo_path, "diff", "--name-only", "--diff-filter=U"])
        .output()
        .with_context(|| "Failed to list unmerged files")?;

    let mut files = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            files.push(trimmed.to_string());
        }
    }
    Ok(files)
}

pub fn stage_all(repo_path: &str) -> Result<()> {
    let output = Command::new("git")
        .args(["-C", repo_path, "add", "-A"])
        .output()
        .with_context(|| "Failed to stage files")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("git add -A failed: {}", stderr.trim()));
    }
    Ok(())
}

pub fn commit(repo_path: &str, message: &str) -> Result<String> {
    let output = Command::new("git")
        .args(["-C", repo_path, "commit", "-m", message])
        .output()
        .with_context(|| "Failed to commit")?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If nothing to commit, that's fine
        if stderr.contains("nothing to commit") {
            return Ok("nothing to commit".to_string());
        }
        Err(anyhow::anyhow!("git commit failed: {}", stderr.trim()))
    }
}

pub fn branch_exists(repo_path: &str, branch_name: &str) -> Result<bool> {
    let output = Command::new("git")
        .args(["-C", repo_path, "rev-parse", "--verify", &format!("refs/heads/{}", branch_name)])
        .output()?;
    Ok(output.status.success())
}

pub fn delete_local_branch(repo_path: &str, branch_name: &str) -> Result<()> {
    let output = Command::new("git")
        .args(["-C", repo_path, "branch", "-D", branch_name])
        .output()
        .with_context(|| format!("Failed to delete branch {}", branch_name))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!("git branch -D {} failed: {}", branch_name, stderr.trim());
    }
    Ok(())
}

pub fn delete_remote_branch(repo_path: &str, branch_name: &str, token: &str) -> Result<()> {
    let repo = Repository::open(repo_path)?;
    let mut remote = repo.find_remote("origin")?;

    let refspec = format!(":refs/heads/{}", branch_name);

    let mut push_opts = git2::PushOptions::new();
    let mut callbacks = git2::RemoteCallbacks::new();

    let token_clone = token.to_string();
    callbacks.credentials(move |_url, _username, _allowed| {
        git2::Cred::userpass_plaintext("x-access-token", &token_clone)
    });

    push_opts.remote_callbacks(callbacks);
    let _ = remote.push(&[&refspec], Some(&mut push_opts));
    Ok(())
}

/// Push a branch using git CLI (uses user's configured git credentials — SSH, credential helper, etc.)
/// Returns Ok(()) silently if no remote is configured.
pub fn push_branch_cli(repo_path: &str, branch_name: &str) -> Result<()> {
    // Check if a remote named "origin" exists
    let remote_check = Command::new("git")
        .args(["-C", repo_path, "remote", "get-url", "origin"])
        .output()
        .context("Failed to check remote")?;
    if !remote_check.status.success() {
        // No remote — nothing to push to
        return Ok(());
    }

    let output = Command::new("git")
        .args(["-C", repo_path, "push", "origin", branch_name])
        .output()
        .with_context(|| format!("Failed to push {} to origin", branch_name))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("git push failed: {}", stderr.trim()));
    }
    Ok(())
}

/// Delete remote branch using git CLI (uses user's configured git credentials)
/// Silently succeeds if no remote is configured.
pub fn delete_remote_branch_cli(repo_path: &str, branch_name: &str) -> Result<()> {
    let remote_check = Command::new("git")
        .args(["-C", repo_path, "remote", "get-url", "origin"])
        .output()
        .context("Failed to check remote")?;
    if !remote_check.status.success() {
        return Ok(());
    }

    let output = Command::new("git")
        .args(["-C", repo_path, "push", "origin", "--delete", branch_name])
        .output()
        .with_context(|| format!("Failed to delete remote branch {}", branch_name))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!("git push origin --delete {} failed: {}", branch_name, stderr.trim());
    }
    Ok(())
}

/// Push a branch from the worktree to its local origin (the main repo path, no auth needed)
pub fn push_local(repo_path: &str, branch_name: &str) -> Result<()> {
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

    // Try push via origin first
    let out = Command::new("git")
        .args(["-C", repo_path, "push", "origin", &refspec])
        .output()
        .with_context(|| format!("Failed to push {} to local origin", branch_name))?;

    if out.status.success() {
        return Ok(());
    }

    // Fallback: get the origin URL and push directly to it as a path
    let url_out = Command::new("git")
        .args(["-C", repo_path, "remote", "get-url", "origin"])
        .output()
        .context("Failed to get origin URL")?;

    if url_out.status.success() {
        let origin_path = String::from_utf8_lossy(&url_out.stdout).trim().to_string();
        let out2 = Command::new("git")
            .args(["-C", repo_path, "push", &origin_path, &refspec])
            .output()
            .with_context(|| format!("Failed to push {} to {}", branch_name, origin_path))?;
        if out2.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&out2.stderr);
        return Err(anyhow::anyhow!("git push to local origin failed: {}", stderr.trim()));
    }

    let stderr = String::from_utf8_lossy(&out.stderr);
    Err(anyhow::anyhow!("git push to local origin failed: {}", stderr.trim()))
}

pub fn fetch_branch(repo_path: &str, remote_name: &str, branch_name: &str) -> Result<()> {
    let output = Command::new("git")
        .args(["-C", repo_path, "fetch", remote_name, branch_name])
        .output()
        .with_context(|| format!("Failed to fetch {} from {}", branch_name, remote_name))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!("git fetch {} {} failed: {}", remote_name, branch_name, stderr.trim());
    }
    Ok(())
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
