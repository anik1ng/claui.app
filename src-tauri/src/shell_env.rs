//! Captures the user's interactive-shell environment once at app start, so
//! claui's PTY children see the same `$PATH` / `$FNM_DIR` / `$NVM_DIR` / ...
//! a hand-typed `claude` in Terminal would see.
//!
//! The architectural gap this closes: launchd hands a `.app` GUI launch a
//! minimal `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`) and runs no user shell
//! init. `extra_path_dirs` in `ipc.rs` covers the *static* installs
//! (Homebrew, `~/.cargo/bin`, ...), but every shell-driven version manager
//! (fnm, nvm, asdf, mise, volta, rbenv, pyenv, ...) lives at a dynamic path
//! the user's `.zshrc` sets up via `eval "$(fnm env)"` or equivalent. Those
//! paths can only be discovered by *running* an interactive shell.
//!
//! Strategy: at app start, spawn `$SHELL -i -l -c '<sentinel script>'`,
//! parse the `env -0` block between sentinels, cache the result in a
//! `OnceLock`. `build_spawn_env` then layers that snapshot under its own
//! `CLAUI_*` overlays. This matches what `VSCode` / Cursor / Warp / GitHub
//! Desktop do via the `shell-env` npm package.

use std::collections::HashMap;
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

/// One captured environment: `KEY` → `VALUE`. Empty on capture failure;
/// callers must handle that case by falling back to static defaults.
pub type ShellEnv = HashMap<String, String>;

const SENTINEL_START: &str = "__CLAUI_ENV_BEGIN__";
const SENTINEL_END: &str = "__CLAUI_ENV_END__";
const CAPTURE_TIMEOUT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// Variables that are bound to the *capture-process's* shell session and
/// would mislead a freshly spawned child if propagated. `TERM` is also
/// stripped because the PTY layer sets its own (`xterm-256color`).
const STRIP: &[&str] = &[
    "SHLVL",
    "PWD",
    "OLDPWD",
    "_",
    "TERM",
    "XPC_FLAGS",
    "XPC_SERVICE_NAME",
];

static CACHED: OnceLock<ShellEnv> = OnceLock::new();

/// Kick off the capture on a background thread so the cost overlaps with
/// window paint / Tauri setup. Safe to call multiple times — only the first
/// successful capture seeds the cache (via `OnceLock::get_or_init`).
pub fn warm() {
    std::thread::spawn(|| {
        let _ = get();
    });
}

/// Return the cached shell environment, capturing it now if no prior call
/// has done so. Concurrent callers wait for the first to finish (`OnceLock`
/// invariant) — never run capture twice.
pub fn get() -> &'static ShellEnv {
    CACHED.get_or_init(capture)
}

/// Spawn `$SHELL -i -l -c '<sentinel script>'`, read its stdout with a
/// 5-second timeout, and parse the env block between sentinels. Returns
/// an empty map on any failure (spawn error, timeout, no sentinels, ...).
fn capture() -> ShellEnv {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    // Single-quoted printf args so the shell does no expansion on the
    // sentinels. `env -0` is NUL-separated so multi-line values (rare BASH
    // function exports) don't break the parser. The leading `\n` before
    // END separates the trailing NUL from the sentinel cleanly.
    let script = format!(
        "printf '{SENTINEL_START}\\n'; env -0; printf '\\n{SENTINEL_END}\\n'"
    );

    let Ok(mut child) = Command::new(&shell)
        .args(["-i", "-l", "-c", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return ShellEnv::new();
    };

    let deadline = Instant::now() + CAPTURE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    return ShellEnv::new();
                }
                std::thread::sleep(POLL_INTERVAL);
            }
            Err(_) => return ShellEnv::new(),
        }
    }

    let mut output = String::new();
    if let Some(mut s) = child.stdout.take() {
        if s.read_to_string(&mut output).is_err() {
            return ShellEnv::new();
        }
    }
    parse(&output)
}

