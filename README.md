# Forge

Forge is a [Tauri v2](https://v2.tauri.app) desktop application — a Rust-powered framework that compiles to native binaries with a web frontend — that provides a GUI for running AI coding agents (Claude Code, OpenAI Codex, Google Gemini) against git repositories. Each agent session runs in an isolated git worktree with real-time output streaming, git diff visualization, and support for commit/push and GitHub PR creation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite 7, Zustand |
| Backend | Rust, Tauri v2, Tokio (async) |
| Database | SQLite via sqlx with WAL mode |
| Git | git2 (libgit2 bindings) |
| Auth | OS keychain via keyring |
| HTTP | reqwest (with rustls) |
| Agent providers | Claude Code, OpenAI Codex, Google Gemini |

## Architecture

1. **IPC-driven Tauri commands** — Rust backend exposes `#[tauri::command]` handlers organized by domain (workspace, repository, git, github) with typed wrappers on the frontend via `invoke()` and real-time `listen()` events.

2. **Worktree isolation** — Each agent workspace lives in a `forge/<random-city-name>` git worktree under `<repo>/.forge-worktrees/`, keeping sessions fully separate.

3. **Agent process lifecycle** — `agent_runner.rs` spawns provider CLIs with `build_command()`, streams stdout/stderr as Tauri events, and supports cancellation via `oneshot::channel` drop with `kill_on_drop(true)`.

4. **Pluggable providers** — `AgentProvider` trait with implementations for Claude, Codex, Gemini, and Mock. Each defines its own binary + args and availability check via `which`.

5. **Service layer** — Business logic lives in `services/`: `git_service.rs` (libgit2 operations), `workspace_service.rs` (CRUD with random branch names), `github_client.rs` (REST API for PRs), and `agent_manager.rs` (legacy runner).
