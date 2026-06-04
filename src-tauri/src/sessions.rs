use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use serde::Serialize;

/// One `claude` session of a project, as shown in the sessions sidebar.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    /// Last-activity time in Unix milliseconds — the most recent `user` /
    /// `assistant` message timestamp, falling back to the file's mtime only
    /// when the session has no messages yet. Deliberately NOT the raw mtime:
    /// `claude --resume` and housekeeping records (`permission-mode`,
    /// `pr-link`, `file-history-snapshot`, ...) bump the mtime without any
    /// conversation activity, which would wrongly reorder the sidebar.
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

/// What a single pass over a session's JSONL body yields: its display title
/// and the time of its most recent conversation turn.
struct SessionScan {
    title: Option<String>,
    /// Most recent `user` / `assistant` message timestamp in Unix ms. `None`
    /// for a session that holds only housekeeping records (no turns yet).
    last_message: Option<u64>,
}

/// Scan a session file's JSONL contents in one pass for the two facts the
/// sidebar needs: the display title and the last conversation-turn time.
///
/// Title: the most recent `ai-title` line, else the first user message's text
/// (truncated), else None. NOTE: `ai-title` lines can appear multiple times
/// (claude regenerates the title over a session's life); the last one wins, so
/// we scan to EOF rather than early-exit. The `first_user` branch is guarded
/// by `is_none()` so it does early-skip once filled.
///
/// Last message: the max `timestamp` across `user` / `assistant` records ONLY.
/// We deliberately ignore housekeeping records — `permission-mode`,
/// `file-history-snapshot`, `pr-link`, `system`, etc. — because `claude
/// --resume` writes those without a new conversation turn, and counting them
/// would make a merely-reopened session jump to the top of the list.
fn scan_session(contents: &str) -> SessionScan {
    let mut ai_title: Option<String> = None;
    let mut first_user: Option<String> = None;
    let mut last_message: Option<u64> = None;
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
            Some(kind @ ("user" | "assistant")) => {
                if let Some(ms) = message_millis(&value) {
                    last_message = Some(last_message.map_or(ms, |prev| prev.max(ms)));
                }
                if kind == "user" && first_user.is_none() {
                    if let Some(text) = user_message_text(&value) {
                        first_user = Some(text.chars().take(60).collect());
                    }
                }
            }
            _ => {}
        }
    }
    SessionScan { title: ai_title.or(first_user), last_message }
}

/// Pull a record's `timestamp` field and parse it to Unix ms.
fn message_millis(value: &serde_json::Value) -> Option<u64> {
    parse_iso_millis(value.get("timestamp")?.as_str()?)
}

/// Parse claude's fixed ISO-8601 UTC timestamps (`YYYY-MM-DDTHH:MM:SS[.fff]Z`)
/// into Unix milliseconds. Returns `None` for anything that doesn't match that
/// shape or predates the epoch. Parsed by hand rather than via `chrono`: the
/// format is fixed and the civil-date→days math is a few lines.
fn parse_iso_millis(ts: &str) -> Option<u64> {
    let ts = ts.strip_suffix('Z').unwrap_or(ts);
    let (date, time) = ts.split_once('T')?;

    let mut date_parts = date.splitn(3, '-');
    let year: i64 = date_parts.next()?.parse().ok()?;
    let month: i64 = date_parts.next()?.parse().ok()?;
    let day: i64 = date_parts.next()?.parse().ok()?;

    let (clock, frac) = time.split_once('.').unwrap_or((time, ""));
    let mut clock_parts = clock.splitn(3, ':');
    let hour: i64 = clock_parts.next()?.parse().ok()?;
    let minute: i64 = clock_parts.next()?.parse().ok()?;
    let second: i64 = clock_parts.next()?.parse().ok()?;

    // The first three fractional digits are milliseconds; pad/truncate to 3.
    let mut digits = frac.chars();
    let mut millis_frac = 0i64;
    for _ in 0..3 {
        let d = digits.next().and_then(|c| c.to_digit(10)).map_or(0, i64::from);
        millis_frac = millis_frac * 10 + d;
    }

    let days = days_from_civil(year, month, day);
    let secs = ((days * 24 + hour) * 60 + minute) * 60 + second;
    u64::try_from(secs * 1000 + millis_frac).ok()
}

/// Days from 1970-01-01 to a proleptic-Gregorian date (Howard Hinnant's
/// `days_from_civil`). Negative before the epoch. Correct across leap years.
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
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

/// Cache entry — the parsed `SessionInfo` plus the metadata fingerprint we
/// validated it against. We deliberately do NOT trust `last_activity` alone:
/// the `SessionInfo.last_activity` exposed to JS is in milliseconds (because
/// that's what `Date.now()` semantics call for), but APFS supports
/// nanosecond mtimes. Two writes within the same millisecond would collapse
/// to the same `last_activity` and the cache would serve stale contents.
/// Including file size catches that case — any meaningful claude write
/// changes the byte length.
struct CachedSession {
    info: SessionInfo,
    fingerprint: (u128, u64), // (mtime_ns, file_size)
}

