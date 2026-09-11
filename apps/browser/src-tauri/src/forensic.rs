// Forensic diagnostic module for HWND hierarchy / z-order / lifecycle forensics.
// Writes to %TEMP%\eduos-browser-hwnd-diagnostic.log

#[cfg(target_os = "windows")]
pub mod forensic {
    use std::fs::{File, OpenOptions};
    use std::io::Write;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::time::SystemTime;
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        ChildWindowFromPointEx, GetAncestor, GetClassNameW, GetGUIThreadInfo,
        GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
        IsWindowVisible, IsChild, WindowFromPoint,
        GW_CHILD, GW_HWNDPREV, GW_HWNDNEXT, GWL_EXSTYLE, GWL_STYLE,
        WS_CAPTION, WS_CHILD, WS_DISABLED, WS_EX_APPWINDOW, WS_EX_COMPOSITED,
        WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOPMOST, WS_EX_TRANSPARENT,
        WS_EX_WINDOWEDGE, WS_POPUP, WS_VISIBLE, GA_ROOT, GA_PARENT,
    };
    use windows::Win32::System::Threading::GetCurrentThreadId;

    /// The single log file handle, opened once and held open.
    static LOG_FILE: Mutex<Option<FilePath>> = Mutex::new(None);

    struct FilePath { path: PathBuf }

    /// Call once at app startup. Safe to call multiple times.
    pub fn init_log() {
        let mut guard = LOG_FILE.lock().unwrap();
        if guard.is_some() { return; }

        let temp = std::env::var("TEMP")
            .or_else(|_| std::env::var("TMP"))
            .unwrap_or_else(|_| "C:\\".into());
        let log_path = PathBuf::from(temp).join("eduos-browser-hwnd-diagnostic.log");

        match File::create(&log_path) {
            Ok(mut f) => {
                let _ = write_header(&mut f, &log_path);
                *guard = Some(FilePath { path: log_path });
            }
            Err(e) => {
                eprintln!("FORENSIC: Failed to create {}: {}", log_path.display(), e);
            }
        }
    }

    /// Write startup header.
    fn write_header(f: &mut File, _path: &PathBuf) -> std::io::Result<()> {
        let ts = current_timestamp();
        let exe_path = std::env::current_exe()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "unknown".into());
        let cwd = std::env::current_dir()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "unknown".into());
        let pid = std::process::id();
        let debug_build = cfg!(debug_assertions);
        let arch = std::env::consts::ARCH;

        writeln!(f, "{}", "═".repeat(120))?;
        writeln!(f, "FORENSIC LOG OPENED: {}  PID={}  DEBUG={}", ts, pid, debug_build)?;
        writeln!(f, "  EXE: {}", exe_path)?;
        writeln!(f, "  CWD: {}", cwd)?;
        writeln!(f, "  ARCH: {}", arch)?;
        writeln!(f, "{}", "═".repeat(120))?;
        f.flush()
    }

    /// Current timestamp as "YYYY-MM-DD HH:MM:SS.mmm".
    fn current_timestamp() -> String {
        let now = SystemTime::now();
        let (secs, frac_ms) = match now.duration_since(SystemTime::UNIX_EPOCH) {
            Ok(d) => (d.as_secs() as i64, (d.subsec_nanos() / 1_000_000) as i64),
            Err(_) => (0, 0),
        };
        let days_since_epoch = secs / 86400;
        let secs_of_day = secs % 86400;
        let hour = secs_of_day / 3600;
        let min = (secs_of_day % 3600) / 60;
        let sec = secs_of_day % 60;
        let days = days_since_epoch + 719468;
        let era = days / 146097;
        let doe = days - era * 146097;
        let yoe = (doe - doe/1460 + doe/36524 - doe/146096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365*yoe + yoe/4 - yoe/100);
        let mp = (5*doy + 2) / 153;
        let d = doy - (153*mp+2)/5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = if m <= 2 { y + 1 } else { y };
        format!("{}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}", y, m, d, hour, min, sec, frac_ms)
    }

    /// Thread-safe write to the log file. Appends a line.
    fn write_log(line: &str) {
        if let Ok(guard) = LOG_FILE.lock() {
            if let Some(ref fp) = *guard {
                if let Ok(mut f) = OpenOptions::new().append(true).open(&fp.path) {
                    let ts = current_timestamp();
                    let _ = writeln!(f, "[{}] {}", ts, line);
                    let _ = f.flush();
                    return;
                }
            }
        }
        eprintln!("FORENSIC: {}", line);
    }

    /// Write a section header.
    pub fn section(name: &str) { write_log(&format!("── {} ──", name)); }
    /// Write a stage marker.
    pub fn stage(name: &str) { write_log(&format!("## STAGE: {}", name)); }
    /// Write a k=v line.
    pub fn kv(key: &str, val: &str) { write_log(&format!("  {} = {}", key, val)); }
    /// Write a raw line.
    pub fn line(msg: &str) { write_log(msg); }

    /// Get a window's class name.
    fn class_name(h: HWND) -> String {
        let mut buf = [0u16; 128];
        let len = unsafe { GetClassNameW(h, &mut buf) };
        if len > 0 { String::from_utf16_lossy(&buf[..len as usize]) } else { "?".into() }
    }

    /// Get a window's title.
    fn window_text(h: HWND) -> String {
        let mut buf = [0u16; 256];
        let len = unsafe { GetWindowTextW(h, &mut buf) };
        if len > 0 { String::from_utf16_lossy(&buf[..len as usize]) } else { "".into() }
    }

    /// Get a window's rect in screen coords.
    fn window_rect(h: HWND) -> RECT {
        let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        unsafe { let _ = GetWindowRect(h, &mut r); }
        r
    }

    /// Get a window's style.
    fn window_style(h: HWND) -> i32 {
        unsafe { GetWindowLongW(h, GWL_STYLE) }
    }

    /// Get a window's extended style.
    fn window_exstyle(h: HWND) -> i32 {
        unsafe { GetWindowLongW(h, GWL_EXSTYLE) }
    }

    /// Get process ID.
    fn process_id(h: HWND) -> u32 {
        let mut pid: u32 = 0;
        unsafe { GetWindowThreadProcessId(h, Some(&mut pid)); }
        pid
    }

    /// Format style bits into readable flags.
    fn format_style(style: i32) -> String {
        let mut flags = Vec::new();
        if (style & WS_CHILD.0 as i32) != 0 { flags.push("CHILD"); }
        if (style & WS_POPUP.0 as i32) != 0 { flags.push("POPUP"); }
        if (style & WS_VISIBLE.0 as i32) != 0 { flags.push("VISIBLE"); }
        if (style & WS_DISABLED.0 as i32) != 0 { flags.push("DISABLED"); }
        if (style & WS_CAPTION.0 as i32) != 0 { flags.push("CAPTION"); }
        if flags.is_empty() { format!("0x{:08X}", style) } else { flags.join("|") }
    }

    /// Format exstyle bits into readable flags.
    fn format_exstyle(ex: i32) -> String {
        let mut flags = Vec::new();
        if (ex & WS_EX_TOPMOST.0 as i32) != 0 { flags.push("TOPMOST"); }
        if (ex & WS_EX_WINDOWEDGE.0 as i32) != 0 { flags.push("WINDOWEDGE"); }
        if (ex & WS_EX_APPWINDOW.0 as i32) != 0 { flags.push("APPWINDOW"); }
        if (ex & WS_EX_LAYERED.0 as i32) != 0 { flags.push("LAYERED"); }
        if (ex & WS_EX_COMPOSITED.0 as i32) != 0 { flags.push("COMPOSITED"); }
        if (ex & WS_EX_TRANSPARENT.0 as i32) != 0 { flags.push("TRANSPARENT"); }
        if (ex & WS_EX_NOACTIVATE.0 as i32) != 0 { flags.push("NOACTIVATE"); }
        if flags.is_empty() { format!("0x{:08X}", ex) } else { flags.join("|") }
    }

    /// Walk direct children in top-to-bottom z-order (GW_CHILD then GW_HWNDPREV).
    fn walk_z_order(main_hwnd: HWND) -> Vec<(HWND, String, usize)> {
        let mut results = Vec::new();
        let mut child = match unsafe { GetWindow(main_hwnd, GW_CHILD) } {
            Ok(h) if !h.is_invalid() => h,
            _ => return results,
        };
        let mut idx = 0usize;
        loop {
            results.push((child, class_name(child), idx));
            let next = match unsafe { GetWindow(child, GW_HWNDPREV) } {
                Ok(n) if !n.is_invalid() && n != child => n,
                _ => break,
            };
            child = next;
            idx += 1;
        }
        results
    }

    /// Check WS_EX_TOPMOST.
    fn has_topmost(h: HWND) -> bool {
        (window_exstyle(h) & WS_EX_TOPMOST.0 as i32) != 0
    }

    /// Get z-index of target among main's direct children.
    fn z_index_of(main_hwnd: HWND, target: HWND) -> Option<usize> {
        walk_z_order(main_hwnd).iter().position(|(h, _, _)| *h == target)
    }

    /// Walk ALL WRY_WEBVIEW descendants under a window (recursive), not just direct children.
    /// This is the correct function for the z-order fix, since WRY windows may be at
    /// any depth in the window tree.
    pub fn walk_all_wry_descendants(main_hwnd: HWND) -> Vec<(HWND, RECT, usize)> {
        let mut results = Vec::new();
        walk_wry_recursive(main_hwnd, &mut results, 0);
        results
    }

    fn walk_wry_recursive(h: HWND, results: &mut Vec<(HWND, RECT, usize)>, depth: usize) {
        let cls = class_name(h);
        if cls == "WRY_WEBVIEW" {
            results.push((h, window_rect(h), depth));
        }
        let mut child = match unsafe { GetWindow(h, GW_CHILD) } {
            Ok(c) if !c.is_invalid() => c,
            _ => return,
        };
        loop {
            walk_wry_recursive(child, results, depth + 1);
            let next = match unsafe { GetWindow(child, GW_HWNDNEXT) } {
                Ok(n) if !n.is_invalid() && n != child => n,
                _ => break,
            };
            child = next;
        }
    }

    /// ── Full HWND tree dump ─────────────────────────────────────────────────
    pub fn dump_tree(main_hwnd_raw: isize, stage: &str) {
        if main_hwnd_raw == 0 { return; }
        let h = HWND(main_hwnd_raw as *mut std::ffi::c_void);

        let style = window_style(h);
        let exstyle = window_exstyle(h);
        let rect = window_rect(h);
        let pid = process_id(h);
        let visible = unsafe { IsWindowVisible(h) }.as_bool();
        let is_child = (style & WS_CHILD.0 as i32) != 0;
        let is_topmost = has_topmost(h);
        let children = walk_z_order(h);
        let wry_count = children.iter().filter(|(_, c, _)| *c == "WRY_WEBVIEW").count();

        write_log(&format!("## HWND-TREE {}", stage));
        write_log(&format!(
            "  MAIN hwnd=0x{:X} style={} exstyle={} visible={} child={} topmost={}",
            main_hwnd_raw, format_style(style), format_exstyle(exstyle), visible, is_child, is_topmost
        ));
        write_log(&format!(
            "  RECT=({},{}-{},{}) {}x{} pid={}",
            rect.left, rect.top, rect.right, rect.bottom,
            rect.right - rect.left, rect.bottom - rect.top, pid
        ));
        write_log(&format!("  DIRECT CHILDREN (top→bottom): {}", children.len()));
        for (i, (ch, cls, _)) in children.iter().enumerate() {
            let crect = window_rect(*ch);
            let cex = window_exstyle(*ch);
            let cvis = unsafe { IsWindowVisible(*ch) }.as_bool();
            let ctop = has_topmost(*ch);
            let cz = z_index_of(h, *ch);
            let is_wry = *cls == "WRY_WEBVIEW";
            let wry_tag = if is_wry { " [WRY_WEBVIEW]" } else { "" };
            write_log(&format!(
                "  [{}] z={:?} hwnd=0x{:X}{} cls=\"{}\" visible={} topmost={} exstyle={}",
                i, cz, (*ch).0 as isize, wry_tag, cls, cvis, ctop, format_exstyle(cex)
            ));
            write_log(&format!(
                "       RECT=({},{}-{},{}) {}x{}",
                crect.left, crect.top, crect.right, crect.bottom,
                crect.right - crect.left, crect.bottom - crect.top
            ));

            // Enumerate grandchildren (Chrome_WidgetWin chain).
            let mut gc = match unsafe { GetWindow(*ch, GW_CHILD) } {
                Ok(c) if !c.is_invalid() => c,
                _ => continue,
            };
            let mut gc_idx = 0usize;
            loop {
                let gc_cls = class_name(gc);
                let gc_rect = window_rect(gc);
                let gc_vis = unsafe { IsWindowVisible(gc) }.as_bool();
                let gc_txt = window_text(gc);
                write_log(&format!(
                    "       [{}] hwnd=0x{:X} cls=\"{}\" text=\"{}\" visible={} rect=({},{} {},{})",
                    gc_idx, (gc).0 as isize, gc_cls, gc_txt, gc_vis,
                    gc_rect.left, gc_rect.top, gc_rect.right, gc_rect.bottom
                ));
                let next = match unsafe { GetWindow(gc, GW_HWNDNEXT) } {
                    Ok(n) if !n.is_invalid() && n != gc => n,
                    _ => break,
                };
                gc = next;
                gc_idx += 1;
            }
        }
        write_log(&format!("  WRY_WEBVIEW count: {}", wry_count));
        write_log("## END HWND-TREE");
    }

    /// ── Z-order dump ─────────────────────────────────────────────────────────
    pub fn dump_z_order(main_hwnd_raw: isize, stage: &str) {
        if main_hwnd_raw == 0 { return; }
        let h = HWND(main_hwnd_raw as *mut std::ffi::c_void);
        write_log(&format!("## Z-ORDER {}", stage));
        let children = walk_z_order(h);
        write_log(&format!("  Direct children: {} (top→bottom)", children.len()));
        for (i, (ch, cls, _)) in children.iter().enumerate() {
            let ctop = has_topmost(*ch);
            let crect = window_rect(*ch);
            let is_wry = *cls == "WRY_WEBVIEW";
            let wry_tag = if is_wry { " [WRY_WEBVIEW]" } else { "" };
            write_log(&format!(
                "  [{}] z={} hwnd=0x{:X}{} cls=\"{}\" topmost={} rect=({},{} {},{})",
                i, i, (*ch).0 as isize, wry_tag, cls, ctop,
                crect.left, crect.top, crect.right, crect.bottom
            ));
        }
        let wry_windows: Vec<String> = children.iter()
            .filter(|(_, cls, _)| *cls == "WRY_WEBVIEW")
            .enumerate()
            .map(|(i, (ch, _, _))| format!("WRY[{}]=0x{:X}", i, (*ch).0 as isize))
            .collect();
        if !wry_windows.is_empty() {
            write_log(&format!("  WRY_WEBVIEW windows: {}", wry_windows.join(", ")));
        }
        write_log("## END Z-ORDER");
    }

    /// ── Instrument SetWindowPos ────────────────────────────────────────────────
    pub fn log_setwindowpos(
        main_hwnd_raw: isize,
        target_hwnd: isize,
        insert_after_raw: Option<isize>,
        flags: u32,
        result_ok: bool,
        stage: &str,
    ) {
        if main_hwnd_raw == 0 { return; }
        let insert_str = match insert_after_raw {
            Some(h) if h == -1 => "HWND_TOPMOST".to_string(),
            Some(h) if h == -2 => "HWND_NOTOPMOST".to_string(),
            Some(h) if h == 0  => "HWND_TOP".to_string(),
            Some(h) if h == 1  => "HWND_BOTTOM".to_string(),
            Some(h)             => format!("0x{:X}", h),
            None                => "None".to_string(),
        };
        write_log(&format!(
            "## SETWINDOWPOS {} target=0x{:X} insert_after={} flags=0x{:X} ok={}",
            stage, target_hwnd, insert_str, flags, result_ok
        ));
        dump_z_order(main_hwnd_raw, &format!("  BEFORE-{}", stage));
    }

    /// ── Log a window event ──────────────────────────────────────────────────
    pub fn log_event(hwnd_raw: isize, event: &str, details: &str) {
        let hstr = if hwnd_raw == 0 { "none".to_string() } else { format!("0x{:X}", hwnd_raw) };
        write_log(&format!("## EVENT {} hwnd={} {}", event, hstr, details));
    }

    /// ── Log app metadata ─────────────────────────────────────────────────────
    pub fn log_app_info() {
        let exe = std::env::current_exe()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "?".into());
        write_log(&format!("  app_exe = {}", exe));
        write_log(&format!("  cfg_debug_assertions = {}", cfg!(debug_assertions)));
        write_log(&format!("  target_arch = {}", std::env::consts::ARCH));
        write_log(&format!("  webview2_runtime = {}", webview2_version()));
    }

    fn webview2_version() -> String {
        use std::process::Command;
        let out = Command::new("powershell")
            .args(["-NoProfile", "-Command",
                "try { (Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}').pv } catch { 'unknown' }"])
            .output();
        match out {
            Ok(o) => {
                let v = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if v.is_empty() { "not found".into() } else { v }
            }
            Err(_) => "unknown".into(),
        }
    }

    /// ── Detailed dump of WRY_WEBVIEW windows ─────────────────────────────────
    pub fn dump_wry_pair(main_hwnd_raw: isize, stage: &str) {
        if main_hwnd_raw == 0 { return; }
        let h = HWND(main_hwnd_raw as *mut std::ffi::c_void);
        write_log(&format!("## WRY_PAIR {}", stage));

        let children = walk_z_order(h);
        let wry_windows: Vec<(HWND, String, usize)> = children
            .iter()
            .filter(|(_, cls, _)| *cls == "WRY_WEBVIEW")
            .cloned()
            .collect();

        write_log(&format!("  Found {} WRY_WEBVIEW windows:", wry_windows.len()));
        for (i, (wry, _, _)) in wry_windows.iter().enumerate() {
            let rect = window_rect(*wry);
            let ex = window_exstyle(*wry);
            let style = window_style(*wry);
            let visible = unsafe { IsWindowVisible(*wry) }.as_bool();
            let topmost = has_topmost(*wry);
            let z = z_index_of(h, *wry);
            write_log(&format!(
                "  WRY[{}] z={:?} hwnd=0x{:X} rect=({},{} {},{}) size={}x{} style={} exstyle={} visible={} topmost={}",
                i, z, (*wry).0 as isize,
                rect.left, rect.top, rect.right, rect.bottom,
                rect.right - rect.left, rect.bottom - rect.top,
                format_style(style), format_exstyle(ex), visible, topmost
            ));

            // Count children.
            let mut gc = match unsafe { GetWindow(*wry, GW_CHILD) } {
                Ok(c) if !c.is_invalid() => c,
                _ => { write_log("    children: none"); continue; }
            };
            let mut gc_count = 0usize;
            loop {
                gc_count += 1;
                match unsafe { GetWindow(gc, GW_HWNDNEXT) } {
                    Ok(n) if !n.is_invalid() && n != gc => { gc = n; }
                    _ => break,
                }
            }
            write_log(&format!("    children: {} windows", gc_count));
        }
        write_log("## END WRY_PAIR");
    }

    /// ── Flush log file ───────────────────────────────────────────────────────
    pub fn flush() {
        if let Ok(guard) = LOG_FILE.lock() {
            if let Some(ref fp) = *guard {
                if let Ok(mut f) = OpenOptions::new().append(true).open(&fp.path) {
                    let _ = f.flush();
                }
            }
        }
    }

    /// ── Geometry diagnostic ────────────────────────────────────────────────
    pub fn log_geometry(
        stage: &str,
        main_physical_width: u32,
        main_physical_height: u32,
        scale: f64,
        ui_height: f64,
        browser_logical_x: f64,
        browser_logical_y: f64,
        browser_logical_width: f64,
        browser_logical_height: f64,
    ) {
        let main_logical_width = main_physical_width as f64 / scale;
        let main_logical_height = main_physical_height as f64 / scale;
        let browser_physical_x = browser_logical_x * scale;
        let browser_physical_y = browser_logical_y * scale;
        let browser_physical_width = browser_logical_width * scale;
        let browser_physical_height = browser_logical_height * scale;
        let width_ok = (browser_physical_width as i64 - main_physical_width as i64).abs() <= 2;
        let height_ok = ((browser_physical_y + browser_physical_height) as i64 - main_physical_height as i64).abs() <= 2;
        let width_status = if width_ok { "✓" } else { "✗ MISMATCH" };
        let height_status = if height_ok { "✓" } else { "✗ MISMATCH" };

        write_log(&format!(
            "## GEOMETRY {} [{}]",
            stage,
            if cfg!(debug_assertions) { "DEBUG" } else { "RELEASE" }
        ));
        write_log(&format!("  main_physical  = {}x{}", main_physical_width, main_physical_height));
        write_log(&format!("  scale          = {}", scale));
        write_log(&format!("  main_logical   = {:.2}x{:.2}", main_logical_width, main_logical_height));
        write_log(&format!("  ui_height      = {}", ui_height));
        write_log(&format!("  browser_logical= ({:.2},{:.2}) {:.2}x{:.2}", browser_logical_x, browser_logical_y, browser_logical_width, browser_logical_height));
        write_log(&format!("  browser_physical= ({:.1},{:.1}) {:.1}x{:.1}", browser_physical_x, browser_physical_y, browser_physical_width, browser_physical_height));
        write_log(&format!("  INVARIANT width : browser_physical {:.1} == main_physical {} [{}]", browser_physical_width, main_physical_width, width_status));
        write_log(&format!("  INVARIANT height: browser_y {:.1} + browser_h {:.1} = {:.1} == main_physical {} [{}]", browser_physical_y, browser_physical_height, browser_physical_y + browser_physical_height, main_physical_height, height_status));
        write_log("## END GEOMETRY");
    }

    pub fn log_geometry_partial(stage: &str, main_phys_w: u32, main_phys_h: u32, scale: f64, log_w: f64, log_h: f64) {
        let phys_w = log_w * scale;
        let phys_h = log_h * scale;
        let width_ok = (phys_w as i64 - main_phys_w as i64).abs() <= 2;
        write_log(&format!(
            "## GEOMETRY {}: main_phys={}x{} scale={:.2} browser_logical={:.2}x{:.2} browser_phys={:.1}x{:.1} width_match={}",
            stage, main_phys_w, main_phys_h, scale, log_w, log_h, phys_w, phys_h, if width_ok { "YES" } else { "NO" }
        ));
    }

    /// Inspect which window is visually on top at a given SCREEN coordinate.
    /// This is the key diagnostic for identifying what HWND actually owns
    /// the pixels covering a React overlay that extends below UI_HEIGHT.
    pub fn inspect_point(screen_x: i32, screen_y: i32, stage: &str) {
        write_log(&format!("## POINT_INSPECT {}: screen=({},{})", stage, screen_x, screen_y));

        let pt = POINT { x: screen_x, y: screen_y };

        // Step 1: WindowFromPoint — topmost window at this coordinate.
        let top = unsafe { WindowFromPoint(pt) };
        if top.is_invalid() || top.0.is_null() {
            write_log("  WindowFromPoint: null");
            write_log("## END POINT_INSPECT");
            return;
        }

        write_log(&format!(
            "  WindowFromPoint: hwnd=0x{:X} cls=\"{}\" text=\"{}\"",
            top.0 as isize, class_name(top), window_text(top)
        ));

        // Step 2: Walk the parent chain all the way to the root.
        write_log("  PARENT CHAIN (up to root):");
        let mut cur: HWND = top;
        let mut depth = 0usize;
        loop {
            let root = unsafe { GetAncestor(cur, GA_ROOT) };
            let parent = unsafe { GetAncestor(cur, GA_PARENT) };
            let cur_pid = process_id(cur);
            let cur_rect = window_rect(cur);
            let cur_style = window_style(cur);
            let cur_exstyle = window_exstyle(cur);
            let cur_visible = unsafe { IsWindowVisible(cur) }.as_bool();
            let is_child = (cur_style & WS_CHILD.0 as i32) != 0;
            let is_popup = (cur_style & WS_POPUP.0 as i32) != 0;
            write_log(&format!(
                "  [{:02}] hwnd=0x{:X} cls=\"{}\" text=\"{}\" pid={} visible={} child={} popup={} topmost={} rect=({},{} {},{}) style={} exstyle={}",
                depth,
                cur.0 as isize,
                class_name(cur),
                window_text(cur),
                cur_pid,
                cur_visible,
                is_child,
                is_popup,
                has_topmost(cur),
                cur_rect.left, cur_rect.top, cur_rect.right, cur_rect.bottom,
                format_style(cur_style),
                format_exstyle(cur_exstyle)
            ));

            // If we've reached the root or can't go higher, stop.
            if parent.is_invalid() || parent.0.is_null() || parent == cur {
                write_log(&format!("  [{:02}] -> (root or top, stopping)", depth));
                break;
            }
            // If GetAncestor(GA_ROOT) returns same as current, we ARE the root.
            if root == cur {
                write_log(&format!("  [{:02}] is root window, stopping", depth));
                break;
            }
            cur = parent;
            depth += 1;
            if depth > 20 {
                write_log("  [MAX DEPTH, stopping]");
                break;
            }
        }

        // Step 3: Enumerate siblings at each level from top up to root.
        // "Siblings" = other children of the same parent.
        write_log("  SIBLING Z-ORDER at each level:");
        let mut level_ancestor = top; // walks up the parent chain
        let mut level_depth = 0usize;  // 0=top's siblings, 1=parent's siblings, etc.
        loop {
            // Siblings of level_ancestor = children of its parent.
            let parent_of_level = unsafe { GetAncestor(level_ancestor, GA_PARENT) };
            if parent_of_level.is_invalid() || parent_of_level.0.is_null() || parent_of_level == level_ancestor {
                break;
            }

            // Enumerate all children of parent_of_level (these are siblings of level_ancestor).
            let first = match unsafe { GetWindow(parent_of_level, GW_CHILD) } {
                Ok(h) if !h.is_invalid() => h,
                _ => HWND(std::ptr::null_mut()),
            };
            if !first.is_invalid() && !first.0.is_null() {
                let mut sibling_count = 0usize;
                let mut scan = first;
                loop {
                    let is_me = (scan == top);
                    let marker = if is_me { " <-- ACTIVE" } else { "" };
                    write_log(&format!(
                        "  [z{:02}][{:02}] hwnd=0x{:X} cls=\"{}\" child={} visible={} topmost={} pid={}{}",
                        level_depth, sibling_count,
                        scan.0 as isize,
                        class_name(scan),
                        (window_style(scan) & WS_CHILD.0 as i32) != 0,
                        unsafe { IsWindowVisible(scan) }.as_bool(),
                        has_topmost(scan),
                        process_id(scan),
                        marker
                    ));
                    sibling_count += 1;
                    let next = match unsafe { GetWindow(scan, GW_HWNDNEXT) } {
                        Ok(n) if !n.is_invalid() && n != scan => n,
                        _ => break,
                    };
                    scan = next;
                }
                write_log(&format!("  [z{:02}] parent=0x{:X} total siblings: {}", level_depth, parent_of_level.0 as isize, sibling_count));
            }

            // Move up one level in the parent chain.
            if unsafe { GetAncestor(parent_of_level, GA_ROOT) } == parent_of_level {
                break; // reached the root
            }
            level_ancestor = parent_of_level;
            level_depth += 1;
            if level_depth > 15 { break; }
        }

        // Also enumerate direct children of the main Tauri window for clarity.
        let main_hwnd_for_siblings = unsafe { GetAncestor(top, GA_ROOT) };
        if !main_hwnd_for_siblings.is_invalid() && !main_hwnd_for_siblings.0.is_null() {
            write_log(&format!("  [ROOT-CHILDREN] hwnd=0x{:X}:", main_hwnd_for_siblings.0 as isize));
            let first = match unsafe { GetWindow(main_hwnd_for_siblings, GW_CHILD) } {
                Ok(h) if !h.is_invalid() => h,
                _ => { HWND(std::ptr::null_mut()) }
            };
            if !first.is_invalid() && !first.0.is_null() {
                let mut sibling_count = 0usize;
                let mut scan = first;
                loop {
                    let rect = window_rect(scan);
                    write_log(&format!(
                        "  [z-R][{:02}] hwnd=0x{:X} cls=\"{}\" rect=({},{} {},{}) visible={} topmost={}",
                        sibling_count,
                        scan.0 as isize,
                        class_name(scan),
                        rect.left, rect.top, rect.right, rect.bottom,
                        unsafe { IsWindowVisible(scan) }.as_bool(),
                        has_topmost(scan),
                    ));
                    sibling_count += 1;
                    let next = match unsafe { GetWindow(scan, GW_HWNDNEXT) } {
                        Ok(n) if !n.is_invalid() && n != scan => n,
                        _ => break,
                    };
                    scan = next;
                }
                write_log(&format!("  [ROOT-CHILDREN] total: {}", sibling_count));
            }
        }

        // Step 4: Is the top window a child of the main browser HWND?
        // Walk up from 'top' and check if any ancestor has WRY_WEBVIEW class.
        write_log("  WRY_ANCESTOR CHECK (does any ancestor have class \"WRY_WEBVIEW\"?):");
        let mut check: HWND = top;
        let mut found_wry = false;
        loop {
            let cls = class_name(check);
            if cls == "WRY_WEBVIEW" {
                write_log(&format!("  FOUND WRY_WEBVIEW ancestor: hwnd=0x{:X}", check.0 as isize));
                found_wry = true;
                break;
            }
            let parent = unsafe { GetAncestor(check, GA_PARENT) };
            if parent.is_invalid() || parent.0.is_null() || parent == check {
                break;
            }
            if unsafe { GetAncestor(parent, GA_ROOT) } == parent { break; }
            check = parent;
        }
        if !found_wry {
            write_log("  NO WRY_WEBVIEW ancestor found in chain");
        }

        // Step 5: Find ALL WRY_WEBVIEW windows anywhere in the main window's subtree.
        // This reveals whether both WRY windows exist and at what nesting depth.
        let root_hwnd = unsafe { GetAncestor(top, GA_ROOT) };
        if !root_hwnd.is_invalid() && !root_hwnd.0.is_null() {
            write_log("  ALL WRY_WEBVIEW descendants under root:");
            let all_wry = walk_all_wry_descendants(root_hwnd);
            for (i, (wry_h, wry_rect, depth)) in all_wry.iter().enumerate() {
                let topmost = has_topmost(*wry_h);
                let visible = unsafe { IsWindowVisible(*wry_h) }.as_bool();
                write_log(&format!(
                    "  WRY[{}] depth={} hwnd=0x{:X} rect=({},{} {},{}) visible={} topmost={}",
                    i, depth,
                    wry_h.0 as isize,
                    wry_rect.left, wry_rect.top, wry_rect.right, wry_rect.bottom,
                    visible, topmost
                ));
            }
            if all_wry.is_empty() {
                write_log("  No WRY_WEBVIEW windows found under root!");
            }
        }

        write_log("## END POINT_INSPECT");
    }

    /// Inspect multiple points in one call.
    pub fn inspect_points(stage: &str, points: &[(i32, i32, &str)]) {
        write_log(&format!("## POINT_INSPECT_MULTI {}: {} points", stage, points.len()));
        for (x, y, label) in points {
            write_log(&format!("  POINT: {} = ({}, {})", label, x, y));
            inspect_point(*x, *y, &format!("{}_{}", stage, *label));
        }
        write_log("## END POINT_INSPECT_MULTI");
    }

    /// Geometry-based classification: find the React UI WRY_WEBVIEW.
    ///
    /// Classification criteria (both must be true):
    ///   1. Window top-Y is within TOLERANCE of the main window's top-Y
    ///      (React WRY covers the full UI area starting at the client top)
    ///   2. Window height >= (main_height * 0.95)
    ///      (React WRY spans essentially the full client height)
    ///
    /// The Browser WRY starts at main_top + UI_HEIGHT and has smaller height.
    pub fn find_react_ui_wry(main_hwnd: HWND) -> Option<HWND> {
        let main_rect = window_rect(main_hwnd);
        let main_height = (main_rect.bottom - main_rect.top) as i32;
        let main_top = main_rect.top;

        // Walk all WRY descendants under main.
        let all_wry = walk_all_wry_descendants(main_hwnd);

        let mut candidates: Vec<(HWND, RECT, i32)> = all_wry
            .into_iter()
            .map(|(h, rect, _)| (h, rect, rect.top - main_top))
            .filter(|(_, rect, dy)| {
                // Must be near the main window's top (dy ≈ 0).
                dy.abs() <= 10 && (rect.bottom - rect.top) >= main_height * 95 / 100
            })
            .collect();

        candidates.sort_by_key(|&(_, _, dy)| dy.abs());
        candidates.into_iter().next().map(|(h, _, _)| h)
    }

    /// Geometry-based classification: find the Browser WRY_WEBVIEW.
    ///
    /// Classification criteria (both must be true):
    ///   1. Window top-Y is significantly below the main window's top-Y
    ///      (Browser WRY starts at UI_HEIGHT offset, NOT at client top)
    ///   2. NOT the React UI WRY
    ///
    /// Returns None if there is only one WRY (browser not yet created).
    pub fn find_browser_wry_by_geometry(main_hwnd: HWND) -> Option<HWND> {
        let main_rect = window_rect(main_hwnd);
        let main_top = main_rect.top;

        // Exclude the React UI WRY.
        let react_hwnd = find_react_ui_wry(main_hwnd);

        let all_wry = walk_all_wry_descendants(main_hwnd);
        let mut browser_candidates: Vec<(HWND, RECT, i32)> = all_wry
            .into_iter()
            .map(|(h, rect, _)| (h, rect, rect.top - main_top))
            .filter(|(h, _, dy)| {
                // Must be below the main window's top (dy > tolerance).
                *dy > 10 && (h != &react_hwnd.unwrap_or(HWND(std::ptr::null_mut())))
            })
            .collect();

        // Pick the candidate with the smallest positive dy (closest to UI_HEIGHT offset).
        browser_candidates.sort_by_key(|&(_, _, dy)| dy.abs());
        browser_candidates.into_iter().next().map(|(h, _, _)| h)
    }

    /// Find the browser WRY_WEBVIEW window under the main window.
    /// DEPRECATED: Use find_browser_wry_by_geometry() for reliable classification.
    /// This function returns the FIRST WRY in z-order (topmost), which is the
    /// browser WRY after add_child creates it above the React WRY.
    /// NOTE: This is the inverse of the geometry-based approach — z-order changes
    /// after ensure_react_ui_above_browser runs. Use geometry-based classification
    /// when the invariant may be violated.
    pub fn find_browser_wry(main_hwnd: HWND) -> Option<HWND> {
        let mut child = match unsafe { GetWindow(main_hwnd, GW_CHILD) } {
            Ok(c) if !c.is_invalid() => c,
            _ => return None,
        };
        loop {
            let cls = class_name(child);
            if cls == "WRY_WEBVIEW" {
                return Some(child);
            }
            let next = match unsafe { GetWindow(child, GW_HWNDPREV) } {
                Ok(n) if !n.is_invalid() && n != child => n,
                _ => break,
            };
            child = next;
        }
        None
    }

    /// ── Complete paint hierarchy dump ─────────────────────────────────────────
    /// Recursively enumerates EVERY descendant HWND under main_hwnd.
    /// Logs for each: hwnd, parent hwnd, class, window rect, client rect,
    /// z-order among siblings, visible, WS_EX_TOPMOST, WS_CHILD, WS_CLIPSIBLINGS,
    /// WS_CLIPCHILDREN, and flags if it's a WebView2/IE render surface.
    pub fn dump_webview_paint_hierarchy(main_hwnd_raw: isize, stage: &str) {
        if main_hwnd_raw == 0 { return; }
        let main = HWND(main_hwnd_raw as *mut std::ffi::c_void);

        write_log(&format!(""));
        write_log(&format!("## PAINT_HIERARCHY {}", stage));
        write_log(&format!("  main_hwnd = 0x{:X}", main_hwnd_raw));

        // ── Step 1: Enumerate direct WRY children and their z-order ──────────────
        let wry_children: Vec<(HWND, String, usize)> = walk_z_order(main);

        write_log(&format!("  DIRECT CHILDREN OF MAIN (top→bottom):"));
        let mut wry_slots: Vec<Option<HWND>> = Vec::new();
        for (i, (ch, cls, _)) in wry_children.iter().enumerate() {
            let rect = window_rect(*ch);
            let style = window_style(*ch);
            let exstyle = window_exstyle(*ch);
            let visible = unsafe { IsWindowVisible(*ch) }.as_bool();
            let is_wry = *cls == "WRY_WEBVIEW";
            let wry_tag = if is_wry { " [WRY_WEBVIEW]" } else { "" };
            write_log(&format!(
                "  [{}] z={} hwnd=0x{:X}{} cls=\"{}\" visible={} rect=({},{} {},{}) style=0x{:X} exstyle=0x{:X}",
                i, i,
                (*ch).0 as isize,
                wry_tag,
                cls,
                visible,
                rect.left, rect.top, rect.right, rect.bottom,
                style,
                exstyle
            ));

            if is_wry {
                wry_slots.push(Some(*ch));
            }
        }
        if wry_children.is_empty() {
            write_log("  (no direct children)");
        }

        // ── Step 2: Recursively enumerate ALL descendants of main ───────────────
        write_log(&format!(""));
        write_log(&format!("  ALL DESCENDANTS (recursive):"));

        #[derive(Clone)]
        struct HwndInfo {
            hwnd: HWND,
            parent: HWND,
            depth: usize,
            sibling_idx: usize,
            class: String,
            rect: RECT,
            client_rect: RECT,
            visible: bool,
            style: i32,
            exstyle: i32,
            is_ie_server: bool,
            is_chrome_widget: bool,
            is_webview2: bool,
            pid: u32,
            indent: String,
        }

        impl std::fmt::Display for HwndInfo {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                let w = self.rect.right - self.rect.left;
                let h = self.rect.bottom - self.rect.top;
                let cw = self.client_rect.right - self.client_rect.left;
                let ch = self.client_rect.bottom - self.client_rect.top;
                let has_child = (self.style & WS_CHILD.0 as i32) != 0;
                let has_clip_sib = (self.style & 0x04000000_i32) != 0; // WS_CLIPSIBLINGS = 0x04000000
                let has_clip_child = (self.style & 0x02000000_i32) != 0; // WS_CLIPCHILDREN = 0x02000000
                let is_topmost = (self.exstyle & WS_EX_TOPMOST.0 as i32) != 0;
                let tag = if self.is_ie_server { " [IE_SERVER]" }
                    else if self.is_chrome_widget { " [CHROME_WIDGET]" }
                    else if self.is_webview2 { " [WEBVIEW2]" }
                    else { "" };
                write!(f,
                    "{}hwnd=0x{:X} cls=\"{}{}\" parent=0x{:X} z={} visible={} rect=({},{} {},{}) client=({},{} {},{}) size={}x{} style=0x{:X} exstyle=0x{:X} child={} clipsib={} clipchild={} topmost={} pid={}",
                    self.indent,
                    self.hwnd.0 as isize,
                    self.class,
                    tag,
                    self.parent.0 as isize,
                    self.sibling_idx,
                    self.visible,
                    self.rect.left, self.rect.top, self.rect.right, self.rect.bottom,
                    self.client_rect.left, self.client_rect.top, self.client_rect.right, self.client_rect.bottom,
                    w, h,
                    self.style,
                    self.exstyle,
                    has_child,
                    has_clip_sib,
                    has_clip_child,
                    is_topmost,
                    self.pid
                )
            }
        }

        // Collect all descendants with full info.
        let mut all_descendants: Vec<HwndInfo> = Vec::new();

        fn collect_descendants(
            hwnd: HWND,
            parent: HWND,
            depth: usize,
            results: &mut Vec<HwndInfo>,
        ) {
            let cls = class_name(hwnd);
            let is_ie_server = cls.contains("Internet Explorer_Server") || cls.contains("IEFrame") || cls.contains("TabWindowClass");
            let is_chrome_widget = cls.contains("Chrome_WidgetWin") || cls.contains("RenderWidgetHostHWND") || cls.contains("ContentWindow");
            let is_webview2 = cls.contains("WebView2") || cls.contains("edgehtml") || cls.contains("EdgeView");
            let visible = unsafe { IsWindowVisible(hwnd) }.as_bool();
            let style = window_style(hwnd);
            let exstyle = window_exstyle(hwnd);
            let rect = window_rect(hwnd);

            // Get client rect.
            let mut client_rect = RECT::default();
            unsafe {
                let _ = windows::Win32::UI::WindowsAndMessaging::GetClientRect(hwnd, &mut client_rect);
            }

            // Get sibling index: enumerate siblings to find our position.
            let sibling_idx = {
                let parent_of_h = if !parent.is_invalid() && parent.0 as usize != 0 {
                    parent
                } else {
                    // Walk up to find real parent.
                    let p = unsafe { GetAncestor(hwnd, GA_PARENT) };
                    if p.is_invalid() || p.0 as usize == 0 { return; }
                    p
                };
                let first = match unsafe { GetWindow(parent_of_h, GW_CHILD) } {
                    Ok(c) if !c.is_invalid() => c,
                    _ => { return; }
                };
                if first == hwnd {
                    0
                } else {
                    let mut idx = 0usize;
                    let mut cur = first;
                    loop {
                        if cur == hwnd { break; }
                        match unsafe { GetWindow(cur, GW_HWNDPREV) } {
                            Ok(prev) if !prev.is_invalid() && prev != cur => { cur = prev; idx += 1; }
                            _ => { idx = 0; break; }
                        }
                    }
                    idx
                }
            };

            let pid = process_id(hwnd);
            let indent = "  ".repeat(depth + 2);

            results.push(HwndInfo {
                hwnd,
                parent,
                depth,
                sibling_idx,
                class: cls,
                rect,
                client_rect,
                visible,
                style,
                exstyle,
                is_ie_server,
                is_chrome_widget,
                is_webview2,
                pid,
                indent,
            });

            // Recurse into children.
            let mut child = match unsafe { GetWindow(hwnd, GW_CHILD) } {
                Ok(c) if !c.is_invalid() => c,
                _ => return,
            };
            loop {
                collect_descendants(child, hwnd, depth + 1, results);
                match unsafe { GetWindow(child, GW_HWNDNEXT) } {
                    Ok(next) if !next.is_invalid() && next != child => { child = next; }
                    _ => break,
                }
            }
        }

        collect_descendants(main, HWND::default(), 0, &mut all_descendants);

        // Print all descendants with indentation.
        for info in &all_descendants {
            write_log(&info.to_string());
        }

        write_log(&format!("  Total descendants: {}", all_descendants.len()));

        // ── Step 3: Summary of WebView2/IE render surfaces ──────────────────────
        write_log(&format!(""));
        write_log(&format!("  RENDER SURFACE SUMMARY:"));
        let ie_servers: Vec<_> = all_descendants.iter().filter(|i| i.is_ie_server).collect();
        let chrome_widgets: Vec<_> = all_descendants.iter().filter(|i| i.is_chrome_widget).collect();
        let webview2s: Vec<_> = all_descendants.iter().filter(|i| i.is_webview2).collect();

        if !ie_servers.is_empty() {
            write_log(&format!("  Internet Explorer_Server (or equivalent):"));
            for i in &ie_servers {
                write_log(&format!(
                    "    hwnd=0x{:X} parent=0x{:X} depth={} z={} rect=({},{} {},{}) visible={} pid={}",
                    i.hwnd.0 as isize,
                    i.parent.0 as isize,
                    i.depth,
                    i.sibling_idx,
                    i.rect.left, i.rect.top, i.rect.right, i.rect.bottom,
                    i.visible,
                    i.pid
                ));
            }
        }

        if !chrome_widgets.is_empty() {
            write_log(&format!("  Chrome_WidgetWin / RenderWidgetHostHWND:"));
            for i in &chrome_widgets {
                write_log(&format!(
                    "    hwnd=0x{:X} parent=0x{:X} depth={} z={} rect=({},{} {},{}) visible={} pid={}",
                    i.hwnd.0 as isize,
                    i.parent.0 as isize,
                    i.depth,
                    i.sibling_idx,
                    i.rect.left, i.rect.top, i.rect.right, i.rect.bottom,
                    i.visible,
                    i.pid
                ));
            }
        }

        if !webview2s.is_empty() {
            write_log(&format!("  WebView2 / EdgeHTML:"));
            for i in &webview2s {
                write_log(&format!(
                    "    hwnd=0x{:X} parent=0x{:X} depth={} z={} rect=({},{} {},{}) visible={} pid={}",
                    i.hwnd.0 as isize,
                    i.parent.0 as isize,
                    i.depth,
                    i.sibling_idx,
                    i.rect.left, i.rect.top, i.rect.right, i.rect.bottom,
                    i.visible,
                    i.pid
                ));
            }
        }

        if ie_servers.is_empty() && chrome_widgets.is_empty() && webview2s.is_empty() {
            write_log("  (no IE_Server / Chrome_Widget / WebView2 HWNDs found)");
        }

        // ── Step 4: Assign WRY ownership to render surfaces ─────────────────────
        write_log(&format!(""));
        write_log(&format!("  WRY OWNERSHIP ANALYSIS:"));
        // For each render surface, find which WRY it belongs to by walking up parent chain.
        let all_render: Vec<&HwndInfo> = all_descendants
            .iter()
            .filter(|i| i.is_ie_server || i.is_chrome_widget || i.is_webview2)
            .collect();

        for render in all_render {
            // Walk parent chain from render to root.
            let mut cur: HWND = render.parent;
            let mut chain = vec![render.hwnd];
            let max_up = 20;
            for _ in 0..max_up {
                if cur.is_invalid() || cur.0 as usize == 0 { break; }
                chain.push(cur);
                let p = unsafe { GetAncestor(cur, GA_PARENT) };
                if p.is_invalid() || p == cur { break; }
                cur = p;
            }

            // Find first WRY ancestor.
            let wry_ancestor = chain.iter().find(|&&h| {
                let cls = class_name(h);
                cls == "WRY_WEBVIEW"
            });

            let wry_hwnd = wry_ancestor.copied().map(|h| h.0 as isize).unwrap_or(0);
            write_log(&format!(
                "  Render hwnd=0x{:X} cls=\"{}\" -> WRY ancestor=0x{:X}",
                render.hwnd.0 as isize,
                render.class,
                wry_hwnd
            ));
        }

        // ── Step 5: Z-order of WRY children vs render surfaces ──────────────────
        write_log(&format!(""));
        write_log(&format!("  WRY DIRECT CHILDREN Z-ORDER (top→bottom):"));
        for (ch, cls, _) in &wry_children {
            if *cls == "WRY_WEBVIEW" {
                let mut gc = match unsafe { GetWindow(*ch, GW_CHILD) } {
                    Ok(c) if !c.is_invalid() => c,
                    _ => {
                        write_log(&format!("    WRY=0x{:X}: no children", (*ch).0 as isize));
                        continue;
                    }
                };
                let mut idx = 0usize;
                loop {
                    let gcls = class_name(gc);
                    let gstyle = window_style(gc);
                    let gexstyle = window_exstyle(gc);
                    let gr = window_rect(gc);
                    let gvis = unsafe { IsWindowVisible(gc) }.as_bool();
                    let is_topmost = (gexstyle & WS_EX_TOPMOST.0 as i32) != 0;
                    let is_ie = gcls.contains("Internet Explorer_Server") || gcls.contains("IEFrame") || gcls.contains("TabWindowClass");
                    let is_chrome = gcls.contains("Chrome_WidgetWin") || gcls.contains("RenderWidgetHostHWND");
                    let tag = if is_ie { " [IE_SERVER]" } else if is_chrome { " [CHROME]" } else { "" };
                    write_log(&format!(
                        "    WRY=0x{:X}[{}] hwnd=0x{:X} cls=\"{}{}\" visible={} rect=({},{} {},{}) topmost={}",
                        (*ch).0 as isize,
                        idx,
                        (gc).0 as isize,
                        gcls,
                        tag,
                        gvis,
                        gr.left, gr.top, gr.right, gr.bottom,
                        is_topmost
                    ));
                    idx += 1;
                    match unsafe { GetWindow(gc, GW_HWNDNEXT) } {
                        Ok(next) if !next.is_invalid() && next != gc => { gc = next; }
                        _ => break,
                    }
                }
            }
        }

        write_log("## END PAINT_HIERARCHY");
    }

    /// ── Z-index helper ──────────────────────────────────────────────────────
    /// Returns z-index of target among main's direct children (0 = topmost).
    fn z_index(main: HWND, target: HWND) -> Option<usize> {
        walk_z_order(main).iter().position(|(h, _, _)| *h == target)
    }

    /// ── Find render-surface HWND inside a WRY container ──────────────────────
    /// Recursively searches for the first IE_Server / Chrome_Widget / WebView2
    /// descendant and returns it along with its depth.
    pub fn find_render_surface(wry_hwnd: HWND) -> Option<(HWND, String, usize)> {
        let mut result: Option<(HWND, String, usize)> = None;
        fn search(hwnd: HWND, depth: usize, result: &mut Option<(HWND, String, usize)>) {
            if result.is_some() { return; }
            let cls = class_name(hwnd);
            let is_render = cls.contains("Internet Explorer_Server")
                || cls.contains("IEFrame")
                || cls.contains("TabWindowClass")
                || cls.contains("Chrome_WidgetWin")
                || cls.contains("RenderWidgetHostHWND")
                || cls.contains("ContentWindow")
                || cls.contains("WebView2")
                || cls.contains("edgehtml")
                || cls.contains("EdgeView");
            if is_render {
                *result = Some((hwnd, cls, depth));
                return;
            }
            let mut child = match unsafe { GetWindow(hwnd, GW_CHILD) } {
                Ok(c) if !c.is_invalid() => c,
                _ => return,
            };
            loop {
                search(child, depth + 1, result);
                if result.is_some() { return; }
                match unsafe { GetWindow(child, GW_HWNDNEXT) } {
                    Ok(next) if !next.is_invalid() && next != child => { child = next; }
                    _ => break,
                }
            }
        }
        search(wry_hwnd, 1, &mut result);
        result
    }

    // ============================================================
    // Run the three z-order fix tests
    //
    // TEST 1: SetWindowPos(react_wry, HWND_TOP)
    // TEST 2: SetWindowPos(actual_react_render_hwnd, HWND_TOP)
    // TEST 3: SetWindowPos(actual_browser_render_hwnd, HWND_BOTTOM)
    //
    // After each test, dumps the full paint hierarchy.
    pub fn run_zorder_tests(main_hwnd_raw: isize) {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
            HWND_TOP, HWND_BOTTOM,
        };

        if main_hwnd_raw == 0 {
            return;
        }
        let main = HWND(main_hwnd_raw as *mut std::ffi::c_void);

        let react_wry = find_react_ui_wry(main);
        let browser_wry = find_browser_wry_by_geometry(main);

        write_log("");
        write_log("## ZORDER_TESTS");
        write_log(&format!("  react_wry = {:?}", react_wry.map(|h| format!("0x{:X}", h.0 as isize))));
        write_log(&format!("  browser_wry = {:?}", browser_wry.map(|h| format!("0x{:X}", h.0 as isize))));

        // Find actual render surfaces.
        let react_render = react_wry.and_then(|h| find_render_surface(h));
        let browser_render = browser_wry.and_then(|h| find_render_surface(h));

        write_log(&format!(
            "  react_render = {:?}",
            react_render.as_ref().map(|(h, c, d)| format!("0x{:X} cls=\"{}\" depth={}", h.0 as isize, c, d))
        ));
        write_log(&format!(
            "  browser_render = {:?}",
            browser_render.as_ref().map(|(h, c, d)| format!("0x{:X} cls=\"{}\" depth={}", h.0 as isize, c, d))
        ));

        // ============================================================
        // BASELINE: dump before any changes
        write_log("");
        write_log("============================================================");
        write_log("BASELINE (before any SetWindowPos)");
        dump_webview_paint_hierarchy(main_hwnd_raw, "BASELINE");

        // ============================================================
        // TEST 1: SetWindowPos(react_wry, HWND_TOP)
        if let Some(rh) = react_wry {
            write_log("");
            write_log("============================================================");
            write_log(&format!("TEST 1: SetWindowPos(react_wry=0x{:X}, HWND_TOP)", rh.0 as isize));
            unsafe {
                let _ = SetWindowPos(rh, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
            let react_z = z_index(main, rh);
            let browser_z = browser_wry.and_then(|bh| z_index(main, bh));
            write_log(&format!("  Result: react_wry z={:?} browser_wry z={:?}", react_z, browser_z));
            if react_z < browser_z {
                write_log("  TEST 1 PASSED: React WRY is above Browser WRY");
            } else {
                write_log("  TEST 1 FAILED: React WRY is NOT above Browser WRY");
            }
            dump_webview_paint_hierarchy(main_hwnd_raw, "TEST1_AFTER");
        } else {
            write_log("  TEST 1 SKIPPED: react_wry not found");
        }

        // ============================================================
        // TEST 2: SetWindowPos(actual_react_render_hwnd, HWND_TOP)
        if let Some((rr_h, rr_cls, rr_depth)) = react_render {
            write_log("");
            write_log("============================================================");
            write_log(&format!(
                "TEST 2: SetWindowPos(react_render=0x{:X} cls=\"{}\" depth={}, HWND_TOP)",
                rr_h.0 as isize,
                rr_cls,
                rr_depth
            ));

            // First restore: set react_wry back to bottom.
            if let (Some(_rh), Some(bh)) = (react_wry, browser_wry) {
                unsafe {
                    let _ = SetWindowPos(bh, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                }
            }

            unsafe {
                let _ = SetWindowPos(rr_h, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
            write_log("  SetWindowPos called on render surface");

            // Check render surface's parent z-order.
            let render_parent = unsafe { GetAncestor(rr_h, GA_PARENT) };
            let render_z = z_index(main, rr_h);
            let parent_z = if render_parent == main {
                z_index(main, rr_h)
            } else {
                z_index(main, render_parent)
            };
            write_log(&format!("  react_render z={:?} parent_z={:?}", render_z, parent_z));
            dump_webview_paint_hierarchy(main_hwnd_raw, "TEST2_AFTER");
        } else {
            write_log("  TEST 2 SKIPPED: react_render not found");
        }

        // ============================================================
        // TEST 3: SetWindowPos(actual_browser_render_hwnd, HWND_BOTTOM)
        if let Some((br_h, br_cls, br_depth)) = browser_render {
            write_log("");
            write_log("============================================================");
            write_log(&format!(
                "TEST 3: SetWindowPos(browser_render=0x{:X} cls=\"{}\" depth={}, HWND_BOTTOM)",
                br_h.0 as isize,
                br_cls,
                br_depth
            ));

            // First restore react_wry above browser_wry.
            if let (Some(_rh), Some(bh)) = (react_wry, browser_wry) {
                unsafe {
                    let _ = SetWindowPos(bh, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                }
            }

            unsafe {
                let _ = SetWindowPos(br_h, Some(HWND_BOTTOM), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
            write_log("  SetWindowPos called on browser render surface");

            let br_z = z_index(main, br_h);
            write_log(&format!("  browser_render z={:?}", br_z));
            dump_webview_paint_hierarchy(main_hwnd_raw, "TEST3_AFTER");
        } else {
            write_log("  TEST 3 SKIPPED: browser_render not found");
        }

        // ============================================================
        // RESTORE FINAL STATE: React WRY on top
        write_log("");
        write_log("============================================================");
        write_log("RESTORING: React WRY at HWND_TOP");
        if let Some(rh) = react_wry {
            unsafe {
                let _ = SetWindowPos(rh, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
            write_log(&format!("  SetWindowPos(react_wry=0x{:X}, HWND_TOP) called", rh.0 as isize));
        }

        write_log("## END ZORDER_TESTS");
    }
}

// Re-export all forensic functions at the module root so callers can use
// `forensic::stage(...)` instead of `forensic::forensic::stage(...)`.
#[cfg(target_os = "windows")]
pub use forensic::{
    init_log, section, stage, kv, line,
    dump_tree, dump_z_order, dump_wry_pair,
    log_setwindowpos, log_event, log_app_info,
    log_geometry, log_geometry_partial,
    flush,
    inspect_point, inspect_points,
    walk_all_wry_descendants, find_browser_wry,
    find_react_ui_wry, find_browser_wry_by_geometry,
    dump_webview_paint_hierarchy,
    find_render_surface,
    run_zorder_tests,
};

/// Helper: get raw isize HWND from tauri::Window.
#[cfg(target_os = "windows")]
pub fn raw_hwnd(window: &tauri::Window) -> isize {
    match window.hwnd() {
        Ok(h) => h.0 as isize,
        Err(_) => 0,
    }
}

/// Helper: get raw isize HWND from tauri::WebviewWindow.
#[cfg(target_os = "windows")]
pub fn raw_hwnd_webview(window: &tauri::WebviewWindow) -> isize {
    match window.hwnd() {
        Ok(h) => h.0 as isize,
        Err(_) => 0,
    }
}
