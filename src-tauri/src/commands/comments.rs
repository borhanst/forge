use tauri::{AppHandle, Emitter, State};
use crate::state::AppState;
use crate::db::schema::LineComment;
use chrono::Utc;

#[tauri::command]
pub async fn add_line_comment(
    app:          AppHandle,
    state:        State<'_, AppState>,
    workspace_id: String,
    file_path:    String,
    line_number:  i64,
    content:      String,
) -> Result<i64, String> {
    let now = Utc::now().naive_utc();
    let result = sqlx::query!(
        "INSERT INTO line_comments (workspace_id, file_path, line_number, content, author, created_at) VALUES (?, ?, ?, ?, 'User', ?)",
        workspace_id, file_path, line_number, content, now
    )
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let _ = app.emit("line_comment:added", ());
    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn get_line_comments(
    state:        State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<LineComment>, String> {
    sqlx::query_as!(
        LineComment,
        "SELECT id, workspace_id, file_path, line_number, content, author, created_at FROM line_comments WHERE workspace_id = ? ORDER BY created_at ASC",
        workspace_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_line_comment(
    app:  AppHandle,
    state: State<'_, AppState>,
    id:   i64,
) -> Result<(), String> {
    sqlx::query!("DELETE FROM line_comments WHERE id = ?", id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("line_comment:deleted", id);
    Ok(())
}
