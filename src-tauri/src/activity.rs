use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// The two activity states claui understands. Anything else is dropped.
const STATES: [&str; 2] = ["working", "idle"];

fn is_valid_state(state: &str) -> bool {
    STATES.contains(&state)
}

/// Absolute path of the per-tab activity file. The watcher iterates
/// `/tmp/claui/activity-*.json` and extracts the tab id from the file name.
pub fn activity_file_path(tab_id: &str) -> PathBuf {
    crate::statusline::claui_temp_dir().join(format!("activity-{tab_id}.json"))
}

/// Extract `<id>` from an `activity-<id>.json` filename. `None` for anything
/// that doesn't match, including the empty-id form `activity-.json`.
pub fn filename_to_tab_id(name: &str) -> Option<&str> {
    crate::util::strip_id(name, "activity-")
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawActivity {
    project_id: Option<String>,
    state: Option<String>,
}

/// Parse an activity file body into `(projectId, state)`. Tolerant: returns
/// `None` for malformed JSON, a missing field, or an unknown state.
pub fn parse(json: &str) -> Option<(String, String)> {
    let raw = serde_json::from_str::<RawActivity>(json).ok()?;
    let project_id = raw.project_id?;
    let state = raw.state?;
    if project_id.is_empty() || !is_valid_state(&state) {
        return None;
    }
    Some((project_id, state))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityUpdate {
    pub project_id: String,
    pub tab_id: String,
    pub state: String,
}

/// Hook entries claui owns for the activity channel: (event, matcher, state).
/// Each becomes a `claui-activity.sh <state>` command. `UserPromptSubmit` marks
/// the turn as working; `Stop` marks it idle.
const ACTIVITY_HOOKS: &[(&str, &str, &str)] = &[
    ("UserPromptSubmit", "", "working"),
    ("Stop", "", "idle"),
];

/// Merge claui's activity hooks into the project settings `root`, idempotently.
/// Same discipline as `notify::merge_hooks`: drop any existing entry pointing at
/// our script, then append fresh ones — never duplicates ours, never touches the
/// user's own hooks.
pub fn merge_hooks(root: &mut serde_json::Map<String, serde_json::Value>, script: &str) {
    use serde_json::{json, Value};
    let hooks = root
        .entry("hooks")
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    let Some(hooks) = hooks.as_object_mut() else { return };
    for event in ["UserPromptSubmit", "Stop"] {
        let arr = hooks.entry(event).or_insert_with(|| Value::Array(vec![]));
        let Some(arr) = arr.as_array_mut() else { continue };
        arr.retain(|e| !crate::notify::entry_targets_script(e, script));
        for (ev, matcher, state) in ACTIVITY_HOOKS {
            if *ev != event {
                continue;
            }
            arr.push(json!({
                "matcher": matcher,
                "hooks": [{ "type": "command", "command": format!("{script} {state}") }],
            }));
        }
    }
}

/// Absolute path of the activity hook script claui points claude's hooks at.
pub fn script_path() -> PathBuf {
    crate::statusline::claui_temp_dir().join("claui-activity.sh")
}

/// Write the activity hook script. Invoked as `claui-activity.sh <state>`; the
/// state is `$1`. Drains stdin (claude pipes hook JSON in) and writes the
/// per-tab file claui watches. `$CLAUI_ACTIVITY_FILE` / `$CLAUI_PROJECT_ID` come
/// from the spawn env; when unset (a plain claude outside claui) the script no-ops.
pub fn install_script() -> std::io::Result<()> {
    std::fs::create_dir_all(crate::statusline::claui_temp_dir())?;
    let script = "#!/bin/sh\n\
        # claui — record a Claude activity state. Written by claui; do not edit.\n\
        cat >/dev/null 2>&1\n\
        [ -n \"$CLAUI_ACTIVITY_FILE\" ] || exit 0\n\
        tmp=\"$CLAUI_ACTIVITY_FILE.tmp.$$.${RANDOM}\"\n\
        printf '{\"projectId\":\"%s\",\"state\":\"%s\"}' \"$CLAUI_PROJECT_ID\" \"$1\" > \"$tmp\" \\\n\
          && mv -f \"$tmp\" \"$CLAUI_ACTIVITY_FILE\"\n";
    let path = script_path();
    std::fs::write(&path, script)?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))?;
    Ok(())
}

