use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// The slice of `claude`'s statusline JSON that claui's status bar renders.
/// Every field is optional: the bar degrades field-by-field if `claude`'s
/// schema changes or a value is absent.
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusPayload {
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub context_pct: Option<f64>,
    pub cost_usd: Option<f64>,
    pub five_hour_pct: Option<f64>,
    pub seven_day_pct: Option<f64>,
}

#[derive(Deserialize)]
struct Raw {
    session_id: Option<String>,
    model: Option<RawModel>,
    context_window: Option<RawContext>,
    cost: Option<RawCost>,
    rate_limits: Option<RawLimits>,
}
#[derive(Deserialize)]
struct RawModel {
    display_name: Option<String>,
}
#[derive(Deserialize)]
struct RawContext {
    used_percentage: Option<f64>,
}
#[derive(Deserialize)]
struct RawCost {
    total_cost_usd: Option<f64>,
}
#[derive(Deserialize)]
struct RawLimits {
    five_hour: Option<RawWindow>,
    seven_day: Option<RawWindow>,
}
#[derive(Deserialize)]
struct RawWindow {
    used_percentage: Option<f64>,
}

/// Parse the statusline JSON into a `StatusPayload`. Tolerant by design — a
/// document that fails to parse, or is missing fields, yields a payload with
/// those fields `None` rather than an error.
pub fn parse(json: &str) -> StatusPayload {
    let Ok(raw) = serde_json::from_str::<Raw>(json) else {
        return StatusPayload::default();
    };
    let (five, seven) = match raw.rate_limits {
        Some(limits) => (limits.five_hour, limits.seven_day),
        None => (None, None),
    };
    StatusPayload {
        session_id: raw.session_id,
        model: raw.model.and_then(|m| m.display_name),
        context_pct: raw.context_window.and_then(|c| c.used_percentage),
        cost_usd: raw.cost.and_then(|c| c.total_cost_usd),
        five_hour_pct: five.and_then(|w| w.used_percentage),
        seven_day_pct: seven.and_then(|w| w.used_percentage),
    }
}

/// claui's own subdirectory inside the user's temp dir. Holds the wrapper
/// script and the status JSON. INVARIANT: this path must contain no characters
/// that need shell escaping — `claude` runs the statusline `command` string
/// through a shell, and `std::env::temp_dir()` on macOS resolves to
/// `/var/folders/.../T/` (no spaces, owned by the user).
///
/// Co-locating the wrapper and the status file in a small, dedicated directory
/// also makes the file watcher's job trivial: `FSEvents` on macOS is noticeably
/// flakier under `~/Library/Application Support/` than under `/var/folders/`.
fn claui_temp_dir() -> PathBuf {
    std::env::temp_dir().join("claui")
}

/// Absolute path of the wrapper script claui points `claude`'s statusline at.
fn wrapper_path() -> PathBuf {
    claui_temp_dir().join("claui-statusline.sh")
}

/// Absolute path of the file the wrapper writes `claude`'s statusline JSON to.
fn status_file_path() -> PathBuf {
    claui_temp_dir().join("claui-statusline.json")
}

/// Write the statusline wrapper script. The script captures `claude`'s
/// statusline JSON (delivered on stdin) into the file claui watches and prints
/// nothing — so there is no in-terminal statusline inside claui. The status
/// path is baked into the script, so `claude` needs no extra environment.
pub fn install_wrapper() -> std::io::Result<()> {
    std::fs::create_dir_all(claui_temp_dir())?;
    let status = status_file_path();
    let status = status.to_string_lossy();
    let script = format!(
        "#!/bin/sh\n\
         # claui — capture claude's statusline JSON. Written by claui; do not edit.\n\
         tmp=\"{status}.tmp.$$\"\n\
         cat > \"$tmp\" && mv -f \"$tmp\" \"{status}\"\n",
    );
    let path = wrapper_path();
    std::fs::write(&path, script)?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))?;
    Ok(())
}

