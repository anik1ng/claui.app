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

/// Build the env tuple passed to the spawned claude.
///
/// `CLAUI_ACTIVE=1` tells the statusline wrapper it's running inside claui
/// (suppresses the chain to the user's real statusline command).
/// `CLAUI_PRIMARY=1` is set only on the primary claude of an open project —
/// the statusline wrapper writes the global status file for that PTY only,
/// so claui's status bar tracks a single source of truth even with multiple
/// claude tabs alive.
pub(crate) fn build_spawn_env(is_primary: bool) -> Vec<(&'static str, &'static str)> {
    let mut env = vec![("CLAUI_ACTIVE", "1")];
    if is_primary {
        env.push(("CLAUI_PRIMARY", "1"));
    }
    env
}

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

    let env = build_spawn_env(is_primary);

    // Spawn first; persist the project only once the terminal actually started.
    let claude = claude.to_string_lossy();
    let id = spawn_terminal(
        &app,
        &state,
        claude.as_ref(),
        &args,
        Some(&path),
        &env,
        cols,
        rows,
        on_output,
    )?;

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
    path: String,
    on_output: Channel<Vec<u8>>,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    spawn_terminal(
        &app,
        &state,
        &shell,
        &["-l"],
        Some(path.as_str()),
        &[],
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
    env: &[(&str, &str)],
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

#[cfg(test)]
mod tests {
    use super::build_spawn_env;

    #[test]
    fn build_spawn_env_marks_primary() {
        let env = build_spawn_env(true);
        assert!(env.contains(&("CLAUI_ACTIVE", "1")));
        assert!(env.contains(&("CLAUI_PRIMARY", "1")));
        assert_eq!(env.len(), 2);
    }

    #[test]
    fn build_spawn_env_skips_primary_marker_for_non_primary() {
        let env = build_spawn_env(false);
        assert!(env.contains(&("CLAUI_ACTIVE", "1")));
        assert!(!env.iter().any(|(k, _)| *k == "CLAUI_PRIMARY"));
        assert_eq!(env.len(), 1);
    }
}
