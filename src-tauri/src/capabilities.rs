//! Read-only "what does this project's Claude Code have available" snapshot for
//! the capabilities sidebar: enabled plugins and the skills/agents they ship,
//! plus the effective hooks and permissions. Everything is read from local
//! config under `~/.claude` and the project's `.claude`; any unreadable source
//! degrades to empty (never panics), mirroring `sessions.rs` / `shell_env.rs`.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub skills: Vec<NamedItem>,
    pub plugins: Vec<PluginItem>,
    pub agents: Vec<NamedItem>,
    pub hooks: Vec<HookItem>,
    pub permissions: Vec<PermissionItem>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedItem {
    pub name: String,
    /// Where it comes from: a plugin name, or `project` / `personal`.
    pub source: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginItem {
    pub name: String,
    pub version: String,
    pub skill_count: usize,
    pub has_mcp: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookItem {
    pub event: String,
    pub label: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionItem {
    pub pattern: String,
    /// `allow` | `ask` | `deny`.
    pub decision: String,
}

/// `(display_name, install_path, version)` for each ENABLED plugin, joining
/// `enabledPlugins` (`{"name@marketplace": bool}`) with `installed_plugins`
/// (`.plugins[id]` = `[{installPath, version}]`). The first install entry wins.
pub fn resolve_enabled_plugins(
    enabled: &serde_json::Value,
    installed: &serde_json::Value,
) -> Vec<(String, PathBuf, String)> {
    let Some(map) = enabled.as_object() else {
        return Vec::new();
    };
    let plugins = installed.get("plugins");
    let mut out: Vec<(String, PathBuf, String)> = map
        .iter()
        .filter(|(_, on)| on.as_bool() == Some(true))
        .filter_map(|(id, _)| {
            let name = id.split('@').next().unwrap_or(id).to_string();
            let entry = plugins?.get(id)?.as_array()?.first()?;
            let path = PathBuf::from(entry.get("installPath")?.as_str()?);
            let version = entry.get("version").and_then(|v| v.as_str()).unwrap_or("").to_string();
            Some((name, path, version))
        })
        .collect();
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

/// Subdirectory names of `<base>/skills` that contain a `SKILL.md` file.
pub fn skills_under(base: &Path) -> Vec<String> {
    list_dirs(&base.join("skills"), |p| p.join("SKILL.md").is_file())
}

/// `<base>/agents/*` entry names (`.md` file → stem; directory → name).
pub fn agents_under(base: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(base.join("agents")) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.is_dir() {
                p.file_name()?.to_str().map(str::to_string)
            } else if p.extension().is_some_and(|x| x == "md") {
                p.file_stem()?.to_str().map(str::to_string)
            } else {
                None
            }
        })
        .collect();
    names.sort();
    names
}

/// Directory names directly under `dir` for which `keep` holds.
fn list_dirs(dir: &Path, keep: impl Fn(&Path) -> bool) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir() && keep(p))
        .filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_string))
        .collect();
    names.sort();
    names
}

/// Flatten a settings `permissions` object (`{allow:[],ask:[],deny:[]}`),
/// tagging each pattern with its decision.
pub fn flatten_permissions(perms: &serde_json::Value) -> Vec<PermissionItem> {
    let mut out = Vec::new();
    for decision in ["allow", "ask", "deny"] {
        for p in perms.get(decision).and_then(|v| v.as_array()).into_iter().flatten() {
            if let Some(pattern) = p.as_str() {
                out.push(PermissionItem { pattern: pattern.to_string(), decision: decision.to_string() });
            }
        }
    }
    out
}

