use std::path::Path;

use serde::{Deserialize, Serialize};

/// Persisted multi-project window state. `version` is for future migrations.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub version: u32,
    pub projects: Vec<ProjectEntry>,
    pub active_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub id: String,
    pub path: String,
}

pub const CURRENT_VERSION: u32 = 1;

/// Atomically write the state to `path` via tmp + rename. Parent dir is
/// created if missing.
pub fn save(path: &Path, state: &WindowState) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(state)?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Read and filter the state. Missing file, malformed JSON, or unknown
/// version returns `None`. Stale paths (folder no longer exists) are
/// dropped; if `active_id` referred to a stale path, it is moved to the
/// surviving first project (or `None` if all stale).
pub fn load(path: &Path) -> Option<WindowState> {
    let text = std::fs::read_to_string(path).ok()?;
    let raw: WindowState = serde_json::from_str(&text).ok()?;
    if raw.version != CURRENT_VERSION {
        return None;
    }
    let projects: Vec<ProjectEntry> = raw
        .projects
        .into_iter()
        .filter(|p| Path::new(&p.path).is_dir())
        .collect();
    if projects.is_empty() {
        return None;
    }
    let active_id = match raw.active_id {
        Some(id) if projects.iter().any(|p| p.id == id) => Some(id),
        _ => Some(projects[0].id.clone()),
    };
    Some(WindowState { version: CURRENT_VERSION, projects, active_id })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample_state(paths: &[&Path]) -> WindowState {
        WindowState {
            version: CURRENT_VERSION,
            projects: paths
                .iter()
                .enumerate()
                .map(|(i, p)| ProjectEntry { id: format!("id-{i}"), path: p.to_string_lossy().into_owned() })
                .collect(),
            active_id: paths.first().map(|_| "id-0".into()),
        }
    }

    #[test]
    fn window_state_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("window.json");
        let state = sample_state(&[tmp.path()]);
        save(&path, &state).unwrap();
        let loaded = load(&path).unwrap();
        assert_eq!(loaded, state);
    }

    #[test]
    fn load_missing_file_returns_none() {
        let tmp = TempDir::new().unwrap();
        assert_eq!(load(&tmp.path().join("absent.json")), None);
    }

    #[test]
    fn load_malformed_json_returns_none() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("bad.json");
        std::fs::write(&path, "{not json").unwrap();
        assert_eq!(load(&path), None);
    }

    #[test]
    fn load_unknown_version_returns_none() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("v9.json");
        std::fs::write(&path, r#"{"version":9,"projects":[],"active_id":null}"#).unwrap();
        assert_eq!(load(&path), None);
    }

    #[test]
    fn load_filters_stale_paths() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("window.json");
        let live = tmp.path();
        let stale_path = tmp.path().join("does-not-exist");
        let state = WindowState {
            version: CURRENT_VERSION,
            projects: vec![
                ProjectEntry { id: "a".into(), path: stale_path.to_string_lossy().into_owned() },
                ProjectEntry { id: "b".into(), path: live.to_string_lossy().into_owned() },
            ],
            active_id: Some("a".into()),
        };
        save(&path, &state).unwrap();
        let loaded = load(&path).unwrap();
        assert_eq!(loaded.projects.len(), 1);
        assert_eq!(loaded.projects[0].id, "b");
        // active_id moved to the surviving project
        assert_eq!(loaded.active_id, Some("b".into()));
    }

    #[test]
    fn load_all_stale_returns_none() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("window.json");
        let state = WindowState {
            version: CURRENT_VERSION,
            projects: vec![ProjectEntry { id: "a".into(), path: "/no/such/dir".into() }],
            active_id: Some("a".into()),
        };
        save(&path, &state).unwrap();
        assert_eq!(load(&path), None);
    }

    #[test]
    fn save_uses_camel_case_keys() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("window.json");
        let state = WindowState {
            version: CURRENT_VERSION,
            projects: vec![ProjectEntry { id: "x".into(), path: tmp.path().to_string_lossy().into_owned() }],
            active_id: Some("x".into()),
        };
        save(&path, &state).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert!(v.get("activeId").is_some(), "expected `activeId`, got: {text}");
        assert!(v.get("active_id").is_none(), "snake_case `active_id` leaked: {text}");
    }
}
