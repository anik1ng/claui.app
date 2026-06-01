use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    emit_git_sha();
    tauri_build::build();
}

/// Capture the current short commit SHA at build time and expose it as the
/// `CLAUI_GIT_SHA` compile-time env var (read by `menu.rs` for the About panel's
/// build slot). End users have no git repo, so this can only be baked in here.
///
/// Best-effort: a missing git / non-repo build (e.g. a source tarball) emits an
/// empty string and the About panel just omits the parenthetical.
fn emit_git_sha() {
    let sha = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    println!("cargo:rustc-env=CLAUI_GIT_SHA={sha}");

    // Rebuild when the checked-out commit changes: HEAD itself moves on branch
    // switch, and the active branch's ref file is rewritten on every new commit.
    let git = Path::new("../.git");
    println!("cargo:rerun-if-changed={}", git.join("HEAD").display());
    if let Ok(head) = fs::read_to_string(git.join("HEAD")) {
        if let Some(reference) = head.strip_prefix("ref: ") {
            println!("cargo:rerun-if-changed={}", git.join(reference.trim()).display());
        }
    }
}