/// Module-level cache keyed by absolute session-file path. The polling
/// sidebar calls `list_sessions` every couple of seconds for every open
/// project; reading and full-JSON-parsing each multi-megabyte JSONL file
/// every tick burned ~75 % of the main thread under sample(1). Skipping the
/// file read when the fingerprint matches collapses steady-state cost to
/// one metadata syscall per file.
fn session_cache() -> &'static Mutex<HashMap<PathBuf, CachedSession>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, CachedSession>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Read one session file into a `SessionInfo`; `None` if its name or metadata
/// is unreadable. Uses the module-level `session_cache` so unchanged files
/// (matched by mtime + size fingerprint) skip the file read and JSON parse.
fn parse_session_file(path: &Path) -> Option<SessionInfo> {
    let id = path.file_stem()?.to_str()?.to_string();
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    let mtime_ns = modified.duration_since(UNIX_EPOCH).ok()?.as_nanos();
    let size = metadata.len();
    let last_activity = u64::try_from(mtime_ns / 1_000_000).unwrap_or(0);
    let fingerprint = (mtime_ns, size);

    if let Ok(cache) = session_cache().lock() {
        if let Some(cached) = cache.get(path) {
            if cached.fingerprint == fingerprint && cached.info.id == id {
                return Some(cached.info.clone());
            }
        }
    }

    let contents = fs::read_to_string(path).unwrap_or_default();
    let scan = scan_session(&contents);
    let title = scan.title.unwrap_or_else(|| "Untitled".to_string());
    // Prefer the last conversation turn; fall back to the file's mtime for a
    // session that has no messages yet (so it still sorts somewhere sane).
    let last_activity = scan.last_message.unwrap_or(last_activity);
    let info = SessionInfo { id, title, last_activity };
    if let Ok(mut cache) = session_cache().lock() {
        cache.insert(path.to_path_buf(), CachedSession { info: info.clone(), fingerprint });
    }
    Some(info)
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
        assert_eq!(scan_session(jsonl).title, Some("Final title".to_string()));
    }

    #[test]
    fn extract_title_falls_back_to_the_first_user_message() {
        let jsonl = r#"{"type":"user","message":{"role":"user","content":"do the thing"}}"#;
        assert_eq!(scan_session(jsonl).title, Some("do the thing".to_string()));
    }

    #[test]
    fn extract_title_handles_array_shaped_user_content() {
        // Real claude sessions emit `content` as an array of content blocks
        // for tool-heavy turns; we must still find the first text block.
        let jsonl = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"x"},{"type":"text","text":"the actual prompt"}]}}"#;
        assert_eq!(scan_session(jsonl).title, Some("the actual prompt".to_string()));
    }

    #[test]
    fn extract_title_is_none_without_a_title_or_user_message() {
        assert_eq!(scan_session(r#"{"type":"summary"}"#).title, None);
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

    #[test]
    fn parse_iso_millis_parses_the_fixed_claude_format() {
        // Reference values computed with Python's datetime against UTC.
        assert_eq!(parse_iso_millis("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(parse_iso_millis("2026-06-04T15:11:24.314Z"), Some(1_780_585_884_314));
        // Leap day — exercises days_from_civil's month/year rollback.
        assert_eq!(parse_iso_millis("2024-02-29T23:59:59.500Z"), Some(1_709_251_199_500));
    }

    #[test]
    fn parse_iso_millis_tolerates_missing_or_short_fractions() {
        // No fractional part at all.
        assert_eq!(parse_iso_millis("2026-06-04T15:11:24Z"), Some(1_780_585_884_000));
        // Fewer than three fractional digits pad to milliseconds, not micro/nanos.
        assert_eq!(parse_iso_millis("2026-06-04T15:11:24.3Z"), Some(1_780_585_884_300));
        // More than three are truncated to milliseconds.
        assert_eq!(parse_iso_millis("2026-06-04T15:11:24.314159Z"), Some(1_780_585_884_314));
    }

    #[test]
    fn parse_iso_millis_rejects_malformed_input() {
        assert_eq!(parse_iso_millis(""), None);
        assert_eq!(parse_iso_millis("not-a-date"), None);
        assert_eq!(parse_iso_millis("2026-06-04 15:11:24Z"), None); // space, no 'T'
    }

    #[test]
    fn scan_session_takes_the_latest_user_or_assistant_timestamp() {
        // Out-of-order on purpose: the max wins, not the last line.
        let jsonl = concat!(
            r#"{"type":"user","timestamp":"2026-06-04T15:00:00.000Z","message":{"role":"user","content":"hi"}}"#,
            "\n",
            r#"{"type":"assistant","timestamp":"2026-06-04T15:05:00.000Z","message":{"role":"assistant"}}"#,
            "\n",
            r#"{"type":"user","timestamp":"2026-06-04T15:02:00.000Z","message":{"role":"user","content":"again"}}"#,
            "\n",
        );
        assert_eq!(scan_session(jsonl).last_message, parse_iso_millis("2026-06-04T15:05:00.000Z"));
    }

    #[test]
    fn scan_session_ignores_housekeeping_record_timestamps() {
        // A resumed/idle session ends in housekeeping records; `system` and
        // `pr-link` carry their own (later) timestamps, but last_message must
        // reflect only the conversation turns.
        let jsonl = concat!(
            r#"{"type":"user","timestamp":"2026-06-04T15:00:00.000Z","message":{"role":"user","content":"hi"}}"#,
            "\n",
            r#"{"type":"system","timestamp":"2026-06-04T16:00:00.000Z"}"#,
            "\n",
            r#"{"type":"pr-link","timestamp":"2026-06-04T17:00:00.000Z"}"#,
            "\n",
            r#"{"type":"permission-mode"}"#,
            "\n",
        );
        assert_eq!(scan_session(jsonl).last_message, parse_iso_millis("2026-06-04T15:00:00.000Z"));
    }

    #[test]
    fn scan_session_has_no_last_message_without_turns() {
        let jsonl = r#"{"type":"permission-mode"}"#;
        assert_eq!(scan_session(jsonl).last_message, None);
    }
}
