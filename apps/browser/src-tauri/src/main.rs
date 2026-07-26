// EduOS Browser
//
// One visible, taskbar-showing window ("main" - TabBar + NavBar, built
// automatically from tauri.conf.json so it reliably resolves devUrl in
// dev / frontendDist in production). A second window ("browser", the
// actual page content) is created as a *child* of "main" via
// WebviewWindowBuilder::parent(), hidden from the taskbar, and kept
// perfectly glued to "main" (position/size/minimize/close) so the app
// looks and behaves like a single window - same as a real browser -
// without relying on Tauri's still-buggy `unstable` multiwebview feature
// (see https://github.com/tauri-apps/tauri/issues/10011, which causes
// child webviews created via `add_child` to randomly render blank).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

/// Height of the TabBar (40px) + NavBar (48px) React chrome, in logical px.
const UI_HEIGHT: f64 = 88.0;

/// "main" is resizable and "browser" is not - on Windows a resizable,
/// borderless window gets an invisible hit-test border for resize
/// grabbing that isn't reflected in inner_position()/inner_size(), so
/// without compensating, "browser" (which has no such border) can render
/// a few pixels off from "main"'s actual visible left/right edge.
/// Both are in LOGICAL px (scaled by the display's DPI factor below).
/// Tune these two independently until both edges line up exactly:
///   - Gap/overlap on the LEFT edge → adjust EDGE_INSET_LEFT
///   - Gap/overlap on the RIGHT edge → adjust EDGE_INSET_RIGHT
/// Positive = push that edge further out. Negative = pull it back in.
const EDGE_INSET_LEFT: f64 = 8.0;
const EDGE_INSET_RIGHT: f64 = -7.0;

/// Default homepage / default search engine landing page.
const HOMEPAGE: &str = "https://www.google.com";

/// Physical-pixel geometry for the "browser" window: matches "main"'s
/// content area exactly, widened by the (DPI-scaled) edge inset on the
/// left/right so it visually lines up with the tab bar above it.
struct BrowserGeometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn compute_browser_geometry(
    main_pos: PhysicalPosition<i32>,
    main_size: PhysicalSize<u32>,
    scale: f64,
) -> BrowserGeometry {
    let ui_height_px = (UI_HEIGHT * scale).round() as i32;
    let left_inset_px = (EDGE_INSET_LEFT * scale).round() as i32;
    let right_inset_px = (EDGE_INSET_RIGHT * scale).round() as i32;

    BrowserGeometry {
        x: main_pos.x - left_inset_px,
        y: main_pos.y + ui_height_px,
        // Shifting x left by left_inset_px would itself shrink the right
        // edge by that same amount unless width also grows by
        // left_inset_px (to keep the right edge anchored) - then
        // right_inset_px on top of that to nudge the right edge further.
        width: (main_size.width as i32 + left_inset_px + right_inset_px).max(0) as u32,
        height: (main_size.height as i32 - ui_height_px).max(0) as u32,
    }
}

/// Recompute and apply the "browser" window's position/size so it always
/// sits directly under the "main" window's chrome, no matter where "main"
/// is moved/resized/maximized to.
fn sync_browser_layout(app: &tauri::AppHandle) {
    let (Some(main), Some(browser)) = (
        app.get_webview_window("main"),
        app.get_webview_window("browser"),
    ) else {
        return;
    };

    let Ok(pos) = main.inner_position() else { return };
    let Ok(size) = main.inner_size() else { return };
    let scale = main.scale_factor().unwrap_or(1.0);

    let geo = compute_browser_geometry(pos, size, scale);
    let _ = browser.set_position(PhysicalPosition::new(geo.x, geo.y));
    let _ = browser.set_size(PhysicalSize::new(geo.width, geo.height));
}

#[tauri::command]
fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("Window not found")?;
    main.minimize().map_err(|e| e.to_string())?;
    // Take the content window down with it, so only one thing appears
    // (or disappears) in the taskbar / alt-tab switcher.
    if let Some(browser) = app.get_webview_window("browser") {
        let _ = browser.hide();
    }
    Ok(())
}

