use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::pty::PtySession;
use crate::shell_env::ShellEnv;
use crate::state::AppState;

#[derive(Clone, Serialize)]
struct ExitPayload {
    id: u32,
    code: i32,
}

/// User-level binary directories that a developer-oriented macOS GUI app
/// should make visible to its child processes. macOS launchd hands GUI
/// launches a minimal `$PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), so
/// Homebrew, Anthropic's native installer, cargo, npm, and go installs are
/// all invisible to a child unless we prepend these. Prepended (not
/// appended) so user installs win over older system copies if both exist.
fn extra_path_dirs(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".local/bin"),             // Anthropic installer, pipx, user installs
        PathBuf::from("/opt/homebrew/bin"),  // Homebrew on Apple Silicon
        PathBuf::from("/opt/homebrew/sbin"), // Homebrew system tools on M1+
        PathBuf::from("/usr/local/bin"),     // Homebrew on Intel / system
        PathBuf::from("/usr/local/sbin"),    // /usr/local system tools
        home.join(".cargo/bin"),             // rustup-installed Rust tools
        home.join(".npm-global/bin"),        // npm install -g without sudo
        home.join("go/bin"),                 // Go tools installed via `go install`
    ]
}

/// Merge `extra_path_dirs(home)` with the existing `$PATH`, deduplicating so
/// a directory that's already present doesn't shift in priority. Result
/// preserves the order: extras first, then surviving entries from
/// `existing` in their original order.
fn augment_path(home: &Path, existing: &str) -> String {
    let extras = extra_path_dirs(home);
    let mut result: Vec<String> = Vec::with_capacity(extras.len() + 8);
    for dir in extras {
        let s = dir.to_string_lossy().into_owned();
        if !result.iter().any(|d| d == &s) {
            result.push(s);
        }
    }
    for dir in existing.split(':').filter(|d| !d.is_empty()) {
        if !result.iter().any(|d| d == dir) {
            result.push(dir.to_string());
        }
    }
    result.join(":")
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
///
/// Three layers stack into the result:
///
///   1. `captured` — every variable the user's `$SHELL -ilc 'env'` reported,
///      sans STRIP-listed session locals (see `shell_env`). This is what
///      brings in `FNM_DIR` / `NVM_DIR` / `ASDF_*` / `MISE_*` / etc. and the
///      shell's PATH (the only place fnm's per-shell node symlink ever
///      appears). Empty when capture failed — caller falls through to:
///   2. `augment_path` — prepends `extra_path_dirs(home)` to the
///      shell-PATH-or-launchd-PATH (whichever's available), deduplicating.
///      This is the safety net for users whose `.zshrc` doesn't add
///      Homebrew etc.
///   3. CLAUI overlays — `CLAUI_ACTIVE`, and optionally `CLAUI_PRIMARY`
///      with `CLAUI_STATUS_FILE`. Overlays come last so they win over any
///      same-keyed entry the captured shell happened to set.
pub(crate) fn build_spawn_env(
    captured: &ShellEnv,
    is_primary: bool,
    project_id: &str,
) -> Vec<(String, String)> {
    let mut env: Vec<(String, String)> = Vec::with_capacity(captured.len() + 4);
    // Carry over every captured shell-env entry; PATH gets re-augmented
    // separately below so the extras prepend logic stays in one place.
    for (k, v) in captured {
        if k == "PATH" {
            continue;
        }
        env.push((k.clone(), v.clone()));
    }
    // PATH base: shell PATH if we have it, else the process's inherited
    // (launchd-minimal in a `.app` GUI launch) PATH. Either way, augment
    // with extras so Homebrew/cargo/Anthropic-installer paths are present
    // regardless of how the user's `.zshrc` is set up.
    let base_path = match captured.get("PATH") {
        Some(p) if !p.is_empty() => p.clone(),
        _ => std::env::var("PATH").unwrap_or_default(),
    };
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        env.push(("PATH".into(), augment_path(&home, &base_path)));
    } else if !base_path.is_empty() {
        env.push(("PATH".into(), base_path));
    }
    env.push(("CLAUI_ACTIVE".into(), "1".into()));
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

    let env = build_spawn_env(crate::shell_env::get(), is_primary, &project_id);

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
    use super::{augment_path, build_spawn_env};
    use crate::shell_env::ShellEnv;
    use std::path::Path;

    #[test]
    fn build_spawn_env_marks_primary_with_status_file() {
        let env = build_spawn_env(&ShellEnv::new(), true, "abc-123");
        assert!(env.iter().any(|(k, v)| k == "CLAUI_ACTIVE" && v == "1"));
        assert!(env.iter().any(|(k, v)| k == "CLAUI_PRIMARY" && v == "1"));
        let status = env.iter().find(|(k, _)| k == "CLAUI_STATUS_FILE");
        assert!(status.is_some());
        assert!(status.unwrap().1.ends_with("status-abc-123.json"));
    }

    #[test]
    fn build_spawn_env_skips_primary_and_status_file_for_non_primary() {
        let env = build_spawn_env(&ShellEnv::new(), false, "abc-123");
        assert!(env.iter().any(|(k, _)| k == "CLAUI_ACTIVE"));
        assert!(!env.iter().any(|(k, _)| k == "CLAUI_PRIMARY"));
        assert!(!env.iter().any(|(k, _)| k == "CLAUI_STATUS_FILE"));
    }

    #[test]
    fn build_spawn_env_propagates_captured_shell_vars() {
        let mut captured = ShellEnv::new();
        captured.insert("FNM_DIR".into(), "/Users/u/.fnm".into());
        captured.insert("NVM_DIR".into(), "/Users/u/.nvm".into());
        captured.insert("EDITOR".into(), "nvim".into());
        let env = build_spawn_env(&captured, false, "p");
        assert!(env
            .iter()
            .any(|(k, v)| k == "FNM_DIR" && v == "/Users/u/.fnm"));
        assert!(env
            .iter()
            .any(|(k, v)| k == "NVM_DIR" && v == "/Users/u/.nvm"));
        assert!(env.iter().any(|(k, v)| k == "EDITOR" && v == "nvim"));
    }

    #[test]
    fn build_spawn_env_uses_captured_path_as_base() {
        // A captured PATH containing fnm's per-shell node symlink must
        // survive into the spawn env (with our extras prepended). Without
        // this, fnm/nvm/asdf users see no node inside spawned claude.
        let mut captured = ShellEnv::new();
        let fnm_path = "/Users/u/Library/Application Support/fnm_multishells/12345_abc/bin";
        captured.insert(
            "PATH".into(),
            format!("{fnm_path}:/opt/homebrew/bin:/usr/bin"),
        );
        let env = build_spawn_env(&captured, false, "p");
        let (_, path) = env.iter().find(|(k, _)| k == "PATH").unwrap();
        assert!(path.contains(fnm_path), "fnm symlink dropped: {path}");
        // Extras are still prepended for safety.
        assert!(
            path.starts_with(&format!(
                "{}/.local/bin",
                std::env::var("HOME").unwrap_or_else(|_| "/Users/u".into())
            )) || path.contains("/.local/bin"),
            "extras missing: {path}"
        );
    }

    #[test]
    fn build_spawn_env_only_one_path_entry() {
        // Regression guard: if the captured map happens to leak a stray
        // duplicate, augment_path's dedup should keep the final PATH
        // single-entry.
        let mut captured = ShellEnv::new();
        captured.insert("PATH".into(), "/usr/bin:/bin".into());
        let env = build_spawn_env(&captured, false, "p");
        let path_count = env.iter().filter(|(k, _)| k == "PATH").count();
        assert_eq!(path_count, 1, "expected exactly one PATH entry");
    }

    #[test]
    fn augment_path_prepends_extras_and_keeps_existing() {
        let home = Path::new("/Users/u");
        let got = augment_path(home, "/usr/bin:/bin");
        let parts: Vec<&str> = got.split(':').collect();
        // ~/.local/bin is the highest-priority dev-tools dir, so it leads.
        assert_eq!(parts[0], "/Users/u/.local/bin");
        // System dirs from the existing PATH are preserved at the tail.
        assert!(parts.contains(&"/usr/bin"));
        assert!(parts.contains(&"/bin"));
    }

    #[test]
    fn augment_path_deduplicates_overlap() {
        let home = Path::new("/Users/u");
        // /opt/homebrew/bin appears in BOTH our extras and the existing PATH —
        // the merged result must contain it exactly once, in the extras
        // position (not duplicated at the tail).
        let got = augment_path(home, "/opt/homebrew/bin:/usr/bin");
        let count = got.split(':').filter(|p| *p == "/opt/homebrew/bin").count();
        assert_eq!(count, 1, "expected dedup, got: {got}");
    }

    #[test]
    fn augment_path_handles_empty_existing() {
        let home = Path::new("/Users/u");
        let got = augment_path(home, "");
        // All extras are still present even when the inherited PATH is empty.
        assert!(got.contains("/Users/u/.local/bin"));
        assert!(got.contains("/opt/homebrew/bin"));
        // No leading/trailing colon producing an empty entry.
        let parts: Vec<&str> = got.split(':').collect();
        assert!(!parts.iter().any(|p| p.is_empty()), "empty entry leaked: {got}");
    }

    #[test]
    fn augment_path_filters_empty_segments_in_existing() {
        // Trailing or doubled colons in $PATH produce empty segments — they
        // would be interpreted by shells as cwd, which is a footgun. Skip them.
        let home = Path::new("/Users/u");
        let got = augment_path(home, "/usr/bin::/bin");
        let parts: Vec<&str> = got.split(':').collect();
        assert!(!parts.iter().any(|p| p.is_empty()), "empty entry leaked: {got}");
    }
}
