use std::path::{Path, PathBuf};

/// Search for the `claude` binary. `exists` is injected so the probing order
/// can be unit-tested without touching the real filesystem.
pub fn find_claude<F>(path_var: &str, home: &Path, exists: F) -> Option<PathBuf>
where
    F: Fn(&Path) -> bool,
{
    // 1. Every directory on $PATH.
    for dir in path_var.split(':').filter(|d| !d.is_empty()) {
        let candidate = Path::new(dir).join("claude");
        if exists(&candidate) {
            return Some(candidate);
        }
    }
    // 2. Known fallback locations, in priority order.
    let fallbacks = [
        home.join(".claude/local/claude"),
        home.join(".npm-global/bin/claude"),
        PathBuf::from("/opt/homebrew/bin/claude"),
        PathBuf::from("/usr/local/bin/claude"),
    ];
    fallbacks.into_iter().find(|p| exists(p))
}

/// Production entry point: probe the real environment.
pub fn locate() -> Option<PathBuf> {
    let path_var = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    find_claude(&path_var, &home, |p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_claude_on_path() {
        let home = Path::new("/home/u");
        let found = find_claude("/usr/bin:/usr/local/bin", home, |p| {
            p == Path::new("/usr/local/bin/claude")
        });
        assert_eq!(found, Some(PathBuf::from("/usr/local/bin/claude")));
    }

    #[test]
    fn falls_back_to_local_install() {
        let home = Path::new("/home/u");
        let found = find_claude("/usr/bin", home, |p| {
            p == Path::new("/home/u/.claude/local/claude")
        });
        assert_eq!(found, Some(PathBuf::from("/home/u/.claude/local/claude")));
    }

    #[test]
    fn returns_none_when_absent() {
        let home = Path::new("/home/u");
        assert_eq!(find_claude("/usr/bin", home, |_| false), None);
    }

    #[test]
    fn path_takes_priority_over_fallbacks() {
        let home = Path::new("/home/u");
        // Both a PATH hit and a fallback exist; PATH must win.
        let found = find_claude("/usr/local/bin", home, |_| true);
        assert_eq!(found, Some(PathBuf::from("/usr/local/bin/claude")));
    }
}
