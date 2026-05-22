use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::pty::PtySession;
use crate::state::AppState;

#[derive(Clone, Serialize)]
struct ExitPayload {
    id: u32,
    code: i32,
}

/// Path of the file that remembers the last opened project.
fn config_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("last_project.txt"))
}

#[tauri::command]
pub fn get_last_project(app: AppHandle) -> Option<String> {
    let path = config_file(&app)?;
    let text = std::fs::read_to_string(path).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() || !PathBuf::from(trimmed).is_dir() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[tauri::command]
pub fn open_project(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    on_output: Channel<Vec<u8>>,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    let Some(claude) = crate::claude::locate() else {
        let _ = app.emit("claude:not-found", ());
        return Err("claude binary not found".into());
    };

    // Spawn first; persist the project only once the terminal actually started.
    let id = spawn_terminal(
        &app,
        &state,
        claude.to_string_lossy().as_ref(),
        &[],
        Some(&path),
        cols,
        rows,
        on_output,
    )?;

    state.set_project(PathBuf::from(&path));
    if let Some(file) = config_file(&app) {
        if let Some(dir) = file.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&file, &path);
    }
    if let Some(window) = app.get_webview_window("main") {
        let name = PathBuf::from(&path)
            .file_name()
            .map_or_else(|| path.clone(), |n| n.to_string_lossy().into_owned());
        let _ = window.set_title(&format!("claui — {name}"));
    }
    Ok(id)
}

#[tauri::command]
pub fn open_command_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    on_output: Channel<Vec<u8>>,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    spawn_terminal(&app, &state, &shell, &["-l"], None, cols, rows, on_output)
}

/// Spawn a PTY, wire its output to `on_output`, register it, and emit
/// `terminal:exit` when the child terminates.
// Eight parameters: a thin spawn-and-register wrapper that forwards six of
// them straight to `PtySession::spawn` and adds `app`/`state` for the exit
// event and registry insertion. Bundling them into a struct would only
// relocate the same surface, not reduce it.
#[allow(clippy::too_many_arguments)]
fn spawn_terminal(
    app: &AppHandle,
    state: &AppState,
    program: &str,
    args: &[&str],
    cwd: Option<&str>,
    cols: u16,
    rows: u16,
    on_output: Channel<Vec<u8>>,
) -> Result<u32, String> {
    let id = state.alloc_id();
    let exit_app = app.clone();
    let session = PtySession::spawn(
        program,
        args,
        cwd,
        cols,
        rows,
        move |bytes| {
            let _ = on_output.send(bytes.to_vec());
        },
        move |code| {
            let _ = exit_app.emit("terminal:exit", ExitPayload { id, code });
        },
    )
    .map_err(|e| e.to_string())?;
    state.insert(id, session);
    Ok(id)
}

#[tauri::command]
pub fn pty_input(state: State<'_, AppState>, id: u32, data: String) {
    state.write_input(id, data.as_bytes());
}

#[tauri::command]
pub fn pty_resize(state: State<'_, AppState>, id: u32, cols: u16, rows: u16) {
    state.resize(id, cols, rows);
}
