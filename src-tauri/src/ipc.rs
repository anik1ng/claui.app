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

/// Build the env tuple passed to the spawned claude. Owned strings because
/// `CLAUI_STATUS_FILE` carries a per-project path generated at runtime — it
/// can't be a `&'static str`. `project_id` is only consulted when
/// `is_primary` is true; non-primary spawns get just `CLAUI_ACTIVE=1`.
///
/// `CLAUI_ACTIVE=1` tells the statusline wrapper it's running inside claui
/// (suppresses the chain to the user's real statusline command).
/// `CLAUI_PRIMARY=1` is set only on the primary claude of an open project —
/// the statusline wrapper writes the per-project status file for that PTY
/// only, so claui's status bar tracks a single source of truth per project
/// even with multiple claude tabs alive.
pub(crate) fn build_spawn_env(is_primary: bool, project_id: &str) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = vec![("CLAUI_ACTIVE".into(), "1".into())];
    if is_primary {
        env.push(("CLAUI_PRIMARY".into(), "1".into()));
        env.push((
            "CLAUI_STATUS_FILE".into(),
            crate::statusline::project_status_file_path(project_id)
                .to_string_lossy()
                .into_owned(),
        ));
    }
    env
}

// Tauri commands cross the JS↔Rust IPC boundary with each parameter
// independently typed. A config-struct refactor would force the webview to
// construct it in TypeScript and Tauri's `#[command]` macro shape doesn't
// make that ergonomic — the wide arg list is the load-bearing IPC contract.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn open_project(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    on_output: Channel<Vec<u8>>,
    cols: u16,
    rows: u16,
    resume_session_id: Option<String>,
    is_primary: bool,
    project_id: String,
) -> Result<u32, String> {
    let Some(claude) = crate::claude::locate() else {
        let _ = app.emit("claude:not-found", ());
        return Err("claude binary not found".into());
    };

    // Override claude's statusLine via project-local `.claude/settings.local.json` —
    // the only mechanism observed to win over the user-level setting. `--settings`
    // (both inline-JSON and file forms) does not propagate the statusLine override
    // to the spawned claude.
    if let Err(e) = crate::statusline::install_project_settings(std::path::Path::new(&path)) {
        eprintln!("claui: failed to write project-local statusline settings: {e}");
    }

    let mut args: Vec<&str> = Vec::new();
    if let Some(ref sid) = resume_session_id {
        args.push("--resume");
        args.push(sid.as_str());
    }

    let env = build_spawn_env(is_primary, &project_id);

    let claude = claude.to_string_lossy();
    spawn_terminal(
        &app,
        &state,
        claude.as_ref(),
        &args,
        Some(&path),
        &env,
        cols,
        rows,
        on_output,
    )
}

#[tauri::command]
pub fn open_command_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    on_output: Channel<Vec<u8>>,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let env: Vec<(String, String)> = vec![];
    spawn_terminal(
        &app,
        &state,
        &shell,
        &["-l"],
        Some(path.as_str()),
        &env,
        cols,
        rows,
        on_output,
    )
}

/// Spawn a PTY, wire its output to `on_output`, register it, and emit
/// `terminal:exit` when the child terminates.
// Nine parameters: a thin spawn-and-register wrapper that forwards seven of
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
    env: &[(String, String)],
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
        env,
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

#[tauri::command]
pub fn pty_close(state: State<'_, AppState>, id: u32) {
    state.close(id);
}

#[tauri::command]
pub fn list_sessions(path: String) -> Vec<crate::sessions::SessionInfo> {
    crate::sessions::list_sessions(&path)
}

/// Returns the persisted multi-project window state, or `None` if the file
/// is missing, malformed, has an unknown version, or all recorded project
/// paths are stale (i.e. no longer exist on disk).
#[tauri::command]
pub fn get_window_state(app: AppHandle) -> Option<crate::window_state::WindowState> {
    let path = window_state_file(&app)?;
    crate::window_state::load(&path)
}

/// Atomically write the multi-project window state to `window.json` in the
/// app config directory. Creates the directory if it is missing.
#[tauri::command]
pub fn save_window_state(
    app: AppHandle,
    state: crate::window_state::WindowState,
) -> Result<(), String> {
    let path = window_state_file(&app).ok_or("config dir unavailable")?;
    crate::window_state::save(&path, &state).map_err(|e| e.to_string())
}

/// Remove the per-project status file from `/tmp/claui/` when a project is
/// closed. Idempotent — succeeds if the file does not exist.
#[tauri::command]
pub fn cleanup_project_status(project_id: String) -> Result<(), String> {
    let path = crate::statusline::project_status_file_path(&project_id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Path of the `window.json` state file inside the app config directory.
fn window_state_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|d| d.join("window.json"))
}

#[cfg(test)]
mod tests {
    use super::build_spawn_env;

    #[test]
    fn build_spawn_env_marks_primary_with_status_file() {
        let env = build_spawn_env(true, "abc-123");
        assert!(env.iter().any(|(k, v)| k == "CLAUI_ACTIVE" && v == "1"));
        assert!(env.iter().any(|(k, v)| k == "CLAUI_PRIMARY" && v == "1"));
        let status = env.iter().find(|(k, _)| k == "CLAUI_STATUS_FILE");
        assert!(status.is_some());
        assert!(status.unwrap().1.ends_with("status-abc-123.json"));
        assert_eq!(env.len(), 3);
    }

    #[test]
    fn build_spawn_env_skips_primary_and_status_file_for_non_primary() {
        let env = build_spawn_env(false, "abc-123");
        assert!(env.iter().any(|(k, _)| k == "CLAUI_ACTIVE"));
        assert!(!env.iter().any(|(k, _)| k == "CLAUI_PRIMARY"));
        assert!(!env.iter().any(|(k, _)| k == "CLAUI_STATUS_FILE"));
        assert_eq!(env.len(), 1);
    }
}
