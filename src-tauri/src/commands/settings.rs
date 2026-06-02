use tauri::State;
use crate::db::schema::AppSettings;
use crate::services::settings_service;
use crate::state::AppState;

#[tauri::command]
pub async fn get_app_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let pool = state.db.clone();
    settings_service::load(&pool)
        .await
        .map_err(|e| format!("failed to load settings: {e}"))
}

#[tauri::command]
pub async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = state.db.clone();
    settings_service::save(&pool, &settings)
        .await
        .map_err(|e| format!("failed to save settings: {e}"))
}
