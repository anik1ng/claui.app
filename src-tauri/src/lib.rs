mod claude;
mod pty;
mod state;
mod ipc;

use state::AppState;

// `.expect()` on the Tauri builder is deliberate: a failure to build or run
// the app is fatal and unrecoverable — there is no UI left to report it to.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::expect_used)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            ipc::get_last_project,
            ipc::open_project,
            ipc::open_command_terminal,
            ipc::pty_input,
            ipc::pty_resize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
