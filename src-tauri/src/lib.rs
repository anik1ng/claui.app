mod claude;
mod ipc;
mod menu;
mod pty;
mod sessions;
mod state;
mod statusline;

use state::AppState;

// `.expect()` on the Tauri builder is deliberate: a failure to build or run
// the app is fatal and unrecoverable — there is no UI left to report it to.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::expect_used)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            menu::init(app)?;
            if let Err(e) = statusline::install_wrapper() {
                eprintln!("claui: failed to install the statusline wrapper: {e}");
            }
            if let Err(e) = statusline::start_watcher(app.handle().clone()) {
                eprintln!("claui: statusline watcher failed to start: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::get_last_project,
            ipc::open_project,
            ipc::open_command_terminal,
            ipc::pty_input,
            ipc::pty_resize,
            ipc::pty_close,
            ipc::list_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