/// Pure helper: extract the env block between sentinels in a chatty shell
/// transcript and parse `KEY=VAL` records separated by NUL bytes. STRIP-listed
/// variables are dropped before insertion.
pub(crate) fn parse(output: &str) -> ShellEnv {
    let begin = format!("{SENTINEL_START}\n");
    let Some(start) = output.find(&begin) else {
        return ShellEnv::new();
    };
    let after_start = &output[start + begin.len()..];
    let end = format!("\n{SENTINEL_END}");
    let body = match after_start.find(&end) {
        Some(idx) => &after_start[..idx],
        // No end sentinel — likely the shell crashed mid-dump; salvage
        // whatever made it out so a transient hiccup doesn't strip the
        // whole env.
        None => after_start,
    };

    let mut env = ShellEnv::new();
    for entry in body.split('\0') {
        let Some((k, v)) = entry.split_once('=') else { continue };
        if k.is_empty() {
            continue;
        }
        if STRIP.contains(&k) {
            continue;
        }
        env.insert(k.to_string(), v.to_string());
    }
    env
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(body: &str) -> String {
        format!("{SENTINEL_START}\n{body}\n{SENTINEL_END}\n")
    }

    #[test]
    fn parses_a_clean_env_block() {
        let env = parse(&block("PATH=/usr/bin:/bin\0HOME=/Users/x\0USER=x\0"));
        assert_eq!(env.get("PATH").map(String::as_str), Some("/usr/bin:/bin"));
        assert_eq!(env.get("HOME").map(String::as_str), Some("/Users/x"));
        assert_eq!(env.get("USER").map(String::as_str), Some("x"));
        assert_eq!(env.len(), 3);
    }

    #[test]
    fn ignores_chatter_before_start_sentinel() {
        let chatter = "Welcome to zsh\nplugin loaded: foo\n";
        let body = "PATH=/usr/bin\0HOME=/Users/x\0";
        let env = parse(&format!("{chatter}{}", block(body)));
        assert_eq!(env.get("PATH").map(String::as_str), Some("/usr/bin"));
        assert_eq!(env.len(), 2);
    }

    #[test]
    fn missing_start_sentinel_yields_empty_env() {
        let env = parse("PATH=/usr/bin\0HOME=/Users/x\0");
        assert!(env.is_empty());
    }

    #[test]
    fn missing_end_sentinel_salvages_what_is_present() {
        let unterminated = format!("{SENTINEL_START}\nPATH=/usr/bin\0FOO=bar\0");
        let env = parse(&unterminated);
        assert_eq!(env.get("PATH").map(String::as_str), Some("/usr/bin"));
        assert_eq!(env.get("FOO").map(String::as_str), Some("bar"));
    }

    #[test]
    fn strip_list_filters_session_locals() {
        let env = parse(&block("PATH=/u\0SHLVL=2\0PWD=/tmp\0OLDPWD=/\0_=/bin/env\0TERM=ansi\0HOME=/h\0"));
        assert!(!env.contains_key("SHLVL"));
        assert!(!env.contains_key("PWD"));
        assert!(!env.contains_key("OLDPWD"));
        assert!(!env.contains_key("_"));
        assert!(!env.contains_key("TERM"));
        assert_eq!(env.get("PATH").map(String::as_str), Some("/u"));
        assert_eq!(env.get("HOME").map(String::as_str), Some("/h"));
    }

    #[test]
    fn skips_malformed_entries() {
        // Two malformed entries: one without `=`, one with empty key.
        let env = parse(&block("PATH=/u\0NO_EQUALS_HERE\0=val_with_no_key\0OK=1\0"));
        assert_eq!(env.get("PATH").map(String::as_str), Some("/u"));
        assert_eq!(env.get("OK").map(String::as_str), Some("1"));
        assert_eq!(env.len(), 2);
    }

    #[test]
    fn preserves_equals_in_value() {
        // Values may contain `=`, e.g. `LS_COLORS=ow=01;33:di=01;34`.
        let env = parse(&block("LS_COLORS=ow=01;33:di=01;34\0"));
        assert_eq!(env.get("LS_COLORS").map(String::as_str), Some("ow=01;33:di=01;34"));
    }
}
