use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

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

/// claui's config directory, falling back to the temp directory so the status
/// bar degrades rather than panicking if the platform path is unavailable.
fn config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
}

/// Absolute path of the wrapper script claui points `claude`'s statusline at.
fn wrapper_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("claui-statusline.sh")
}

/// Absolute path of the file the wrapper writes `claude`'s statusline JSON to.
fn status_file_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("claui-statusline.json")
}

/// Write the statusline wrapper script. The script captures `claude`'s
/// statusline JSON (delivered on stdin) into the file claui watches and prints
/// nothing — so there is no in-terminal statusline inside claui. The status
/// path is baked in, so `claude` needs no extra environment.
pub fn install_wrapper(app: &AppHandle) -> std::io::Result<()> {
    let dir = config_dir(app);
    std::fs::create_dir_all(&dir)?;
    let status = status_file_path(app);
    let status = status.to_string_lossy();
    let script = format!(
        "#!/bin/sh\n\
         # claui — capture claude's statusline JSON. Written by claui; do not edit.\n\
         tmp=\"{status}.tmp.$$\"\n\
         cat > \"$tmp\" && mv -f \"$tmp\" \"{status}\"\n",
    );
    let path = wrapper_path(app);
    std::fs::write(&path, script)?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))?;
    Ok(())
}

/// Build the `--settings` JSON that overrides only `claude`'s `statusLine`.
/// `--settings` merges, so the user's own `~/.claude/settings.json` is left
/// intact and still applies to `claude` runs outside claui.
pub fn settings_arg(app: &AppHandle) -> String {
    // Single-quote the wrapper path: `claude` runs the statusline command
    // through a shell, and the macOS app-config path contains a space
    // ("Application Support").
    format!(
        r#"{{"statusLine":{{"type":"command","command":"'{}'"}}}}"#,
        wrapper_path(app).to_string_lossy(),
    )
}

/// Watch the config directory for the wrapper's status file and emit a parsed
/// `status:update` to the webview on every change. The watcher is moved into
/// its own thread so it lives for the process — dropping it stops all events.
pub fn start_watcher(app: AppHandle) -> notify::Result<()> {
    use notify::{RecursiveMode, Watcher};

    let dir = config_dir(&app);
    let status_path = status_file_path(&app);
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx)?;
    watcher.watch(&dir, RecursiveMode::NonRecursive)?;

    std::thread::spawn(move || {
        let _watcher = watcher;
        for result in rx {
            let Ok(event) = result else { continue };
            // The wrapper renames its temp file onto `status_path`; reading on
            // any event that touches that exact path always sees a whole file.
            if event.paths.contains(&status_path) {
                if let Ok(text) = std::fs::read_to_string(&status_path) {
                    let _ = app.emit("status:update", parse(&text));
                }
            }
        }
    });
    Ok(())
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