#[tauri::command]
fn toggle_maximize(app: tauri::AppHandle) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("Window not found")?;
    let is_max = main.is_maximized().map_err(|e| e.to_string())?;
    if is_max {
        main.unmaximize().map_err(|e| e.to_string())?;
    } else {
        main.maximize().map_err(|e| e.to_string())?;
    }
    sync_browser_layout(&app);
    Ok(())
}

#[tauri::command]
fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview_window("browser") {
        let _ = browser.close();
    }
    let main = app.get_webview_window("main").ok_or("Window not found")?;
    main.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn navigate_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let window = app.get_webview_window("browser").ok_or("Browser not found")?;
    // JSON-encode the URL so quotes/special chars can't break the script.
    let encoded = serde_json::to_string(&url).map_err(|e| e.to_string())?;
    let script = format!("window.location.href = {}", encoded);
    window.eval(&script).map_err(|e| e.to_string())
}

#[tauri::command]
async fn reload_browser(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("browser").ok_or("Browser not found")?;
    window
        .eval("window.location.reload()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn back_browser(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("browser").ok_or("Browser not found")?;
    window
        .eval("window.history.back()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn forward_browser(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("browser").ok_or("Browser not found")?;
    window
        .eval("window.history.forward()")
        .map_err(|e| e.to_string())
}

fn main() {
    log::info!("Starting EduOS Browser v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            minimize_window,
            toggle_maximize,
            close_window,
            get_app_version,
            navigate_browser,
            reload_browser,
            back_browser,
            forward_browser,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // "main" already exists at this point - Tauri built it from
            // the `windows` entry in tauri.conf.json (this is what keeps
            // devUrl/frontendDist resolution correct in both dev and the
            // built .exe).
            let main_window = app
                .get_webview_window("main")
                .expect("main window not found");

            let main_pos = main_window.inner_position().unwrap_or_default();
            let main_size = main_window
                .inner_size()
                .unwrap_or(tauri::PhysicalSize { width: 1280, height: 800 });
            let scale = main_window.scale_factor().unwrap_or(1.0);

            // Same geometry formula used on every later resize/move, so
            // the very first frame the user sees is already aligned -
            // no "snap into place" after the first resize.
            let geo = compute_browser_geometry(main_pos, main_size, scale);

            // `.position()` / `.inner_size()` on the builder below expect
            // LOGICAL pixels, while our computed geometry is PHYSICAL -
            // convert, or on any scaled display (>100%) the browser
            // window ends up rendered too tall/too wide.
            let logical_x = geo.x as f64 / scale;
            let logical_y = geo.y as f64 / scale;
            let logical_width = geo.width as f64 / scale;
            let logical_height = geo.height as f64 / scale;

            // "browser" - the actual page content, parented to "main" so
            // it moves/minimizes together with it, defaults to Google,
            // and never shows up as its own taskbar entry.
            let _browser = WebviewWindowBuilder::new(
                &handle,
                "browser",
                WebviewUrl::External(HOMEPAGE.parse().unwrap()),
            )
            .title("EduOS Browser")
            .position(logical_x, logical_y)
            .inner_size(logical_width, logical_height)
            .decorations(false)
            // Locked: size/position are only ever set programmatically
            // (via sync_browser_layout) to match "main" exactly - the
            // user can never drag-resize this window on its own.
            .resizable(false)
            .skip_taskbar(true)
            .visible(true)
            .focused(true)
            .parent(&main_window)
            .expect("failed to parent browser window to main")
            .build()
            .expect("failed to create browser window");

            // Keep "browser" glued to "main" on every move/resize, and
            // bring it back when "main" is restored/focused after being
            // minimized (see `minimize_window`, which hides it).
            let resize_handle = handle.clone();
            main_window.on_window_event(move |event| match event {
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                    sync_browser_layout(&resize_handle);
                }
                tauri::WindowEvent::Focused(true) => {
                    if let Some(browser) = resize_handle.get_webview_window("browser") {
                        let _ = browser.show();
                    }
                    sync_browser_layout(&resize_handle);
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    if let Some(browser) = resize_handle.get_webview_window("browser") {
                        let _ = browser.close();
                    }
                }
                _ => {}
            });

            log::info!("Browser setup complete: main + browser (parented, single taskbar entry)");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EduOS Browser");
}
