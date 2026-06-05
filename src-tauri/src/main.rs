#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod providers;
mod services;
mod state;
mod agent_runner;

use tauri::Manager;
use state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            let app_data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("failed to get app data dir")
                .to_string_lossy()
                .to_string();

            tracing::info!("App data dir: {}", app_data_dir);

            let db = tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(db::init(&app_data_dir))
                    .expect("failed to initialize database")
            });

            let state = AppState::new(db, app_data_dir);
            app.manage(state);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Best-effort cleanup of any PTY-backed shells. Even if the
                // async task doesn't finish before the process exits, the OS
                // will reap child PTY processes on parent death.
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(state) = app.try_state::<AppState>() {
                        crate::services::terminal_service::kill_all(&state.terminals).await;
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::list_providers,

            commands::list_repositories,
            commands::list_workspaces,
            commands::list_archived_workspaces,
            commands::add_repo_local,
            commands::add_repo_clone,
            commands::remove_repo,
            commands::create_workspace,
            commands::archive_workspace,
            commands::restore_workspace,
            commands::delete_workspace,
            commands::update_workspace_provider,
            commands::update_workspace_config,

            commands::run_agent,
            commands::stop_agent,
            commands::get_session_output,
            commands::get_latest_session,
            commands::list_running_agents,
            commands::get_resolved_path,
            commands::refresh_shell_env,
            commands::debug_path,
            commands::install_provider,

            commands::add_line_comment,
            commands::get_line_comments,
            commands::delete_line_comment,

            commands::get_git_status,
            commands::list_branches,
            commands::get_diff,
            commands::get_structured_diff,
            commands::get_commit_history,
            commands::get_commit_diff,
            commands::commit_and_push,
            commands::save_github_token,
            commands::update_workspace_merge_settings,
            commands::merge_worktree,
            commands::resolve_and_finish_merge,
            commands::has_github_token,
            commands::delete_github_token,
            commands::get_github_user,
            commands::create_pr,
            commands::get_pr_status,

            commands::terminal_open,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_close,
            commands::terminal_attach,

            commands::get_app_settings,
            commands::update_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Forge");
}
