#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod startup_profiler;

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn minimize_window(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn toggle_maximize(window: tauri::Window) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn close_window(window: tauri::Window) {
    window.close().unwrap_or_default();
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn main() {
    env_logger::init();

    let profiler_start = std::time::Instant::now();

    let program_start = std::time::Instant::now();

    log::info!("Starting EduOS Teacher v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let total_elapsed = program_start.elapsed().as_millis() as u64;
            log::info!("[STARTUP] Total elapsed at setup(): {}ms", total_elapsed);

            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "windows")]
            {
                use std::ffi::c_int;
                const DWMWA_WINDOW_CORNER_PREFERENCE: c_int = 33;
                const DWMWCP_DONOTROUND: c_int = 1;

                #[link(name = "dwmapi")]
                extern "system" {
                    fn DwmSetWindowAttribute(
                        hwnd: *mut std::ffi::c_void,
                        dwAttribute: c_int,
                        pvAttribute: *const c_int,
                        cbAttribute: c_int,
                    ) -> c_int;
                }

                if let Ok(hwnd) = window.hwnd() {
                    let hwnd_raw = hwnd.0 as *mut std::ffi::c_void;
                    let pref = DWMWCP_DONOTROUND;
                    unsafe {
                        DwmSetWindowAttribute(
                            hwnd_raw,
                            DWMWA_WINDOW_CORNER_PREFERENCE,
                            &pref as *const c_int,
                            std::mem::size_of::<c_int>() as c_int,
                        );
                    }
                    log::info!("DWM rounded corners disabled on main window");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            minimize_window,
            toggle_maximize,
            close_window,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running EduOS Teacher");
}
