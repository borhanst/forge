# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Forge is a Tauri v2 desktop application that provides a GUI for running AI coding agents (Claude Code, OpenAI Codex, Google Gemini) against git repositories. Each agent session runs in an isolated git worktree. The app streams agent output in real time, shows git diffs, and supports commit/push and GitHub PR creation.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 7, state via Zustand
- **Backend**: Rust (Tauri v2), SQLite via sqlx, git operations via git2, async via Tokio
- **IPC**: Tauri commands (`#[tauri::command]`) + real-time events (`app.emit()`)

## Commands

```bash
# Development (hot-reload Vite + Tauri window)
npm run tauri dev

# Production build (TypeScript check + Vite build + Cargo build + bundle)
npm run tauri build

# Frontend only (no Tauri backend)
npm run dev          # Vite dev server on port 1420
npm run build        # tsc && vite build

# Backend only
cd src-tauri && cargo build
```

No test framework or linter is configured. TypeScript strict mode provides compile-time checks.

## Architecture

### Backend (src-tauri/src/)

- **`main.rs`** — Tauri app builder, registers all commands
- **`state.rs`** — `AppState` holds the SQLite pool and a map of running agent processes
- **`agent_runner.rs`** — Spawns agent CLI processes, streams stdout/stderr as Tauri events, persists output to SQLite
- **`providers/`** — `AgentProvider` trait with implementations for Claude, Codex, Gemini, and Mock. Each defines `build_command()` (binary + args) and `is_available()` (checks PATH via `which`)
- **`commands/`** — Tauri command handlers organized by domain: `workspace.rs`, `repository.rs`, `git.rs`, `github.rs`
- **`services/`** — Business logic: `git_service.rs` (clone, worktree, diff, commit, push via git2), `github_client.rs` (REST API for PRs), `workspace_service.rs` (CRUD with random city-name worktree branches)
- **`db/`** — SQLite init (WAL mode), inline migrations (`CREATE TABLE IF NOT EXISTS`), schema structs. Five tables: repositories, workspaces, sessions, output_lines, pull_requests

### Frontend (src/)

- **`lib/tauri.ts`** — Typed wrappers around Tauri `invoke()` and `listen()`
- **`store/index.ts`** — Zustand global state (repos, workspaces, providers, agent outputs, running agents)
- **`hooks/`** — `useAgentEvents` (subscribes to agent:output/status events), `useGitStatus` (polls every 5s)
- **`components/`** — `Sidebar` (repo tree + workspace list), `MainPanel` (terminal + prompt), `Terminal` (agent output rendering), `DiffViewer` (unified diff parser), `PRPanel` (commit/push/PR creation), `AddRepoModal`

### Key Patterns

- **Worktree isolation**: Each workspace gets a git worktree on branch `forge/<random-city-name>` under `<repo>/.forge-worktrees/`
- **Agent lifecycle**: `run_agent` spawns CLI process, streams output via events, cancellation via `oneshot::channel` drop + `kill_on_drop(true)`
- **GitHub auth**: Token stored in OS keychain via `keyring` crate; used for git push (`x-access-token` auth) and PR creation

## Dev Database

SQLite database at `/tmp/forge.db` (configured in `src-tauri/.env`). Schema is in `src-tauri/schema.sql` and applied at startup via `db/migrations.rs`.

## Known Quirk

`src-tauri/src/services/agent_manager.rs` has a hardcoded binary path for Gemini that only works on the original developer's machine. The primary agent runner used by commands is `agent_runner.rs`, not this file.
