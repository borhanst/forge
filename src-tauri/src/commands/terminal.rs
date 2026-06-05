use tauri::State;
use crate::db::schema::Workspace;
use crate::services::terminal_service;
use crate::state::AppState;

/// Fetch the worktree path for a workspace. Returns an error if the workspace is missing.
async fn fetch_worktree_path(
    state: &State<'_, AppState>,
    workspace_id: &str,
) -> Result<String, String> {
    let ws = sqlx::query_as!(
        Workspace,
        "SELECT id, repo_id, city_name, branch, worktree_path, provider, provider_config, status, created_at, archived_at, merge_push, merge_cleanup FROM workspaces WHERE id = ?",
        workspace_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| format!("Workspace not found: {}", e))?;
    Ok(ws.worktree_path)
}

/// Open (or re-attach to) a PTY-backed shell for the given workspace. Idempotent.
#[tauri::command]
pub async fn terminal_open(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    let worktree_path = fetch_worktree_path(&state, &workspace_id).await?;
    terminal_service::spawn(
        app,
        state.terminals.clone(),
        workspace_id,
        worktree_path,
        state.shell_env_snapshot(),
    )
    .await
    .map_err(|e| e.to_string())
}

/// Write data to the PTY's stdin. `data_b64` is base64-encoded bytes.
#[tauri::command]
pub async fn terminal_write(
    state: State<'_, AppState>,
    workspace_id: String,
    data_b64: String,
) -> Result<(), String> {
    terminal_service::write(&state.terminals, &workspace_id, &data_b64)
        .await
        .map_err(|e| e.to_string())
}

/// Resize the PTY to (cols, rows).
#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    workspace_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terminal_service::resize(&state.terminals, &workspace_id, cols, rows)
        .await
        .map_err(|e| e.to_string())
}

/// Close the PTY for a workspace. Idempotent.
#[tauri::command]
pub async fn terminal_close(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    terminal_service::close(&state.terminals, &workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// Returns attach info (scrollback + is_running) or None if no terminal session exists.
#[tauri::command]
pub async fn terminal_attach(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Option<terminal_service::TerminalAttachInfo>, String> {
    terminal_service::attach_replay(&state.terminals, &workspace_id)
        .await
        .map_err(|e| e.to_string())
}