/// Wipe stale `activity-*.json` files at startup — leftovers from a dead run
/// would surface as phantom `activity:update` events on the first watcher tick.
pub fn purge_stale_files() {
    crate::util::purge_matching(&crate::statusline::claui_temp_dir(), |name| {
        filename_to_tab_id(name).is_some()
    });
}

/// Read a single activity file and emit `activity:update`. No-op for paths that
/// aren't `activity-<id>.json` or that fail to parse (e.g. a tmp file mid-rename).
pub fn process_path(path: &Path, app: &AppHandle) {
    crate::util::process_claui_file(path, filename_to_tab_id, |tab_id, text| {
        if let Some((project_id, state)) = parse(&text) {
            let _ = app.emit(
                "activity:update",
                ActivityUpdate { project_id, tab_id: tab_id.to_owned(), state },
            );
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filename_happy_path() {
        assert_eq!(filename_to_tab_id("activity-tab-abc.json"), Some("tab-abc"));
    }

    #[test]
    fn filename_wrong_prefix() {
        assert_eq!(filename_to_tab_id("notify-abc.json"), None);
    }

    #[test]
    fn filename_rejects_empty_id() {
        assert_eq!(filename_to_tab_id("activity-.json"), None);
    }

    #[test]
    fn parse_happy_working() {
        assert_eq!(
            parse(r#"{"projectId":"p1","state":"working"}"#),
            Some(("p1".to_string(), "working".to_string()))
        );
    }

    #[test]
    fn parse_happy_idle() {
        assert_eq!(
            parse(r#"{"projectId":"p1","state":"idle"}"#),
            Some(("p1".to_string(), "idle".to_string()))
        );
    }

    #[test]
    fn parse_rejects_unknown_state() {
        assert_eq!(parse(r#"{"projectId":"p1","state":"bogus"}"#), None);
    }

    #[test]
    fn parse_rejects_missing_project() {
        assert_eq!(parse(r#"{"state":"working"}"#), None);
    }

    #[test]
    fn parse_rejects_malformed() {
        assert_eq!(parse("not json"), None);
    }

    #[test]
    fn merge_hooks_adds_both_events() {
        let mut root = serde_json::Map::new();
        merge_hooks(&mut root, "/tmp/claui/claui-activity.sh");
        let hooks = root["hooks"].as_object().unwrap();
        assert_eq!(hooks["UserPromptSubmit"].as_array().unwrap().len(), 1);
        assert_eq!(hooks["Stop"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn merge_hooks_is_idempotent() {
        let mut root = serde_json::Map::new();
        merge_hooks(&mut root, "/tmp/claui/claui-activity.sh");
        merge_hooks(&mut root, "/tmp/claui/claui-activity.sh");
        let hooks = root["hooks"].as_object().unwrap();
        assert_eq!(hooks["UserPromptSubmit"].as_array().unwrap().len(), 1);
        assert_eq!(hooks["Stop"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn merge_hooks_preserves_user_hooks() {
        let mut root: serde_json::Map<String, serde_json::Value> = serde_json::from_str(
            r#"{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"/usr/bin/say done"}]}]}}"#,
        )
        .unwrap();
        merge_hooks(&mut root, "/tmp/claui/claui-activity.sh");
        let arr = root["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(arr.len(), 2); // 1 user + 1 claui
        assert!(arr.iter().any(|e| e["hooks"][0]["command"] == "/usr/bin/say done"));
    }
}
