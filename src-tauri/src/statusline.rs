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
    pub five_hour_resets_at: Option<u64>,
    pub seven_day_pct: Option<f64>,
    pub seven_day_resets_at: Option<u64>,
}

/// Per-tab wrapper around `StatusPayload`, emitted as the `status:update`
/// event payload so the webview can route the update to the right project
/// area and tab.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusUpdate {
    pub project_id: String,
    pub tab_id: String,
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
    resets_at: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    project_id: Option<String>,
    payload: Option<serde_json::Value>,
}

/// Build a `StatusPayload` from claude's already-parsed statusline JSON value.
/// Tolerant: a value that doesn't fit `Raw` yields a default payload.
fn parse_payload(value: serde_json::Value) -> StatusPayload {
    let Ok(raw) = serde_json::from_value::<Raw>(value) else {
        return StatusPayload::default();
    };
    let (five, seven) = match raw.rate_limits {
        Some(limits) => (limits.five_hour, limits.seven_day),
        None => (None, None),
    };
    let (five_pct, five_resets) = match five {
        Some(w) => (w.used_percentage, w.resets_at),
        None => (None, None),
    };
    let (seven_pct, seven_resets) = match seven {
        Some(w) => (w.used_percentage, w.resets_at),
        None => (None, None),
    };
    StatusPayload {
        session_id: raw.session_id,
        model: raw.model.and_then(|m| m.display_name),
        context_pct: raw.context_window.and_then(|c| c.used_percentage),
        cost_usd: raw.cost.and_then(|c| c.total_cost_usd),
        five_hour_pct: five_pct,
        five_hour_resets_at: five_resets,
        seven_day_pct: seven_pct,
        seven_day_resets_at: seven_resets,
    }
}

