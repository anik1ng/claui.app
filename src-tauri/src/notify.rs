use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// The three notification kinds claui understands. Anything else is dropped.
const KINDS: [&str; 3] = ["done", "attention", "error"];

fn is_valid_kind(kind: &str) -> bool {
    KINDS.contains(&kind)
}

/// True if `tab_id` is a safe filename fragment — ASCII alphanumeric plus `-`
/// and `_`, non-empty. Tab uids are `tab-<uuid>`, which qualify. Rejecting
/// everything else (notably `.` and `/`) makes path traversal via
/// `notify_file_path` impossible when the id originates from an IPC caller.
pub fn is_safe_tab_id(tab_id: &str) -> bool {
    !tab_id.is_empty()
        && tab_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Absolute path of the per-tab notify file. The watcher iterates
/// `/tmp/claui/notify-*.json` and extracts the tab id from the file name.
pub fn notify_file_path(tab_id: &str) -> PathBuf {
    crate::statusline::claui_temp_dir().join(format!("notify-{tab_id}.json"))
}

/// Extract `<id>` from a `notify-<id>.json` filename. `None` for anything that
/// doesn't match, including the empty-id form `notify-.json`.
pub fn filename_to_tab_id(name: &str) -> Option<&str> {
    crate::util::strip_id(name, "notify-")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawNotify {
    project_id: Option<String>,
    kind: Option<String>,
}

/// Parse a notify file body into `(projectId, kind)`. Tolerant: returns `None`
/// for malformed JSON, a missing field, or a kind claui doesn't understand.
pub fn parse(json: &str) -> Option<(String, String)> {
    let raw = serde_json::from_str::<RawNotify>(json).ok()?;
    let project_id = raw.project_id?;
    let kind = raw.kind?;
    if project_id.is_empty() || !is_valid_kind(&kind) {
        return None;
    }
    Some((project_id, kind))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyUpdate {
    pub project_id: String,
    pub tab_id: String,
    pub kind: String,
}

/// Hook entries claui owns: (event name, matcher, kind). Each becomes a
/// `claui-notify.sh <kind>` command. NOTE: hook event names follow the Claude
/// Code docs; if `idle_prompt` proves unreliable in the app, the first row can
/// be swapped for `("Stop", "", "done")` (and `"Stop"` added to the event loop
/// below).
const NOTIFY_HOOKS: &[(&str, &str, &str)] = &[
    ("Notification", "idle_prompt", "done"),
    ("Notification", "permission_prompt", "attention"),
    ("StopFailure", "", "error"),
];

/// Merge claui's notification hooks into the project settings `root`,
/// idempotently. For each event we own, drop any existing entry whose command
/// points at our script, then append fresh entries — re-running never
/// duplicates ours and never touches the user's own hooks.
pub fn merge_hooks(root: &mut serde_json::Map<String, serde_json::Value>, script: &str) {
    use serde_json::{json, Value};
    let hooks = root
        .entry("hooks")
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(hooks) = hooks.as_object_mut() else { return };
    for event in ["Notification", "StopFailure"] {
        let arr = hooks.entry(event).or_insert_with(|| Value::Array(vec![]));
        let Some(arr) = arr.as_array_mut() else { continue };
        arr.retain(|e| !entry_targets_script(e, script));
        for (ev, matcher, kind) in NOTIFY_HOOKS {
            if *ev != event {
                continue;
            }
            arr.push(json!({
                "matcher": matcher,
                "hooks": [{ "type": "command", "command": format!("{script} {kind}") }],
            }));
        }
    }
}

/// True if a hook-group entry's command list references our script path.
fn entry_targets_script(entry: &serde_json::Value, script: &str) -> bool {
    entry
        .get("hooks")
        .and_then(|h| h.as_array())
        .is_some_and(|h| {
            h.iter().any(|c| {
                c.get("command")
                    .and_then(|s| s.as_str())
                    .is_some_and(|s| s.contains(script))
            })
        })
}

/// Absolute path of the notify hook script claui points claude's hooks at.
pub fn script_path() -> PathBuf {
    crate::statusline::claui_temp_dir().join("claui-notify.sh")
}

/// Write the notify hook script. Invoked as `claui-notify.sh <kind>`; the kind
/// is `$1`. Drains stdin (claude pipes the hook JSON in) and writes the
/// per-tab file claui watches. `$CLAUI_NOTIFY_FILE` / `$CLAUI_PROJECT_ID` come
/// from the spawn env (see `ipc::build_spawn_env`); when unset (a plain claude
/// outside claui) the script no-ops.
pub fn install_script() -> std::io::Result<()> {
    std::fs::create_dir_all(crate::statusline::claui_temp_dir())?;
    let script = "#!/bin/sh\n\
        # claui — record a Claude notification event. Written by claui; do not edit.\n\
        cat >/dev/null 2>&1\n\
        [ -n \"$CLAUI_NOTIFY_FILE\" ] || exit 0\n\
        tmp=\"$CLAUI_NOTIFY_FILE.tmp.$$.${RANDOM}\"\n\
        printf '{\"projectId\":\"%s\",\"kind\":\"%s\"}' \"$CLAUI_PROJECT_ID\" \"$1\" > \"$tmp\" \\\n\
          && mv -f \"$tmp\" \"$CLAUI_NOTIFY_FILE\"\n";
    let path = script_path();
    std::fs::write(&path, script)?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))?;
    Ok(())
}

/// Wipe stale `notify-*.json` files at startup — same rationale as
/// `statusline::purge_stale_status_files`: leftovers from a dead run would
/// surface as phantom `notify:update` events on the first watcher tick.
pub fn purge_stale_files() {
    crate::util::purge_matching(
        &crate::statusline::claui_temp_dir(),
        |name| filename_to_tab_id(name).is_some(),
    );
}

/// Read a single notify file and emit `notify:update`. No-op for paths that
/// aren't `notify-<id>.json` or that fail to parse (e.g. a tmp file mid-rename).
pub fn process_path(path: &Path, app: &AppHandle) {
    crate::util::process_claui_file(path, filename_to_tab_id, |tab_id, text| {
        if let Some((project_id, kind)) = parse(&text) {
            let _ = app.emit(
                "notify:update",
                NotifyUpdate { project_id, tab_id: tab_id.to_owned(), kind },
            );
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filename_happy_path() {
        assert_eq!(filename_to_tab_id("notify-tab-abc.json"), Some("tab-abc"));
    }

    #[test]
    fn filename_wrong_prefix() {
        assert_eq!(filename_to_tab_id("status-abc.json"), None);
    }

    #[test]
    fn filename_rejects_empty_id() {
        assert_eq!(filename_to_tab_id("notify-.json"), None);
    }

    #[test]
    fn parse_happy_path() {
        let got = parse(r#"{"projectId":"p1","kind":"attention"}"#);
        assert_eq!(got, Some(("p1".to_string(), "attention".to_string())));
    }

    #[test]
    fn parse_rejects_unknown_kind() {
        assert_eq!(parse(r#"{"projectId":"p1","kind":"bogus"}"#), None);
    }

    #[test]
    fn parse_rejects_missing_project() {
        assert_eq!(parse(r#"{"kind":"done"}"#), None);
    }

    #[test]
    fn parse_rejects_malformed() {
        assert_eq!(parse("not json"), None);
    }

    #[test]
    fn merge_hooks_adds_all_three_entries() {
        let mut root = serde_json::Map::new();
        merge_hooks(&mut root, "/tmp/claui/claui-notify.sh");
        let hooks = root["hooks"].as_object().unwrap();
        assert_eq!(hooks["Notification"].as_array().unwrap().len(), 2);
        assert_eq!(hooks["StopFailure"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn merge_hooks_is_idempotent() {
        let mut root = serde_json::Map::new();
        merge_hooks(&mut root, "/tmp/claui/claui-notify.sh");
        merge_hooks(&mut root, "/tmp/claui/claui-notify.sh");
        let hooks = root["hooks"].as_object().unwrap();
        assert_eq!(hooks["Notification"].as_array().unwrap().len(), 2);
        assert_eq!(hooks["StopFailure"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn merge_hooks_preserves_user_hooks() {
        let mut root: serde_json::Map<String, serde_json::Value> = serde_json::from_str(
            r#"{"hooks":{"Notification":[{"matcher":"idle_prompt","hooks":[{"type":"command","command":"/usr/bin/say hi"}]}]}}"#,
        )
        .unwrap();
        merge_hooks(&mut root, "/tmp/claui/claui-notify.sh");
        let arr = root["hooks"]["Notification"].as_array().unwrap();
        // 1 user entry + 2 claui entries.
        assert_eq!(arr.len(), 3);
        assert!(arr.iter().any(|e| e["hooks"][0]["command"] == "/usr/bin/say hi"));
    }

    #[test]
    fn is_safe_tab_id_accepts_real_uids() {
        assert!(is_safe_tab_id("tab-3f9a1c2e-0b4d-4e6f-8a1b-2c3d4e5f6a7b"));
        assert!(is_safe_tab_id("tab_1"));
    }

    #[test]
    fn is_safe_tab_id_rejects_traversal_and_empty() {
        assert!(!is_safe_tab_id(""));
        assert!(!is_safe_tab_id("../../etc/passwd"));
        assert!(!is_safe_tab_id("a/b"));
        assert!(!is_safe_tab_id("a.b"));
        assert!(!is_safe_tab_id("a b"));
    }
}
