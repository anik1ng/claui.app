use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

/// One `claude` session of a project, as shown in the sessions sidebar.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    /// Last-activity time — the session file's mtime, in Unix milliseconds.
    pub last_activity: u64,
}

/// Encode an absolute project path the way `claude` names its per-project
/// directory under `~/.claude/projects`: every non-alphanumeric character
/// becomes `-`. Verified against a real `~/.claude/projects` directory.
pub fn project_dir_name(project_path: &str) -> String {
    project_path
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// Extract a session's display title from its JSONL contents: the most recent
/// `ai-title` line, else the first user message's text (truncated), else None.
///
/// NOTE: `ai-title` lines can appear multiple times (claude regenerates the
/// title over the life of a session); the last one wins, so we must scan to
/// EOF rather than early-exit on the first match. The `first_user` branch is
/// already guarded by `is_none()` so it does early-skip once filled.
fn extract_title(contents: &str) -> Option<String> {
    let mut ai_title: Option<String> = None;
    let mut first_user: Option<String> = None;
    for line in contents.lines() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        match value.get("type").and_then(serde_json::Value::as_str) {
            Some("ai-title") => {
                if let Some(title) = value.get("aiTitle").and_then(serde_json::Value::as_str) {
                    ai_title = Some(title.to_string());
                }
            }
            Some("user") if first_user.is_none() => {
                if let Some(text) = user_message_text(&value) {
                    first_user = Some(text.chars().take(60).collect());
                }
            }
            _ => {}
        }
    }
    ai_title.or(first_user)
}

/// Pull a display string out of a `user`-typed message's `content`. `content`
/// can be either a plain string OR an array of content blocks (tool-heavy
/// sessions produce the latter); for an array, the first `{"type":"text"}`
/// block wins.
fn user_message_text(value: &serde_json::Value) -> Option<&str> {
    let content = value.get("message").and_then(|m| m.get("content"))?;
    if let Some(text) = content.as_str() {
        return Some(text);
    }
    content
        .as_array()?
        .iter()
        .find(|block| block.get("type").and_then(serde_json::Value::as_str) == Some("text"))?
        .get("text")?
        .as_str()
}

/// Read one session file into a `SessionInfo`; `None` if its name or metadata
/// is unreadable.
fn parse_session_file(path: &Path) -> Option<SessionInfo> {
    let id = path.file_stem()?.to_str()?.to_string();
    let metadata = fs::metadata(path).ok()?;
    let last_activity = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .and_then(|d| u64::try_from(d.as_millis()).ok())
        .unwrap_or(0);
    let contents = fs::read_to_string(path).unwrap_or_default();
    let title = extract_title(&contents).unwrap_or_else(|| "Untitled".to_string());
    Some(SessionInfo { id, title, last_activity })
}

/// List a project's sessions found under `projects_root`, newest first. Split
/// from `list_sessions` so the directory scan is unit-testable against a
/// fixture root.
pub fn list_sessions_in(projects_root: &Path, project_path: &str) -> Vec<SessionInfo> {
    let dir = projects_root.join(project_dir_name(project_path));
    let Ok(entries) = fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut sessions: Vec<SessionInfo> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .filter_map(|path| parse_session_file(&path))
        .collect();
    sessions.sort_by_key(|s| std::cmp::Reverse(s.last_activity));
    sessions
}

/// Production entry point: list the current project's sessions from the real
/// `~/.claude/projects` directory.
pub fn list_sessions(project_path: &str) -> Vec<SessionInfo> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };
    list_sessions_in(&home.join(".claude/projects"), project_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_dir_name_replaces_non_alphanumerics() {
        assert_eq!(project_dir_name("/Users/a/p"), "-Users-a-p");
        assert_eq!(project_dir_name("/U/my.app dir"), "-U-my-app-dir");
        // Digits are alphanumeric and must be preserved verbatim.
        assert_eq!(project_dir_name("/proj/v2-final"), "-proj-v2-final");
    }

    #[test]
    fn extract_title_prefers_the_last_ai_title() {
        let jsonl = concat!(
            r#"{"type":"user","message":{"role":"user","content":"hello there"}}"#,
            "\n",
            r#"{"type":"ai-title","aiTitle":"First title"}"#,
            "\n",
            r#"{"type":"ai-title","aiTitle":"Final title"}"#,
            "\n",
        );
        assert_eq!(extract_title(jsonl), Some("Final title".to_string()));
    }

    #[test]
    fn extract_title_falls_back_to_the_first_user_message() {
        let jsonl = r#"{"type":"user","message":{"role":"user","content":"do the thing"}}"#;
        assert_eq!(extract_title(jsonl), Some("do the thing".to_string()));
    }

    #[test]
    fn extract_title_handles_array_shaped_user_content() {
        // Real claude sessions emit `content` as an array of content blocks
        // for tool-heavy turns; we must still find the first text block.
        let jsonl = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"x"},{"type":"text","text":"the actual prompt"}]}}"#;
        assert_eq!(extract_title(jsonl), Some("the actual prompt".to_string()));
    }

    #[test]
    fn extract_title_is_none_without_a_title_or_user_message() {
        assert_eq!(extract_title(r#"{"type":"summary"}"#), None);
    }

    #[test]
    fn list_sessions_in_reads_jsonl_files_only() {
        let root = std::env::temp_dir().join(format!("claui-sessions-test-{}", std::process::id()));
        let project = "/tmp/demo-proj";
        let dir = root.join(project_dir_name(project));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("aaa.jsonl"), r#"{"type":"ai-title","aiTitle":"First"}"#).unwrap();
        fs::write(dir.join("bbb.jsonl"), r#"{"type":"ai-title","aiTitle":"Second"}"#).unwrap();
        fs::write(dir.join("notes.txt"), "ignored").unwrap();
        fs::create_dir_all(dir.join("memory")).unwrap();

        let sessions = list_sessions_in(&root, project);
        let _ = fs::remove_dir_all(&root);

        assert_eq!(sessions.len(), 2);
        let titles: Vec<&str> = sessions.iter().map(|s| s.title.as_str()).collect();
        assert!(titles.contains(&"First"));
        assert!(titles.contains(&"Second"));
    }
}