/// Parse the per-tab wrapper envelope `{"projectId":…,"payload":<claude json>}`.
/// Returns `(projectId, StatusPayload)`, or `None` when `projectId` is
/// absent/empty. A missing/malformed `payload` degrades to a default payload.
pub fn parse_envelope(json: &str) -> Option<(String, StatusPayload)> {
    let env = serde_json::from_str::<Envelope>(json).ok()?;
    let project_id = env.project_id.filter(|p| !p.is_empty())?;
    let status = env.payload.map_or_else(StatusPayload::default, parse_payload);
    Some((project_id, status))
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
pub(crate) fn claui_temp_dir() -> PathBuf {
    std::env::temp_dir().join("claui")
}

/// Absolute path of the wrapper script claui points `claude`'s statusline at.
fn wrapper_path() -> PathBuf {
    claui_temp_dir().join("claui-statusline.sh")
}

/// Absolute path of the per-tab statusline file. The watcher iterates
/// `status-*.json` and extracts the tab id from the file name.
pub fn tab_status_file_path(tab_id: &str) -> PathBuf {
    claui_temp_dir().join(format!("status-{tab_id}.json"))
}

/// Extract `<id>` from a `status-<id>.json` filename. Returns `None` for
/// anything that doesn't match, including the empty-id form `status-.json`.
pub fn filename_to_tab_id(name: &str) -> Option<&str> {
    crate::util::strip_id(name, "status-")
}

/// Write the statusline wrapper script. Every in-claui claude writes its own
/// per-tab file (`$CLAUI_STATUS_FILE` = `status-<tabId>.json`) whose body is
/// an envelope `{"projectId":"…","payload":<claude's verbatim statusline JSON>}`
/// — `projectId` is added here because claude's own JSON doesn't carry it.
/// `CLAUI_PRIMARY` is no longer consulted; every tab self-reports. Inside claui
/// (`CLAUI_ACTIVE=1`) no output is printed — claui renders the metrics in its
/// native bar. Outside claui (when neither env var is set), it chains to the
/// user's real statusline command (read from `~/.claude/settings.json` via
/// `jq`) and forwards its output, so plain `claude` in this project still
/// renders the user's strip.
pub fn install_wrapper() -> std::io::Result<()> {
    std::fs::create_dir_all(claui_temp_dir())?;
    let script = "#!/bin/sh\n\
        # claui — capture claude's statusline JSON. Written by claui; do not edit.\n\
        input=$(cat)\n\
        if [ -n \"$CLAUI_STATUS_FILE\" ] && [ -n \"$input\" ]; then\n\
          # Concurrent-safe temp suffix: shell PID + per-invocation $RANDOM.\n\
          tmp=\"$CLAUI_STATUS_FILE.tmp.$$.${RANDOM}\"\n\
          printf '{\"projectId\":\"%s\",\"payload\":%s}' \"$CLAUI_PROJECT_ID\" \"$input\" > \"$tmp\" \\\n\
            && mv -f \"$tmp\" \"$CLAUI_STATUS_FILE\"\n\
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
    crate::notify::merge_hooks(&mut root, &crate::notify::script_path().to_string_lossy());
    crate::activity::merge_hooks(&mut root, &crate::activity::script_path().to_string_lossy());
    let pretty = serde_json::to_string_pretty(&serde_json::Value::Object(root))?;
    std::fs::write(&path, format!("{pretty}\n"))?;
    Ok(())
}

/// Wipe stale `status-*.json` files at app startup. Every status file present
/// at startup was written by a claude from a previous run — those claudes are
/// dead, and ingesting their contents would emit phantom `status:update`
/// events for projectIds that may no longer be in `window.json`, leaking
/// payloads into `useStatusByProject` and the orphan files into `/tmp`. New
/// claudes spawning under the freshly-installed wrapper will write fresh
/// files within their first render — at most a sub-second blank bar.
pub fn purge_stale_status_files() {
    crate::util::purge_matching(&claui_temp_dir(), |name| {
        filename_to_tab_id(name).is_some()
    });
}

/// Watch the wrapper's directory and emit `status:update` to the webview on
/// every change.
///
/// Performance contract — the wrapper runs once per claude render, and macOS
/// `FSEvents` fires 2-3 events per atomic write (tmp create + rename). A naive
/// "scan the whole directory on every event, emit one update per file" loop
/// amplifies one logical write into N × `events_per_write` emits, each carrying
/// a fresh `StatusPayload` reference that defeats `React.memo` and forces
/// every `ProjectArea` to re-render — observed as 80-100 % CPU at idle with
/// two projects open.
///
/// `event.paths` carries the changed file(s). `FSEvents` canonicalises full
/// paths but the basename is stable, so `Path::file_name()` is enough to
/// identify the project. We do NOT bootstrap-scan the directory: any files
/// present at watcher start were left over from a previous app run (see
/// `purge_stale_status_files`, called once before this) — fresh claudes will
/// write new files and trigger fresh events on their own.
pub fn start_watcher(app: AppHandle) -> notify::Result<()> {
    use notify::{RecursiveMode, Watcher};

    let dir = claui_temp_dir();
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx)?;
    watcher.watch(&dir, RecursiveMode::NonRecursive)?;

    std::thread::spawn(move || {
        let _watcher = watcher;
        for result in rx {
            let Ok(event) = result else { continue };
            for path in &event.paths {
                process_path(path, &app);
                crate::notify::process_path(path, &app);
                crate::activity::process_path(path, &app);
            }
        }
    });
    Ok(())
}

