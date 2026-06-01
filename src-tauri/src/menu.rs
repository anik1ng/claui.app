use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, Emitter};

/// Build the application menu and wire its events.
///
/// The File submenu owns project and tab shortcuts: Add Project (⌘⇧N),
/// Close Project (⌘⇧W), New Claude Tab (⌘T), New Terminal Tab (⌘⇧T),
/// Close Tab (⌘W). "Open Project" (⌘O) is replaced by "Add Project" because
/// Phase 3b allows multiple projects open simultaneously — there is no single
/// active project to replace, only projects to add to the window.
///
/// The macOS menu intercepts these accelerators before the webview, so the
/// webview's keydown handler is NOT responsible for them — it just subscribes
/// to the `menu:*` events emitted from `on_menu_event` below.
///
/// The `claui` app submenu (leftmost on macOS) follows the macOS convention:
/// "About claui" first, then "Check for Updates…" (no accelerator, emits
/// `menu:check-updates` for the frontend's updater hook), then "Quit". The
/// About panel's metadata is set explicitly so the macOS-native panel shows
/// `Version <x.y.z> (<short git sha>)` — the parenthetical is the build slot,
/// fed by `CLAUI_GIT_SHA` baked in at compile time by `build.rs`. Without this,
/// Tauri's default duplicates the marketing version into the parenthetical
/// (`0.2.0 (0.2.0)`).
///
/// The Window submenu's default `.close_window()` predefined item is dropped
/// because it bound ⌘W to "close the whole window", which would fight
/// File → Close Tab. Closing the window is still possible via the red
/// traffic-light button.
// Linear menu builder — five MenuItemBuilders, four SubmenuBuilders, one
// MenuBuilder, and the `on_menu_event` dispatch. No internal seam splits
// without fragmenting a single declarative menu definition. Listed as an
// R1.5 exception in AUDIT_RULES.md Section 9.
#[allow(clippy::too_many_lines)]
pub fn init(app: &App) -> tauri::Result<()> {
    let check_updates =
        MenuItemBuilder::with_id("check-updates", "Check for Updates…").build(app)?;
    // `version` → the "Version X" line; `short_version` → the "(Y)" build slot,
    // here the short git SHA. Omitting `short_version` (empty SHA on non-repo
    // builds) drops the parenthetical entirely.
    let git_sha = env!("CLAUI_GIT_SHA");
    let about_metadata = AboutMetadataBuilder::new()
        .version(Some(app.package_info().version.to_string()))
        .short_version((!git_sha.is_empty()).then_some(git_sha))
        .copyright(Some("© 2026 anik1ng"))
        .credits(Some(
            "A native desktop shell for Claude Code\nhttps://github.com/anik1ng/claui",
        ))
        .build();
    let app_menu = SubmenuBuilder::new(app, "claui")
        .about(Some(about_metadata))
        .separator()
        .item(&check_updates)
        .separator()
        .quit()
        .build()?;

    let add_project = MenuItemBuilder::with_id("add-project", "Add Project…")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let close_project = MenuItemBuilder::with_id("close-project", "Close Project")
        .accelerator("CmdOrCtrl+Shift+W")
        .build(app)?;
    let new_claude_tab = MenuItemBuilder::with_id("new-claude-tab", "New Claude Tab")
        .accelerator("CmdOrCtrl+Shift+T")
        .build(app)?;
    let new_shell_tab = MenuItemBuilder::with_id("new-shell-tab", "New Terminal Tab")
        .accelerator("CmdOrCtrl+T")
        .build(app)?;
    let close_tab = MenuItemBuilder::with_id("close-tab", "Close Tab")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&add_project)
        .item(&close_project)
        .separator()
        .item(&new_claude_tab)
        .item(&new_shell_tab)
        .item(&close_tab)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
        .build()?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| match event.id().0.as_str() {
        "check-updates" => {
            let _ = app.emit("menu:check-updates", ());
        }
        "add-project" => {
            let _ = app.emit("menu:add-project", ());
        }
        "close-project" => {
            let _ = app.emit("menu:close-project", ());
        }
        "new-claude-tab" => {
            let _ = app.emit("menu:new-claude-tab", ());
        }
        "new-shell-tab" => {
            let _ = app.emit("menu:new-shell-tab", ());
        }
        "close-tab" => {
            let _ = app.emit("menu:close-tab", ());
        }
        _ => {}
    });

    Ok(())
}