/// Flatten a settings `hooks` object (`{Event: [{matcher?, hooks:[{command}]}]}`)
/// to `{event, label}`, where label is the hook program's basename (the first
/// whitespace token of `command`, stripped to its filename), else the matcher.
pub fn flatten_hooks(hooks: &serde_json::Value) -> Vec<HookItem> {
    let Some(map) = hooks.as_object() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (event, groups) in map {
        for g in groups.as_array().into_iter().flatten() {
            let matcher = g.get("matcher").and_then(|v| v.as_str()).unwrap_or("");
            for h in g.get("hooks").and_then(|v| v.as_array()).into_iter().flatten() {
                let cmd = h.get("command").and_then(|v| v.as_str()).unwrap_or(matcher);
                let prog = cmd.split_whitespace().next().unwrap_or(cmd);
                let label = prog.rsplit('/').next().unwrap_or(prog);
                let label = if label.is_empty() { matcher } else { label };
                out.push(HookItem { event: event.clone(), label: label.to_string() });
            }
        }
    }
    out
}

fn read_json(path: &Path) -> serde_json::Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::Value::Null)
}

/// Compose `Capabilities` for `project_path` from a `home` (`~`) root and the
/// project's `.claude`. Split from `read_capabilities` so it is unit-testable
/// against fixture roots.
pub fn read_capabilities_from(home: &Path, project_path: &str) -> Capabilities {
    let null = serde_json::Value::Null;
    let global = read_json(&home.join(".claude/settings.json"));
    let local = read_json(&PathBuf::from(project_path).join(".claude/settings.local.json"));
    let installed = read_json(&home.join(".claude/plugins/installed_plugins.json"));

    let resolved = resolve_enabled_plugins(global.get("enabledPlugins").unwrap_or(&null), &installed);

    let mut skills = Vec::new();
    let mut agents = Vec::new();
    let mut plugins = Vec::new();
    for (name, path, version) in &resolved {
        let plugin_skills = skills_under(path);
        let has_mcp = path.join(".mcp.json").is_file() || path.join("mcp.json").is_file();
        plugins.push(PluginItem {
            name: name.clone(),
            version: version.clone(),
            skill_count: plugin_skills.len(),
            has_mcp,
        });
        for s in plugin_skills {
            skills.push(NamedItem { name: s, source: name.clone() });
        }
        for a in agents_under(path) {
            agents.push(NamedItem { name: a, source: name.clone() });
        }
    }
    for (base, src) in [
        (PathBuf::from(project_path).join(".claude"), "project"),
        (home.join(".claude"), "personal"),
    ] {
        for s in skills_under(&base) {
            skills.push(NamedItem { name: s, source: src.to_string() });
        }
        for a in agents_under(&base) {
            agents.push(NamedItem { name: a, source: src.to_string() });
        }
    }
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    agents.sort_by(|a, b| a.name.cmp(&b.name));

    let mut hooks = flatten_hooks(global.get("hooks").unwrap_or(&null));
    hooks.extend(flatten_hooks(local.get("hooks").unwrap_or(&null)));
    let mut permissions = flatten_permissions(global.get("permissions").unwrap_or(&null));
    permissions.extend(flatten_permissions(local.get("permissions").unwrap_or(&null)));

    Capabilities { skills, plugins, agents, hooks, permissions }
}

