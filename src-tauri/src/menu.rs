use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, Emitter};

/// Build the application menu and wire its events.
///
/// The menu keeps the standard macOS submenus — App (About, Quit), Edit
/// (copy/paste are needed for a terminal), Window — and adds File → Open
/// Project…, whose click emits `menu:open-project` to the webview, where
/// `App.tsx` opens the folder picker.
pub fn init(app: &App) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, "claui")
        .about(None)
        .separator()
        .quit()
        .build()?;

    let open_project = MenuItemBuilder::with_id("open-project", "Open Project…")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&open_project)
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
        .separator()
        .close_window()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
        .build()?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        if event.id() == "open-project" {
            let _ = app.emit("menu:open-project", ());
        }
    });

    Ok(())
}