/// Read a single status file and emit `status:update` for it. Returns
/// silently for paths that don't match `status-<id>.json` or that can't be
/// read (e.g. the wrapper's tmp file mid-rename, or a file that was just
/// deleted). The webview deduplicates content-identical payloads on the JS
/// side (see `useStatusByProject`), so we do not need a Rust-side cache.
fn process_path(path: &Path, app: &AppHandle) {
    crate::util::process_claui_file(path, filename_to_tab_id, |tab_id, text| {
        if let Some((project_id, status)) = parse_envelope(&text) {
            let _ = app.emit(
                "status:update",
                StatusUpdate { project_id, tab_id: tab_id.to_owned(), status },
            );
        }
    });
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
                "five_hour": { "used_percentage": 15.0, "resets_at": 1779992400 },
                "seven_day": { "used_percentage": 35.0, "resets_at": 1780059600 }
            }
        }"#;
        let p = parse_payload(serde_json::from_str(json).unwrap());
        assert_eq!(p.session_id, Some("abc-123".to_string()));
        assert_eq!(p.model, Some("Opus 4.7".to_string()));
        assert_eq!(p.context_pct, Some(12.5));
        assert_eq!(p.cost_usd, Some(0.47));
        assert_eq!(p.five_hour_pct, Some(15.0));
        assert_eq!(p.five_hour_resets_at, Some(1_779_992_400));
        assert_eq!(p.seven_day_pct, Some(35.0));
        assert_eq!(p.seven_day_resets_at, Some(1_780_059_600));
    }

    #[test]
    fn reset_times_are_optional() {
        let json = r#"{
            "rate_limits": {
                "five_hour": { "used_percentage": 15.0 },
                "seven_day": { "used_percentage": 35.0 }
            }
        }"#;
        let p = parse_payload(serde_json::from_str(json).unwrap());
        assert_eq!(p.five_hour_pct, Some(15.0));
        assert_eq!(p.five_hour_resets_at, None);
        assert_eq!(p.seven_day_resets_at, None);
    }

    #[test]
    fn missing_fields_become_none() {
        let p = parse_payload(serde_json::from_str(r#"{ "session_id": "x", "cost": { "total_cost_usd": 1.0 } }"#).unwrap());
        assert_eq!(p.session_id, Some("x".to_string()));
        assert_eq!(p.cost_usd, Some(1.0));
        assert_eq!(p.context_pct, None);
        assert_eq!(p.five_hour_pct, None);
        assert_eq!(p.model, None);
    }

    #[test]
    fn parse_payload_degrades_a_non_object_value() {
        let p = parse_payload(serde_json::Value::String("nope".into()));
        assert_eq!(p.session_id, None);
        assert_eq!(p.context_pct, None);
    }

    #[test]
    fn parse_envelope_extracts_project_and_payload() {
        let json = r#"{"projectId":"p1","payload":{"session_id":"abc","cost":{"total_cost_usd":1.5}}}"#;
        let (project_id, status) = parse_envelope(json).unwrap();
        assert_eq!(project_id, "p1");
        assert_eq!(status.session_id, Some("abc".to_string()));
        assert_eq!(status.cost_usd, Some(1.5));
    }

    #[test]
    fn parse_envelope_rejects_missing_or_empty_project() {
        assert!(parse_envelope(r#"{"payload":{"session_id":"x"}}"#).is_none());
        assert!(parse_envelope(r#"{"projectId":"","payload":{}}"#).is_none());
    }

    #[test]
    fn parse_envelope_degrades_bad_payload_to_default() {
        // projectId present, payload missing → empty StatusPayload, not an error.
        let (project_id, status) = parse_envelope(r#"{"projectId":"p1"}"#).unwrap();
        assert_eq!(project_id, "p1");
        assert_eq!(status.session_id, None);
        assert_eq!(status.model, None);
    }

    #[test]
    fn filename_to_tab_id_happy_path() {
        assert_eq!(filename_to_tab_id("status-tab-abc.json"), Some("tab-abc"));
    }

    #[test]
    fn filename_to_tab_id_wrong_prefix() {
        assert_eq!(filename_to_tab_id("claui-statusline.json"), None);
    }

    #[test]
    fn filename_to_tab_id_wrong_extension() {
        assert_eq!(filename_to_tab_id("status-abc-123.txt"), None);
    }

    #[test]
    fn filename_to_tab_id_rejects_empty_id() {
        assert_eq!(filename_to_tab_id("status-.json"), None);
    }
}