/// Production entry point: read the active project's capabilities from `~`.
pub fn read_capabilities(project_path: &str) -> Capabilities {
    match std::env::var_os("HOME") {
        Some(home) => read_capabilities_from(&PathBuf::from(home), project_path),
        None => Capabilities::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn resolves_only_enabled_plugins_with_install_path() {
        let enabled = json!({ "a@m": true, "b@m": false });
        let installed = json!({ "plugins": {
            "a@m": [{ "installPath": "/p/a/1.0.0", "version": "1.0.0" }],
            "b@m": [{ "installPath": "/p/b/1.0.0", "version": "1.0.0" }]
        }});
        let got = resolve_enabled_plugins(&enabled, &installed);
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].0, "a");
        assert_eq!(got[0].1, PathBuf::from("/p/a/1.0.0"));
        assert_eq!(got[0].2, "1.0.0");
    }

    #[test]
    fn skips_enabled_plugin_missing_from_installed() {
        let enabled = json!({ "ghost@m": true });
        let installed = json!({ "plugins": {} });
        assert!(resolve_enabled_plugins(&enabled, &installed).is_empty());
    }

    #[test]
    fn enumerates_skills_with_skill_md_and_agents() {
        let root = std::env::temp_dir().join(format!("claui-caps-skills-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("skills/alpha")).unwrap();
        fs::write(root.join("skills/alpha/SKILL.md"), "x").unwrap();
        fs::create_dir_all(root.join("skills/empty")).unwrap(); // no SKILL.md → skipped
        fs::create_dir_all(root.join("agents/bar")).unwrap();
        fs::write(root.join("agents/foo.md"), "x").unwrap();

        assert_eq!(skills_under(&root), vec!["alpha".to_string()]);
        assert_eq!(agents_under(&root), vec!["bar".to_string(), "foo".to_string()]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn flattens_permissions_by_decision() {
        let got = flatten_permissions(&json!({ "allow": ["git *"], "deny": ["curl *"] }));
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].pattern, "git *");
        assert_eq!(got[0].decision, "allow");
        assert_eq!(got[1].decision, "deny");
    }

    #[test]
    fn flattens_hooks_to_event_and_program_basename() {
        let got = flatten_hooks(&json!({
            "SessionStart": [{ "hooks": [{ "command": "/tmp/claui/statusline.sh --x" }] }]
        }));
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].event, "SessionStart");
        assert_eq!(got[0].label, "statusline.sh");
    }

    #[test]
    fn read_capabilities_from_composes_all_groups() {
        let home = std::env::temp_dir().join(format!("claui-caps-home-{}", std::process::id()));
        let proj = std::env::temp_dir().join(format!("claui-caps-proj-{}", std::process::id()));
        let plugin = home.join(".claude/plugins/cache/m/demo/1.0.0");
        let _ = fs::remove_dir_all(&home);
        let _ = fs::remove_dir_all(&proj);
        fs::create_dir_all(plugin.join("skills/cool")).unwrap();
        fs::write(plugin.join("skills/cool/SKILL.md"), "x").unwrap();
        fs::create_dir_all(home.join(".claude")).unwrap();
        fs::write(
            home.join(".claude/settings.json"),
            json!({
                "enabledPlugins": { "demo@m": true },
                "permissions": { "allow": ["git *"] }
            })
            .to_string(),
        )
        .unwrap();
        fs::write(
            home.join(".claude/plugins/installed_plugins.json"),
            json!({ "plugins": { "demo@m": [{ "installPath": plugin.to_str().unwrap(), "version": "1.0.0" }] } })
                .to_string(),
        )
        .unwrap();
        fs::create_dir_all(proj.join(".claude")).unwrap();
        fs::write(
            proj.join(".claude/settings.local.json"),
            json!({ "hooks": { "Notification": [{ "hooks": [{ "command": "/x/claui-notify.sh" }] }] } })
                .to_string(),
        )
        .unwrap();

        let caps = read_capabilities_from(&home, proj.to_str().unwrap());
        let _ = fs::remove_dir_all(&home);
        let _ = fs::remove_dir_all(&proj);

        assert_eq!(caps.plugins.len(), 1);
        assert_eq!(caps.plugins[0].name, "demo");
        assert_eq!(caps.plugins[0].skill_count, 1);
        assert_eq!(caps.skills.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), vec!["cool"]);
        assert_eq!(caps.permissions.len(), 1);
        assert_eq!(caps.hooks.len(), 1);
        assert_eq!(caps.hooks[0].label, "claui-notify.sh");
    }

    #[test]
    fn read_capabilities_from_missing_roots_is_empty() {
        let caps = read_capabilities_from(Path::new("/nonexistent-claui-home"), "/nonexistent-proj");
        assert!(caps.skills.is_empty());
        assert!(caps.plugins.is_empty());
        assert!(caps.hooks.is_empty());
        assert!(caps.permissions.is_empty());
    }
}
