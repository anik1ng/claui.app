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

/// Per-project wrapper around `StatusPayload`, emitted as the `status:update`
/// event payload so the webview can route the update to the right project area.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusUpdate {
    pub project_id: String,
    pub status: StatusPayload,
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

/// Absolute path of the per-project statusline file. The watcher iterates
/// `/tmp/claui/status-*.json` and extracts the project id from the file name.
pub fn project_status_file_path(project_id: &str) -> PathBuf {
    claui_temp_dir().join(format!("status-{project_id}.json"))
}

/// Extract `<id>` from a `status-<id>.json` filename. Returns `None` for
/// anything that doesn't match the pattern.
pub fn filename_to_project_id(name: &str) -> Option<&str> {
    let stripped = name.strip_prefix("status-")?;
    stripped.strip_suffix(".json")
}

/// Write the statusline wrapper script. The script captures `claude`'s
/// statusline JSON (delivered on stdin) into the file claui watches when
/// the spawned claude is the primary one (`CLAUI_PRIMARY=1`) — that gate
/// keeps the status file single-sourced per project even when multiple claude
/// tabs are alive. The destination path is passed via `$CLAUI_STATUS_FILE` so
/// each primary claude writes to its own `status-<projectId>.json` rather than
/// a single global file. Inside claui (`CLAUI_ACTIVE=1`) it prints nothing —
/// claui renders the metrics in its native bar. Outside claui (neither env
/// set), it chains to the user's real statusline command (read from
/// `~/.claude/settings.json` via `jq`) and forwards its output, so plain
/// `claude` in this project still renders the user's strip.
pub fn install_wrapper() -> std::io::Result<()> {
    std::fs::create_dir_all(claui_temp_dir())?;
    let script = "#!/bin/sh\n\
        # claui — capture claude's statusline JSON. Written by claui; do not edit.\n\
        input=$(cat)\n\
        if [ -n \"$CLAUI_PRIMARY\" ] && [ -n \"$CLAUI_STATUS_FILE\" ]; then\n\
          # Concurrent-safe temp suffix: shell PID + per-invocation $RANDOM.\n\
          tmp=\"$CLAUI_STATUS_FILE.tmp.$$.${RANDOM}\"\n\
          printf '%s' \"$input\" > \"$tmp\" && mv -f \"$tmp\" \"$CLAUI_STATUS_FILE\"\n\
        fi\n\
        if [ -z \"$CLAUI_ACTIVE\" ]; then\n\
          user_settings=\"$HOME/.claude/settings.json\"\n\
          if [ -f \"$user_settings\" ] && command -v jq >/dev/null 2>&1; then\n\
            orig=$(jq -r '.statusLine.command // empty' \"$user_settings\" 2>/dev/null)\n\
            if [ -n \"$orig\" ]; then\n\
              printf '%s' \"$input\" | sh -c \"$orig\"\n\
            fi\n\
          fi\n\
        fi\n";
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

/// Watch the wrapper's directory and emit `status:update` to the webview on
/// every change.
///
/// Performance contract — the wrapper runs once per claude render, and macOS
/// FSEvents fires 2-3 events per atomic write (tmp create + rename). A naive
/// "scan the whole directory on every event, emit one update per file" loop
/// amplifies one logical write into N × events_per_write emits, each carrying
/// a fresh `StatusPayload` reference that defeats `React.memo` and forces
/// every `ProjectArea` to re-render — observed as 80-100 % CPU at idle with
/// two projects open.
///
/// Two guards keep the work O(actual change):
///   1. Filter by `event.paths` basename — emit only for the file the event
///      mentions. FSEvents canonicalises full paths but the basename is
///      stable, so `Path::file_name()` is enough to identify the project.
///   2. Dedupe by content — keep the last-emitted JSON per project and skip
///      emits whose payload didn't change, collapsing FSEvents bursts to one.
pub fn start_watcher(app: AppHandle) -> notify::Result<()> {
    use notify::{RecursiveMode, Watcher};

    let dir = claui_temp_dir();
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx)?;
    watcher.watch(&dir, RecursiveMode::NonRecursive)?;

    let mut last_emitted: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    bootstrap_emit(&dir, &app, &mut last_emitted);

    std::thread::spawn(move || {
        let _watcher = watcher;
        for result in rx {
            let Ok(event) = result else { continue };
            for path in &event.paths {
                process_path(path, &app, &mut last_emitted);
            }
        }
    });
    Ok(())
}

/// Read a single status file and emit `status:update` for it, skipping emits
/// whose JSON is byte-identical to the last one for that project. Returns
/// silently for paths that don't match `status-<id>.json` or that can't be read.
fn process_path(
    path: &Path,
    app: &AppHandle,
    last_emitted: &mut std::collections::HashMap<String, String>,
) {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else { return };
    let Some(project_id) = filename_to_project_id(name) else { return };
    let Ok(text) = std::fs::read_to_string(path) else { return };
    if last_emitted.get(project_id) == Some(&text) {
        return;
    }
    let status = parse(&text);
    let _ = app.emit(
        "status:update",
        StatusUpdate { project_id: project_id.to_owned(), status },
    );
    last_emitted.insert(project_id.to_owned(), text);
}

/// One-shot scan of the watched directory at startup so the bar isn't blank
/// if the wrapper has already written files in a prior run.
fn bootstrap_emit(
    dir: &Path,
    app: &AppHandle,
    last_emitted: &mut std::collections::HashMap<String, String>,
) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        process_path(&entry.path(), app, last_emitted);
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

    #[test]
    fn filename_to_project_id_happy_path() {
        assert_eq!(filename_to_project_id("status-abc-123.json"), Some("abc-123"));
    }

    #[test]
    fn filename_to_project_id_wrong_prefix() {
        assert_eq!(filename_to_project_id("claui-statusline.json"), None);
    }

    #[test]
    fn filename_to_project_id_wrong_extension() {
        assert_eq!(filename_to_project_id("status-abc-123.txt"), None);
    }
}
