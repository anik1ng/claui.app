mod claude;
mod ipc;
mod menu;
mod notify;
mod pty;
mod sessions;
mod shell_env;
mod state;
mod statusline;
mod util;
mod window_state;

use state::AppState;

/// Label of the main window. Match the literal `ipc::open_project` already
/// uses to look the window up with `get_webview_window("main")`.
const MAIN_WINDOW_LABEL: &str = "main";

/// Pre-paint JS injected at `WKWebView`'s `atDocumentStart`. Its only job
/// is to set `documentElement.style.colorScheme = 'dark'` on the very
/// first frame, before the bundled CSS loads. On macOS, even when the
/// window's `NSAppearance` is Dark (via `.theme(Some(Theme::Dark))`),
/// `WKWebView` still paints canvas / scrollbars / form controls white
/// until a `color-scheme` declaration takes effect — the inline style
/// here forces that hint regardless of CSS load order. The
/// `MutationObserver` fallback handles the edge case where
/// `document.documentElement` doesn't exist yet at the script's first run.
const INIT_SCRIPT: &str = "(function(){var apply=function(){var r=document.documentElement;if(!r)return false;r.style.colorScheme='dark';return true;};if(!apply()){var obs=new MutationObserver(function(){if(apply())obs.disconnect();});obs.observe(document,{childList:true,subtree:true});}})();";

// `.expect()` on the Tauri builder is deliberate: a failure to build or run
// the app is fatal and unrecoverable — there is no UI left to report it to.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::expect_used)]
#[allow(clippy::too_many_lines)]
pub fn run() {
    tauri::Builder::default()
        // tauri-plugin-window-state restores the main window's last
        // size/position on launch and saves them on every resize/move.
        // Registered before the window is built so the saved frame is
        // applied at WebviewWindowBuilder.build() time. Default StateFlags
        // (size + position + maximized + fullscreen + decorated + visible)
        // also handle the off-screen / missing-monitor recovery cases.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new())
        .setup(|app| {
            // The main window is built programmatically (NOT auto-created
            // from `tauri.conf.json`, whose `windows` array is empty)
            // because `WebviewWindowBuilder` is the only Tauri 2 mechanism
            // that lets us set both `.theme(...)` and
            // `.initialization_script(...)` — together they kill the
            // cold-start white flash. The conf-level `backgroundColor`
            // field is documented as not implemented for the WebView
            // layer on macOS / iOS, so it does not help here.
            // `title_bar_style(Overlay)` hides the native macOS title bar
            // chrome (background + title text) but keeps the traffic lights
            // visible in their standard top-left position, overlaid on top
            // of the webview content. claui draws its own thin top strip
            // (`TitleBar.tsx`) underneath, with a left padding reserved for
            // the traffic lights and `-webkit-app-region: drag` on the
            // center so the user can still drag the window.
            tauri::WebviewWindowBuilder::new(
                app.handle(),
                MAIN_WINDOW_LABEL,
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("claui")
            .inner_size(800.0, 600.0)
            .theme(Some(tauri::Theme::Dark))
            .initialization_script(INIT_SCRIPT)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            // The Tauri drag-drop handler is left ENABLED (not disabled) so
            // dropped files surface their absolute paths via the
            // `tauri://drag-drop` event — the webview side (useFileDrop) types
            // them into the focused terminal, and the handler also suppresses
            // WKWebView's default "navigate to the dropped file" behaviour.
            // An older comment here claimed disabling it was REQUIRED for the
            // title-bar `-webkit-app-region: drag` to move the window; a spike
            // (2026-06-02) disproved that on the current Tauri — window drag and
            // file-drop no longer conflict. See docs/DECISIONS.md.
            .build()?;

            // Warm the interactive-shell env snapshot in the background so
            // its capture cost (typically 50-200 ms) overlaps with window
            // paint. The cache is what `build_spawn_env` reads to give
            // spawned claudes the same PATH / FNM_DIR / NVM_DIR / ... a
            // hand-typed `claude` in Terminal would see — without it,
            // shell-managed version managers (fnm, nvm, asdf, ...) are
            // invisible inside the app.
            shell_env::warm();

            menu::init(app)?;
            if let Err(e) = statusline::install_wrapper() {
                eprintln!("claui: failed to install the statusline wrapper: {e}");
            }
            // Wipe orphan status-*.json files from previous runs before the
            // watcher starts — otherwise they'd surface as phantom
            // `status:update` events for projectIds the new window state
            // doesn't know about, and would never be cleaned up.
            statusline::purge_stale_status_files();
            if let Err(e) = notify::install_script() {
                eprintln!("claui: failed to install the notify hook script: {e}");
            }
            notify::purge_stale_files();
            if let Err(e) = statusline::start_watcher(app.handle().clone()) {
                eprintln!("claui: statusline watcher failed to start: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::open_project,
            ipc::open_command_terminal,
            ipc::pty_input,
            ipc::pty_resize,
            ipc::pty_close,
            ipc::list_sessions,
            ipc::get_window_state,
            ipc::save_window_state,
            ipc::cleanup_project_status,
            ipc::cleanup_tab_notify,
            ipc::stash_pending_activation,
            ipc::activate_pending,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
