use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
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
    let app_menu = SubmenuBuilder::new(app, "claui")
        .about(None)
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
        .accelerator("CmdOrCtrl+T")
        .build(app)?;
    let new_shell_tab = MenuItemBuilder::with_id("new-shell-tab", "New Terminal Tab")
        .accelerator("CmdOrCtrl+Shift+T")
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