/// Ensure the project's `.claude/settings.local.json` sets `statusLine` to
/// claui's wrapper. INVARIANT: this is the mechanism that actually overrides
/// the user-level `~/.claude/settings.json` `statusLine` — `--settings` (both
/// inline-JSON and file-path forms) was empirically observed not to. Existing
/// fields in the project settings file are preserved; we merge into them.
pub fn install_project_settings(project_path: &Path) -> std::io::Result<()> {
    let dot_claude = project_path.join(".claude");
    std::fs::create_dir_all(&dot_claude)?;
    let path = dot_claude.join("settings.local.json");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let mut root: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&existing).unwrap_or_default();
    root.insert(
        "statusLine".to_string(),
        serde_json::json!({
            "type": "command",
            "command": wrapper_path().to_string_lossy(),
        }),
    );
    let pretty = serde_json::to_string_pretty(&serde_json::Value::Object(root))?;
    std::fs::write(&path, format!("{pretty}\n"))?;
    Ok(())
}

/// Watch the wrapper's directory and emit a parsed `status:update` to the
/// webview on every change. The watcher is moved into its own thread so it
/// lives for the process — dropping it stops all events.
pub fn start_watcher(app: AppHandle) -> notify::Result<()> {
    use notify::{RecursiveMode, Watcher};

    let dir = claui_temp_dir();
    let status_path = status_file_path();
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx)?;
    watcher.watch(&dir, RecursiveMode::NonRecursive)?;

    // NOTE: on macOS, FSEvents canonicalises paths (e.g. inserts
    // `/System/Volumes/Data/`), so the path in an `Event` rarely equals the
    // `status_path` PathBuf we built. Rather than match paths, we attempt a
    // read on every event in the watched dir — there are only a handful of
    // files there, so the wasted reads are cheap and the logic is robust.

    // Bootstrap: if the wrapper has already written the file in a prior run,
    // surface its contents immediately so the bar isn't blank on startup.
    read_and_emit(&status_path, &app);

    std::thread::spawn(move || {
        let _watcher = watcher;
        for result in rx {
            if result.is_err() {
                continue;
            }
            read_and_emit(&status_path, &app);
        }
    });
    Ok(())
}

/// Read the status file and forward its parsed contents to the webview as a
/// `status:update` event. A missing file is expected before the wrapper's
/// first write; any other read error is silently swallowed.
fn read_and_emit(status_path: &Path, app: &AppHandle) {
    if let Ok(text) = std::fs::read_to_string(status_path) {
        let _ = app.emit("status:update", parse(&text));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_full_status_document() {
        let json = r#"{
            "session_id": "abc-123",
            "model": { "display_name": "Opus 4.7" },
            "context_window": { "used_percentage": 12.5 },
            "cost": { "total_cost_usd": 0.47 },
            "rate_limits": {
                "five_hour": { "used_percentage": 15.0 },
                "seven_day": { "used_percentage": 35.0 }
            }
        }"#;
        let p = parse(json);
        assert_eq!(p.session_id, Some("abc-123".to_string()));
        assert_eq!(p.model, Some("Opus 4.7".to_string()));
        assert_eq!(p.context_pct, Some(12.5));
        assert_eq!(p.cost_usd, Some(0.47));
        assert_eq!(p.five_hour_pct, Some(15.0));
        assert_eq!(p.seven_day_pct, Some(35.0));
    }

    #[test]
    fn missing_fields_become_none() {
        let p = parse(r#"{ "session_id": "x", "cost": { "total_cost_usd": 1.0 } }"#);
        assert_eq!(p.session_id, Some("x".to_string()));
        assert_eq!(p.cost_usd, Some(1.0));
        assert_eq!(p.context_pct, None);
        assert_eq!(p.five_hour_pct, None);
        assert_eq!(p.model, None);
    }

    #[test]
    fn malformed_json_yields_an_empty_payload() {
        let p = parse("not json at all");
        assert_eq!(p.session_id, None);
        assert_eq!(p.context_pct, None);
    }
}
