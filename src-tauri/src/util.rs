use std::path::Path;

/// Extract `<id>` from a `<prefix><id>.json` filename. Returns `None` if the
/// filename doesn't start with `prefix`, doesn't end with `.json`, or the
/// id portion is empty.
pub(crate) fn strip_id<'a>(name: &'a str, prefix: &str) -> Option<&'a str> {
    let id = name.strip_prefix(prefix)?.strip_suffix(".json")?;
    if id.is_empty() { None } else { Some(id) }
}

/// Delete every file in `dir` whose filename satisfies `should_delete`.
/// Silently skips unreadable entries and removal failures — best-effort cleanup.
pub(crate) fn purge_matching(dir: &Path, should_delete: impl Fn(&str) -> bool) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else { continue };
        if should_delete(&name) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Read the file at `path`, extract an id from the filename using `id_fn`,
/// then call `emit(id, text)` with the raw id slice and file contents.
/// No-ops silently when the filename doesn't match or the file can't be read.
pub(crate) fn process_claui_file<F>(
    path: &Path,
    id_fn: fn(&str) -> Option<&str>,
    emit: F,
) where
    F: FnOnce(&str, String),
{
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else { return };
    let Some(id) = id_fn(name) else { return };
    let Ok(text) = std::fs::read_to_string(path) else { return };
    emit(id, text);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_id_happy_path() {
        assert_eq!(strip_id("notify-tab-abc.json", "notify-"), Some("tab-abc"));
        assert_eq!(strip_id("status-proj-123.json", "status-"), Some("proj-123"));
    }

    #[test]
    fn strip_id_wrong_prefix() {
        assert_eq!(strip_id("status-abc.json", "notify-"), None);
    }

    #[test]
    fn strip_id_wrong_suffix() {
        assert_eq!(strip_id("notify-abc.txt", "notify-"), None);
    }

    #[test]
    fn strip_id_rejects_empty_id() {
        assert_eq!(strip_id("notify-.json", "notify-"), None);
        assert_eq!(strip_id("status-.json", "status-"), None);
    }
}
