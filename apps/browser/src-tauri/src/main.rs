























#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ═══════════════════════════════════════════════════════════════════════════════
// Browser window management
// ═══════════════════════════════════════════════════════════════════════════════



/// Disable Windows 11 DWM rounded corners on the main Tauri window only.
/// Uses DwmSetWindowAttribute with DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_DONOTROUND.
/// Does NOT modify WebView2 child HWNDs.
#[cfg(target_os = "windows")]
fn disable_main_window_rounded_corners(window: &tauri::WebviewWindow) {
    use std::ffi::c_int;

    
    const DWMWA_WINDOW_CORNER_PREFERENCE: c_int = 33;
    
    const DWMWCP_DONOTROUND: c_int = 1;

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(hwnd: *mut std::ffi::c_void,
                                 dwAttribute: c_int,
                                 pvAttribute: *const c_int,
                                 cbAttribute: c_int) -> c_int;
    }

    let hwnd = window.hwnd().expect("Failed to get HWND");
    let hwnd_raw = hwnd.0 as *mut std::ffi::c_void;
    let pref = DWMWCP_DONOTROUND;

    unsafe {
        let result = DwmSetWindowAttribute(hwnd_raw, DWMWA_WINDOW_CORNER_PREFERENCE, &pref, std::mem::size_of::<c_int>() as c_int);
        if result == 0 {
            log::info!("DWM rounded corners disabled on main window");
        } else {
            log::warn!("DwmSetWindowAttribute failed with code: {}", result);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn disable_main_window_rounded_corners(_window: &tauri::WebviewWindow) {}

/// Forensic: enumerate all HWNDs in the tree starting from main_window.
/// Logs class name, window text, rect, visible state, and z-order index for every child.
/// Also recursively enumerates descendants. Used for debugging child WebView z-order issues.
#[cfg(target_os = "windows")]
fn enumerate_hwnd_tree(main_window: &tauri::Window, label: &str) {
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetWindow, GetWindowTextW, GetWindowRect, IsWindowVisible,
        GW_CHILD, GW_HWNDNEXT,
    };

    let main_hwnd = match main_window.hwnd() {
        Ok(h) => h,
        Err(_) => {
            log::error!("[HWND-TREE] {}: failed to get main HWND", label);
            return;
        }
    };

    log::info!("[HWND-TREE] === {} === main_hwnd={:?} ===", label, main_hwnd.0);

    // Get z-order index of a child relative to main (0 = topmost).
    fn z_order_index(main: HWND, target: HWND) -> Option<usize> {
        unsafe {
            let mut child = GetWindow(main, GW_CHILD).ok()?;
            let mut idx = 0usize;
            loop {
                if child == target {
                    return Some(idx);
                }
                match GetWindow(child, GW_HWNDNEXT) {
                    Ok(next) if !next.is_invalid() => { child = next; idx += 1; }
                    _ => return None,
                }
            }
        }
    }

    // Get class name of an HWND.
    fn class_name(h: HWND) -> String {
        let mut buf = [0u16; 128];
        let len = unsafe { GetClassNameW(h, &mut buf) };
        if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            "?".to_string()
        }
    }

    // Get window text of an HWND.
    fn window_text(h: HWND) -> String {
        let mut buf = [0u16; 256];
        let len = unsafe { GetWindowTextW(h, &mut buf) };
        if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            "".to_string()
        }
    }

    // Get rect of an HWND.
    fn window_rect(h: HWND) -> RECT {
        let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        unsafe { let _ = GetWindowRect(h, &mut r); }
        r
    }

    // Recursively enumerate descendants up to a depth limit.
    fn enumerate_descendants(hwnd: HWND, indent: usize, max_depth: usize) {
        if indent >= max_depth {
            log::info!("{}  [max depth reached]", "  ".repeat(indent));
            return;
        }
        let mut child = match unsafe { GetWindow(hwnd, GW_CHILD) } {
            Ok(c) if !c.is_invalid() => c,
            _ => return,
        };
        loop {
            let cls = class_name(child);
            let txt = window_text(child);
            let rect = window_rect(child);
            let visible = unsafe { IsWindowVisible(child) }.as_bool();
            let z_idx = z_order_index(hwnd, child);
            log::info!(
                "{}  child: hwnd={:?} class=\"{}\" text=\"{}\" visible={} z={:?} rect=({},{} {},{}",
                "  ".repeat(indent),
                child.0, cls, txt, visible, z_idx,
                rect.left, rect.top, rect.right, rect.bottom
            );
            enumerate_descendants(child, indent + 1, max_depth);
            match unsafe { GetWindow(child, GW_HWNDNEXT) } {
                Ok(next) if !next.is_invalid() && next != child => child = next,
                _ => break,
            }
        }
    }

    // Enumerate direct children of main.
    let mut child = match unsafe { GetWindow(main_hwnd, GW_CHILD) } {
        Ok(c) if !c.is_invalid() => c,
        _ => {
            log::info!("[HWND-TREE] {}: main has no children", label);
            return;
        }
    };

    let mut idx = 0usize;
    loop {
        let cls = class_name(child);
        let txt = window_text(child);
        let rect = window_rect(child);
        let visible = unsafe { IsWindowVisible(child) }.as_bool();
        log::info!(
            "[HWND-TREE]   [{}] hwnd={:?} class=\"{}\" text=\"{}\" visible={} rect=({},{} {},{}",
            idx, child.0, cls, txt, visible, rect.left, rect.top, rect.right, rect.bottom
        );
        enumerate_descendants(child, 1, 3);
        match unsafe { GetWindow(child, GW_HWNDNEXT) } {
            Ok(next) if !next.is_invalid() && next != child => { child = next; idx += 1; }
            _ => break,
        }
    }

    log::info!("[HWND-TREE] === {} === end ===", label);
}

#[cfg(target_os = "windows")]
/// Enforce sibling z-order invariant: React UI WRY must be ABOVE Browser WRY.
///
/// Uses geometry-based classification:
/// Z-order invariant: Browser WRY must be above React WRY (browser z < react z).
/// Lower z-index means visually higher on screen.
///
/// Classification by geometry:
///   - React UI WRY: top-Y ≈ main window top, spans full client height
///   - Browser WRY: top-Y ≈ UI_HEIGHT offset, smaller height
///
/// Applies SetWindowPos(browser_hwnd, HWND_TOP) so browser renders above React UI.
/// Since browser WRY starts at y=UI_HEIGHT and React WRY covers the full window,
/// they do NOT geometrically overlap — browser shows through its non-UI area.
/// React UI (with transparent title bar area) overlays the top of the browser content.
#[cfg(target_os = "windows")]
fn ensure_react_ui_above_browser(main_window: &tauri::Window) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindow, SetWindowPos, GW_CHILD, GW_HWNDPREV, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, HWND_TOP,
    };

    let main_hwnd = match main_window.hwnd() {
        Ok(h) => h,
        Err(_) => return,
    };

    log::info!("[ZORDER] === ensure_react_ui_above_browser: BEFORE ===");
    enumerate_hwnd_tree(main_window, "before-fix");

    // Write forensic log snapshot BEFORE fix.
    forensic::dump_tree(main_hwnd.0 as isize, "BEFORE-zorder-fix");
    forensic::dump_z_order(main_hwnd.0 as isize, "BEFORE-zorder-fix");

    // Walk all children to find WRY_WEBVIEW containers.
    // GW_CHILD = topmost; GW_HWNDPREV = previous (toward bottom).
    let mut child = match unsafe { GetWindow(main_hwnd, GW_CHILD) } {
        Ok(h) if !h.is_invalid() => h,
        _ => return,
    };

    let mut oldest_wry_child = child;
    let mut z_idx = 0usize;
    let mut oldest_wry_z = 0usize;
    let mut wry_children: Vec<(usize, windows::Win32::Foundation::HWND)> = Vec::new();

    loop {
        let mut class_buf = [0u16; 64];
        let len = unsafe { windows::Win32::UI::WindowsAndMessaging::GetClassNameW(child, &mut class_buf) };
        if len > 0 {
            let class_name = String::from_utf16_lossy(&class_buf[..len as usize]);
            log::info!(
                "[ZORDER]   child[{}] hwnd={:?} class=\"{}\"",
                z_idx, child.0, class_name
            );
            if class_name == "WRY_WEBVIEW" {
                wry_children.push((z_idx, child));
                oldest_wry_child = child;
                oldest_wry_z = z_idx;
            }
        }
        match unsafe { GetWindow(child, GW_HWNDPREV) } {
            Ok(next) if !next.is_invalid() && next != child => { child = next; z_idx += 1; }
            _ => break,
        }
    }

    log::info!(
        "[ZORDER] Found {} WRY_WEBVIEW children: oldest at z={} hwnd={:?}",
        wry_children.len(), oldest_wry_z, oldest_wry_child.0
    );

    // Approach: bring the OLDEST WRY_WEBVIEW (React UI) to the TOP.
    log::info!(
        "[ZORDER] Bringing oldest WRY_WEBVIEW (z={}, hwnd={:?}) to HWND_TOP",
        oldest_wry_z, oldest_wry_child.0
    );
    let setwindowpos_ok = unsafe {
        let r = SetWindowPos(
            oldest_wry_child,
            Some(HWND_TOP),
            0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
        log::info!("[ZORDER] SetWindowPos result: {:?}", r.is_ok());
        r.is_ok()
    };

    // Forensic: log the SetWindowPos call.
    forensic::log_setwindowpos(
        main_hwnd.0 as isize,
        oldest_wry_child.0 as isize,
        Some(0), // HWND_TOP
        (SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE).0,
        setwindowpos_ok,
        "zorder-fix",
    );

    log::info!("[ZORDER] === ensure_react_ui_above_browser: AFTER ===");
    enumerate_hwnd_tree(main_window, "after-fix");

    // Forensic: dump tree AFTER fix.
    forensic::dump_tree(main_hwnd.0 as isize, "AFTER-zorder-fix");
    forensic::dump_z_order(main_hwnd.0 as isize, "AFTER-zorder-fix");
}

#[cfg(not(target_os = "windows"))]
fn ensure_react_ui_above_browser(main_window: &tauri::Window) {}

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, Rect, Webview, WebviewUrl, WebviewWindowBuilder,
};

mod startup_profiler;
mod forensic;
use forensic::{
    dump_tree, dump_webview_paint_hierarchy, dump_wry_pair, dump_z_order,
    find_browser_wry_by_geometry, find_react_ui_wry, find_render_surface,
    init_log, inspect_point, inspect_points,
    kv, line, log_app_info, log_event, log_setwindowpos, section, stage,
};
use startup_profiler::StartupProfiler;

/// A single overlay exclusion rectangle, in browser WRY local coordinates (physical pixels).
/// Coordinates are relative to the browser WRY window origin.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct OverlayRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

/// Shared state for browser overlay exclusion rectangles.
struct BrowserOverlayState {
    /// Active exclusion rectangles, in browser WRY local coordinates.
    rects: Mutex<Vec<OverlayRect>>,
}

impl Default for BrowserOverlayState {
    fn default() -> Self {
        Self { rects: Mutex::new(Vec::new()) }
    }
}

/// Applies the compound exclusion region to the browser WRY.
///
/// Region = full browser WRY client area MINUS all active overlay exclusion rectangles.
/// Takes the browser WRY handle and its physical bounds (from GetWindowRect).
#[cfg(target_os = "windows")]
fn apply_browser_exclusion_region(
    browser_wry_h: windows::Win32::Foundation::HWND,
    browser_rect: &windows::Win32::Foundation::RECT,
    overlays: &[OverlayRect],
) {
    use windows::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn, HRGN};

    let w = browser_rect.right - browser_rect.left;
    let h = browser_rect.bottom - browser_rect.top;

    log::info!(
        "[OVERLAY] apply_browser_exclusion_region: browser={:x} size={}x{} count={}",
        browser_wry_h.0 as isize, w, h, overlays.len()
    );

    // Step 1: create the full browser region
    let full_region = unsafe { CreateRectRgn(0, 0, w, h) };
    if full_region.is_invalid() {
        log::error!("[OVERLAY] CreateRectRgn failed for full browser region");
        return;
    }

    // Step 2: subtract each overlay rectangle using raw FFI
    // Win32 CombineRgn(hdnDest, hdnSrc1, hdnSrc2, fnCombine)
    // RGN_DIFF = 4: dest = src1 MINUS src2 (set difference)
    // NOTE: CombineRgn modifies hrgnDest IN-PLACE. We must NOT use the
    // same HRGN as both dest and src1 when chaining — that would mutate
    // the accumulated result. Instead, accumulate into a SEPARATE result HRGN.
    #[link(name = "gdi32")]
    extern "system" {
        fn CombineRgn(hrgnDest: HRGN, hrgnSrc1: HRGN, hrgnSrc2: HRGN, iMode: i32) -> i32;
        fn DeleteObject(hObject: HRGN) -> i32;
    }
    const RGN_DIFF: i32 = 4;

    // Start with a copy of the full region as our result
    // Use full_region as both src1 and src2 of a NULL combine → creates a copy
    let result_region = unsafe { CreateRectRgn(0, 0, 0, 0) };
    if result_region.is_invalid() {
        log::error!("[OVERLAY] CreateRectRgn failed for result region");
        unsafe { DeleteObject(full_region) };
        return;
    }
    // CombineRgn(result, NULL, NULL, RGN_AND) → result = NULL
    // CombineRgn(result, full_region, NULL, RGN_COPY) → result = full_region (copy)
    // Use RGN_COPY mode (2) to copy full_region into result_region
    let copy_result = unsafe { CombineRgn(result_region, full_region, HRGN::default(), 2) };
    if copy_result < 0 {
        log::error!("[OVERLAY] Failed to copy full region: {}", copy_result);
        unsafe { DeleteObject(full_region); DeleteObject(result_region) };
        return;
    }
    for ov in overlays {
        // Clamp overlay to browser bounds
        let ox1 = ov.x.max(0).min(w);
        let oy1 = ov.y.max(0).min(h);
        let ox2 = (ov.x + ov.width).max(0).min(w);
        let oy2 = (ov.y + ov.height).max(0).min(h);
        if ox1 >= ox2 || oy1 >= oy2 {
            continue;
        }
        log::info!(
            "[OVERLAY] exclusion: rect({},{} {},{})",
            ox1, oy1, ox2, oy2
        );

        let excl = unsafe { CreateRectRgn(ox1, oy1, ox2, oy2) };
        if excl.is_invalid() {
            continue;
        }

        // result_region = result_region - excl (RGN_DIFF = set difference)
        let _ = unsafe { CombineRgn(result_region, result_region, excl, RGN_DIFF) };
        unsafe { DeleteObject(excl); }
    }

    // Clean up the full_region copy (SetWindowRgn takes ownership of result_region)
    unsafe { DeleteObject(full_region); }

    // Step 3: apply to browser WRY
    // Note: SetWindowRgn takes ownership of the HRGN.
    // SetWindowRgn returns BOOL (non-zero = success).
    let applied = unsafe { SetWindowRgn(browser_wry_h, Some(result_region), true) };
    if applied != 0 {
        log::info!("[OVERLAY] exclusion region applied to browser WRY");
    } else {
        log::error!("[OVERLAY] SetWindowRgn failed");
    }
}

/// Removes any custom region from the browser WRY, restoring full client area.
#[cfg(target_os = "windows")]
fn clear_browser_exclusion_region(
    browser_wry_h: windows::Win32::Foundation::HWND,
    browser_rect: &windows::Win32::Foundation::RECT,
) {
    use windows::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn};

    let w = browser_rect.right - browser_rect.left;
    let h = browser_rect.bottom - browser_rect.top;

    let full_region = unsafe { CreateRectRgn(0, 0, w, h) };
    if !full_region.is_invalid() {
        unsafe { SetWindowRgn(browser_wry_h, Some(full_region), true); };
        log::info!("[OVERLAY] browser region restored to full area");
    }
}


const UI_HEIGHT: f64 = 88.0;
const HOMEPAGE: &str = "https://www.google.com";


const TEMPORAL_GAP_THRESHOLD_MS: u64 = 300_000; 
const MIN_SEQUENCE_SIZE: usize = 2; 





#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct MemorySnapshot {
    pub timestamp: u64,
    
    pub combined_rss_mb: f64,
    pub combined_virt_mb: f64,
    
    pub total_ram_mb: f64,
    pub available_ram_mb: f64,
    
    pub pressure_level: String,      
    pub pressure_ratio: f64,         
}


#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct NavigationEvent {
    pub timestamp: u64,              
    pub url: String,                 
    pub domain: Option<String>,       
    pub action: String,              
    pub tab_id: String,              
    pub duration_ms: Option<u64>,    
    pub memory_rss_mb: Option<f64>,  
    pub memory_pressure: Option<String>, 
}


#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct DomainTable {
    pub domains: Vec<String>,        
    pub url_entries: Vec<UrlEntry>,  
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct UrlEntry {
    pub domain_id: u32,              
    pub path_hash: u64,             
    pub path_ref: Option<u32>,       
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct TabSnapshot {
    pub tab_id: String,
    pub current_url: String,
    pub history_count: usize,
    pub created_at: u64,
    pub last_accessed: u64,
}



/// Event types for lifecycle actions
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleEventType {
    EvictRequested,
    EvictCompleted,
    EvictFailed,
    RestoreRequested,
    RestoreCompleted,
    RestoreFailed,
    SuspendRequested,
    SuspendCompleted,
    SuspendFailed,
}

/// Lifecycle state of a tab
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleState {
    Active,
    Idle,
    Suspended,
    Evicted,
    Restoring,
    Uninitialized,
    Destroyed,
}

impl std::fmt::Display for LifecycleState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LifecycleState::Active => write!(f, "active"),
            LifecycleState::Idle => write!(f, "idle"),
            LifecycleState::Suspended => write!(f, "suspended"),
            LifecycleState::Evicted => write!(f, "evicted"),
            LifecycleState::Restoring => write!(f, "restoring"),
            LifecycleState::Uninitialized => write!(f, "uninitialized"),
            LifecycleState::Destroyed => write!(f, "destroyed"),
        }
    }
}

/// Process identity for tracking (stable across PID reuse)
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq, Hash)]
pub struct ProcessIdentity {
    pub pid: u32,
    pub start_time: u64,
    pub name: String,
}

/// Process state snapshot for before/after comparison
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ProcessStateSnapshot {
    pub timestamp_ms: u64,
    pub group_memory_mb: f64,
    pub process_count: u32,
    pub processes: Vec<ProcessIdentity>,
}

/// Global sequence counter for event ordering
use std::sync::atomic::{AtomicU64, Ordering};
static EVENT_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn next_event_sequence() -> u64 {
    EVENT_SEQUENCE.fetch_add(1, Ordering::SeqCst)
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
}

/// Capture current process state for comparison (single-pass)
fn capture_process_state(sys: &System) -> ProcessStateSnapshot {
    let timestamp_ms = current_timestamp_ms();

    
    let mut processes = Vec::new();
    let mut group_memory_mb = 0.0;

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();

        
        let is_webview2 = name.contains("msedgewebview2")
            || name.contains("msedge")
            || name.contains("chrome")
            || name.contains("browser")
            || name.contains("renderer");

        if is_webview2 || name.contains("eduos") {
            let start_time = process.start_time();
            let mem_mb = process.memory() as f64 / (1024.0 * 1024.0);
            group_memory_mb += mem_mb;
            processes.push(ProcessIdentity {
                pid: pid.as_u32(),
                start_time,
                name,
            });
        }
    }

    ProcessStateSnapshot {
        timestamp_ms,
        group_memory_mb,
        process_count: processes.len() as u32,
        processes,
    }
}

/// Emit lifecycle event via Tauri AND store for benchmark query
fn emit_lifecycle_event(app: &tauri::AppHandle, event: LifecycleEvent) {
    let event_type = event.event_type.clone();

    
    let label = format!("lifecycle:{:?}", event_type);
    if let Err(e) = app.emit(&label, event.clone()) {
        log::warn!("Failed to emit lifecycle event: {}", e);
    }

    
    let event_store = app.state::<LifecycleEventStore>();
    event_store.record_event(event);
}




#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SequenceAnalysis {
    pub total_navigations: usize,
    pub unique_domains: usize,
    pub domain_sequence: Vec<String>,         
    pub temporal_gaps_ms: Vec<u64>,          
    pub gap_markers: Vec<GapMarker>,         
    pub proposed_labels: Vec<SequenceLabel>, 
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct GapMarker {
    pub before_idx: usize,
    pub after_idx: usize,
    pub gap_ms: u64,
    pub exceeds_threshold: bool,
    pub proposed_reason: Option<String>, 
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SequenceLabel {
    pub sequence_start: usize,
    pub sequence_end: usize,
    pub label: String,              
    pub confidence: f64,            
    pub method: String,             
    pub evidence: Vec<String>,      
}



#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ResearchSession {
    pub id: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub total_navigations: usize,
    pub gap_markers_count: usize,
    pub analysis_count: usize,  
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ResearchExport {
    pub session: ResearchSession,
    pub navigation_events: Vec<NavigationEvent>,  
    pub memory_snapshots: Vec<MemorySnapshot>,   
    pub literature_notes: Vec<String>,           
    pub research_questions: Vec<String>,          
}



const MAX_MEMORY_SNAPSHOTS: usize = 1000;

struct MemoryTracker {
    snapshots: Vec<MemorySnapshot>,
    last_update: Instant,
}

impl Default for MemoryTracker {
    fn default() -> Self {
        Self {
            snapshots: Vec::new(),
            last_update: Instant::now(),
        }
    }
}

struct TabManager {
    tabs: Mutex<HashMap<String, TabData>>,
    /// Bounded history: max MAX_HISTORY_ENTRIES URLs, FIFO eviction
    history: Mutex<Vec<String>>,
}

/// Maximum URLs to retain in browser history (FIFO eviction)
const MAX_HISTORY_ENTRIES: usize = 500;

#[derive(Clone)]
struct TabData {
    id: String,
    history_index: usize,
    created_at: u64,
    last_accessed: u64,
}

impl Default for TabManager {
    fn default() -> Self {
        Self {
            tabs: Mutex::new(HashMap::new()),
            history: Mutex::new(Vec::new()),
        }
    }
}










#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WebViewState {
    Uninitialized,  
    Creating,        
    Active,          
    Idle,            
    Destroyed,       
    Restoring,       
}

impl Default for WebViewState {
    fn default() -> Self {
        Self::Uninitialized
    }
}

struct WebViewLifecycle {
    state: Mutex<WebViewState>,
    last_activity: Mutex<Instant>,
    idle_threshold_secs: Mutex<u64>,  
    last_url: Mutex<Option<String>>, 
    last_tab_id: Mutex<Option<String>>, 
}

impl Default for WebViewLifecycle {
    fn default() -> Self {
        Self {
            state: Mutex::new(WebViewState::Uninitialized),
            last_activity: Mutex::new(Instant::now()),
            idle_threshold_secs: Mutex::new(300), 
            last_url: Mutex::new(None),
            last_tab_id: Mutex::new(None),
        }
    }
}

impl WebViewLifecycle {
    fn mark_active(&self) {
        *self.last_activity.lock().unwrap() = Instant::now();
        *self.state.lock().unwrap() = WebViewState::Active;
    }

    fn mark_idle(&self) {
        *self.state.lock().unwrap() = WebViewState::Idle;
    }

    fn should_destroy(&self) -> bool {
        let state = *self.state.lock().unwrap();
        if state != WebViewState::Idle && state != WebViewState::Active {
            return false;
        }
        let idle = self.last_activity.lock().unwrap().elapsed();
        let threshold = *self.idle_threshold_secs.lock().unwrap();
        idle.as_secs() >= threshold
    }

    fn set_destroyed(&self) {
        *self.state.lock().unwrap() = WebViewState::Destroyed;
    }

    fn set_restoring(&self) {
        *self.state.lock().unwrap() = WebViewState::Restoring;
    }

    fn get_state(&self) -> WebViewState {
        *self.state.lock().unwrap()
    }

    fn record_navigation_sync(&self, url: &str, tab_id: &str) {
        *self.last_url.lock().unwrap() = Some(url.to_string());
        *self.last_tab_id.lock().unwrap() = Some(tab_id.to_string());
    }

    fn set_idle_threshold(&self, seconds: u64) {
        *self.idle_threshold_secs.lock().unwrap() = seconds;
    }
}

/// Holds the browser child WebView handle.
/// Created via `Window::add_child` as a direct child of the main window,
/// so it has no separate native top-level window.
struct BrowserWebview {
    webview: Mutex<Option<Webview>>,
}

impl Default for BrowserWebview {
    fn default() -> Self {
        Self {
            webview: Mutex::new(None),
        }
    }
}














const MAX_NAVIGATION_EVENTS: usize = 1000;
const MAX_DOMAIN_SEQUENCE: usize = 1000;
const MAX_GAP_MARKERS: usize = 100;

struct SequenceTracker {
    events: Vec<NavigationEvent>,
    last_navigation_time: Option<Instant>,
    domain_sequence: Vec<String>,
    gap_markers: Vec<GapMarker>,
}

impl Default for SequenceTracker {
    fn default() -> Self {
        Self {
            events: Vec::new(),
            last_navigation_time: None,
            domain_sequence: Vec::new(),
            gap_markers: Vec::new(),
        }
    }
}

impl SequenceTracker {
    fn extract_domain(url: &str) -> Option<String> {
        url::Url::parse(url).ok().and_then(|u| u.host_str().map(|h| h.to_string()))
    }

    fn add_event(&mut self, event: NavigationEvent) {
        
        if let Some(ref domain) = event.domain {
            if self.domain_sequence.len() >= MAX_DOMAIN_SEQUENCE {
                self.domain_sequence.remove(0);
            }
            self.domain_sequence.push(domain.clone());
        }

        
        if let Some(last_time) = self.last_navigation_time {
            let gap_ms = last_time.elapsed().as_millis() as u64;
            if gap_ms >= TEMPORAL_GAP_THRESHOLD_MS && self.events.len() >= MIN_SEQUENCE_SIZE {
                if self.gap_markers.len() >= MAX_GAP_MARKERS {
                    self.gap_markers.remove(0);
                }
                let marker = GapMarker {
                    before_idx: self.events.len() - 1,
                    after_idx: self.events.len(),
                    gap_ms,
                    exceeds_threshold: true,
                    proposed_reason: Some("temporal_gap".to_string()),
                };
                self.gap_markers.push(marker);
            }
        }

        self.last_navigation_time = Some(Instant::now());

        
        if self.events.len() >= MAX_NAVIGATION_EVENTS {
            self.events.remove(0);
        }
        self.events.push(event);
    }

    fn analyze_sequence(&self) -> SequenceAnalysis {
        let total_navigations = self.events.len();
        let unique_domains: usize = self.events.iter()
            .filter_map(|e| e.domain.clone())
            .collect::<std::collections::HashSet<_>>()
            .len();

        
        let mut temporal_gaps_ms = Vec::new();
        for i in 1..self.events.len() {
            let prev_ts = self.events[i-1].timestamp;
            let curr_ts = self.events[i].timestamp;
            if curr_ts > prev_ts {
                temporal_gaps_ms.push(curr_ts - prev_ts);
            }
        }

        SequenceAnalysis {
            total_navigations,
            unique_domains,
            domain_sequence: self.domain_sequence.clone(),
            temporal_gaps_ms,
            gap_markers: self.gap_markers.clone(),
            proposed_labels: Vec::new(), 
        }
    }
}



/// Benchmark metadata for run comparison and reproducibility
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct BenchmarkMetadata {
    pub run_id: String,
    pub workload_id: String,
    pub run_index: u32,
    pub condition: String,  

    
    pub os: String,
    pub os_version: String,
    pub cpu_brand: String,
    pub cpu_count: usize,
    pub ram_mb: u64,
    pub webview2_version: Option<String>,

    
    pub app_version: String,
    pub build_type: String,

    
    pub idle_threshold_secs: u64,
    pub memory_pressure_thresholds: PressureThresholds,

    
    pub start_time_ms: u64,
    pub end_time_ms: Option<u64>,
    pub duration_ms: Option<u64>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PressureThresholds {
    pub low: f64,      
    pub medium: f64,   
    pub high: f64,     
    pub critical: f64,  
}

impl Default for PressureThresholds {
    fn default() -> Self {
        Self {
            low: 0.50,
            medium: 0.20,
            high: 0.10,
            critical: 0.10,
        }
    }
}

/// Benchmark comparison result
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct BenchmarkComparison {
    pub metadata: BenchmarkMetadata,
    pub events: Vec<LifecycleEvent>,
    pub stats: LifecycleEventStats,

    
    pub peak_memory_mb: f64,
    pub mean_memory_mb: Option<f64>,
    pub samples: Vec<f64>,
}

const MAX_LIFECYCLE_EVENTS: usize = 1000;
const MAX_COMPARISONS: usize = 100;

/// Stores lifecycle events and benchmark metadata for analysis
struct LifecycleEventStore {
    /// Current benchmark metadata
    metadata: Mutex<Option<BenchmarkMetadata>>,
    /// Current benchmark run ID
    benchmark_run_id: Mutex<Option<String>>,
    /// Current workload ID
    workload_id: Mutex<Option<String>>,
    /// Current condition (control/treatment)
    condition: Mutex<Option<String>>,
    /// Run index within experiment sequence
    run_index: Mutex<u32>,
    /// All recorded lifecycle events
    events: Mutex<Vec<LifecycleEvent>>,
    /// Benchmark comparisons for this run (bounded: MAX_COMPARISONS)
    comparisons: Mutex<Vec<BenchmarkComparison>>,
}

impl Default for LifecycleEventStore {
    fn default() -> Self {
        Self {
            metadata: Mutex::new(None),
            benchmark_run_id: Mutex::new(None),
            workload_id: Mutex::new(None),
            condition: Mutex::new(None),
            run_index: Mutex::new(0),
            events: Mutex::new(Vec::new()),
            comparisons: Mutex::new(Vec::new()),
        }
    }
}

impl LifecycleEventStore {
    /// Set the current benchmark run with full metadata
    fn start_benchmark_run(&self, metadata: BenchmarkMetadata) {
        let run_id = metadata.run_id.clone();
        let workload_id = metadata.workload_id.clone();
        let condition = metadata.condition.clone();

        *self.metadata.lock().unwrap() = Some(metadata);
        *self.benchmark_run_id.lock().unwrap() = Some(run_id);
        *self.workload_id.lock().unwrap() = Some(workload_id);
        *self.condition.lock().unwrap() = Some(condition);

        
        self.events.lock().unwrap().clear();

        log::info!("Benchmark run started with full metadata");
    }

    /// Record a benchmark comparison result (bounded: MAX_COMPARISONS, FIFO eviction)
    fn record_comparison(&self, comparison: BenchmarkComparison) {
        let mut comparisons = self.comparisons.lock().unwrap();
        if comparisons.len() >= MAX_COMPARISONS {
            comparisons.remove(0); 
        }
        comparisons.push(comparison);
    }

    /// Get current benchmark metadata
    fn get_metadata(&self) -> Option<BenchmarkMetadata> {
        self.metadata.lock().unwrap().clone()
    }

    /// Get current benchmark run ID
    fn get_benchmark_run(&self) -> (Option<String>, Option<String>, Option<String>) {
        let run_id = self.benchmark_run_id.lock().unwrap().clone();
        let workload_id = self.workload_id.lock().unwrap().clone();
        let condition = self.condition.lock().unwrap().clone();
        (run_id, workload_id, condition)
    }

    /// Get run index
    fn get_run_index(&self) -> u32 {
        *self.run_index.lock().unwrap()
    }

    /// Increment and get next run index
    fn next_run_index(&self) -> u32 {
        let mut idx = self.run_index.lock().unwrap();
        *idx += 1;
        *idx
    }

    /// Record a lifecycle event
    fn record_event(&self, event: LifecycleEvent) {
        let event_type = event.event_type.clone();
        let mut events = self.events.lock().unwrap();
        let (run_id, workload_id, condition) = {
            let r = self.benchmark_run_id.lock().unwrap();
            let w = self.workload_id.lock().unwrap();
            let c = self.condition.lock().unwrap();
            (r.clone(), w.clone(), c.clone())
        };

        
        let mut event_with_meta = event;
        event_with_meta.benchmark_run_id = run_id;
        event_with_meta.workload_id = workload_id;
        event_with_meta.condition = condition.clone();
        event_with_meta.condition = condition;

        
        if events.len() >= MAX_LIFECYCLE_EVENTS {
            events.remove(0);
        }
        events.push(event_with_meta);

        
        log::debug!("Recorded lifecycle event: {:?}", event_type);
    }

    /// Get all events for current benchmark run
    fn get_events(&self) -> Vec<LifecycleEvent> {
        self.events.lock().unwrap().clone()
    }

    /// Get events filtered by type
    fn get_events_by_type(&self, event_type: &LifecycleEventType) -> Vec<LifecycleEvent> {
        self.events.lock().unwrap()
            .iter()
            .filter(|e| &e.event_type == event_type)
            .cloned()
            .collect()
    }

    /// Get event statistics
    fn get_stats(&self) -> LifecycleEventStats {
        let events = self.events.lock().unwrap();
        let total = events.len();

        let mut evict_requested = 0;
        let mut evict_completed = 0;
        let mut evict_failed = 0;
        let mut restore_requested = 0;
        let mut restore_completed = 0;
        let mut restore_failed = 0;

        let mut action_success_count = 0;
        let mut state_transition_count = 0;
        let mut memory_reclaimed_count = 0;
        let mut process_change_count = 0;

        for event in events.iter() {
            match event.event_type {
                LifecycleEventType::EvictRequested => evict_requested += 1,
                LifecycleEventType::EvictCompleted => evict_completed += 1,
                LifecycleEventType::EvictFailed => evict_failed += 1,
                LifecycleEventType::RestoreRequested => restore_requested += 1,
                LifecycleEventType::RestoreCompleted => restore_completed += 1,
                LifecycleEventType::RestoreFailed => restore_failed += 1,
                _ => {}
            }

            if event.action_succeeded { action_success_count += 1; }
            if event.state_transition_effective { state_transition_count += 1; }
            if event.memory_reclaimed { memory_reclaimed_count += 1; }
            if event.process_group_changed { process_change_count += 1; }
        }

        let total_f = total as f64;
        LifecycleEventStats {
            total_events: total,
            evict_requested,
            evict_completed,
            evict_failed,
            restore_requested,
            restore_completed,
            restore_failed,
            action_success_rate: if total > 0 { action_success_count as f64 / total_f } else { 0.0 },
            state_transition_rate: if total > 0 { state_transition_count as f64 / total_f } else { 0.0 },
            memory_reclamation_rate: if total > 0 { memory_reclaimed_count as f64 / total_f } else { 0.0 },
            process_change_rate: if total > 0 { process_change_count as f64 / total_f } else { 0.0 },
        }
    }
}

/// Statistics for lifecycle events
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct LifecycleEventStats {
    pub total_events: usize,
    pub evict_requested: usize,
    pub evict_completed: usize,
    pub evict_failed: usize,
    pub restore_requested: usize,
    pub restore_completed: usize,
    pub restore_failed: usize,
    pub action_success_rate: f64,
    pub state_transition_rate: f64,
    pub memory_reclamation_rate: f64,
    pub process_change_rate: f64,
}

/// Extended LifecycleEvent with benchmark correlation
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct LifecycleEvent {
    /// Unique event identifier
    pub event_id: String,
    /// Sequence number for ordering (events may arrive out-of-order via async)
    pub sequence: u64,
    /// Wall clock timestamp
    pub timestamp_ms: u64,

    /// Benchmark correlation
    pub benchmark_run_id: Option<String>,
    pub workload_id: Option<String>,
    pub condition: Option<String>,  

    /// Event classification
    pub event_type: LifecycleEventType,
    pub tab_id: String,

    /// State transition
    pub previous_state: String,
    pub new_state: String,

    /// Context
    pub pressure_level: String,
    pub reason: String,

    /// Process group state BEFORE action
    pub process_before: ProcessStateSnapshot,
    /// Process group state AFTER action
    pub process_after: ProcessStateSnapshot,

    /// DELTA - what changed
    pub memory_delta_mb: f64,
    pub processes_added: Vec<ProcessIdentity>,
    pub processes_removed: Vec<ProcessIdentity>,

    /// Outcome assessments (SEPARATE concerns)
    pub action_succeeded: bool,
    /// Effective = state transition occurred AND webview was affected
    pub state_transition_effective: bool,
    /// Memory reclaimed = significant memory decrease after action
    pub memory_reclaimed: bool,
    /// Process group changed = processes added/removed
    pub process_group_changed: bool,

    /// Human-readable summary
    pub summary: String,
}

impl LifecycleEvent {
    /// Create a new lifecycle event with sequence number
    pub fn new(
        event_id: String,
        sequence: u64,
        event_type: LifecycleEventType,
        tab_id: String,
        previous_state: String,
        new_state: String,
        pressure_level: String,
        reason: String,
        process_before: ProcessStateSnapshot,
        process_after: ProcessStateSnapshot,
        action_succeeded: bool,
    ) -> Self {
        let memory_delta_mb = process_after.group_memory_mb - process_before.group_memory_mb;

        
        let processes_removed: Vec<ProcessIdentity> = process_before
            .processes
            .iter()
            .filter(|p| !process_after.processes.contains(p))
            .cloned()
            .collect();

        
        let processes_added: Vec<ProcessIdentity> = process_after
            .processes
            .iter()
            .filter(|p| !process_before.processes.contains(p))
            .cloned()
            .collect();

        
        let state_transition_effective = previous_state != new_state;
        let memory_reclaimed = memory_delta_mb < -5.0; 
        let process_group_changed = !processes_removed.is_empty() || !processes_added.is_empty();

        let summary = format!(
            "{:?} {}: {} -> {} | mem: {:+.1}MB | procs: {:+}/{:+} | action_ok={} state_ok={} mem_ok={} proc_ok={}",
            event_type,
            tab_id,
            previous_state,
            new_state,
            memory_delta_mb,
            processes_added.len(),
            processes_removed.len(),
            action_succeeded,
            state_transition_effective,
            memory_reclaimed,
            process_group_changed
        );

        Self {
            event_id,
            sequence,
            timestamp_ms: current_timestamp_ms(),
            benchmark_run_id: None,
            workload_id: None,
            condition: None,
            event_type,
            tab_id,
            previous_state,
            new_state,
            pressure_level,
            reason,
            process_before,
            process_after,
            memory_delta_mb,
            processes_added,
            processes_removed,
            action_succeeded,
            state_transition_effective,
            memory_reclaimed,
            process_group_changed,
            summary,
        }
    }
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    format!("{:x}{:x}", now.as_secs(), now.subsec_nanos())
}



struct SessionManager {
    current_session: Option<ResearchSession>,
    literature_notes: Vec<String>,
    research_questions: Vec<String>,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self {
            current_session: None,
            literature_notes: vec![
                
                "Activity Theory: Leontiev (1978) - Activity/Action/Operation hierarchy".to_string(),
                "Situated Cognition: Brown, Collins, Duguid (1989) - Knowledge is context-dependent".to_string(),
                "Distributed Cognition: Hutchins (1995) - Cognition spreads across tools".to_string(),
                "Cognitive Load Theory: Sweller (1988) - Working memory limits".to_string(),
                
                "NOTE: We observe URL sequences; Activity Theory focuses on goal-directed actions".to_string(),
                "NOTE: 'Context' labels are derived (latent variable), not observed".to_string(),
                "NOTE: Navigation events are observable; meaning is inferred".to_string(),
                
                "We TEST hypotheses, we do not PROVE conclusions".to_string(),
                "All labels are proposed, not confirmed".to_string(),
            ],
            research_questions: vec![
                "RQ1: How do users organize information during prolonged knowledge work?".to_string(),
                "RQ2: Can URL sequence patterns reveal latent cognitive units?".to_string(),
                "RQ3: Does memory pressure affect navigation behavior?".to_string(),
                "RQ4: Are temporal gaps meaningful boundary markers?".to_string(),
                "RQ5: Can domain clusters predict user tasks?".to_string(),
            ],
        }
    }
}
















struct CachedSystem {
    /// The cached System instance
    sys: Mutex<System>,
    /// Track when we last did a full refresh
    last_full_refresh: Mutex<Instant>,
    /// Track when we last refreshed memory
    last_memory_refresh: Mutex<Instant>,
}

impl CachedSystem {
    fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        let now = Instant::now();
        Self {
            sys: Mutex::new(sys),
            last_full_refresh: Mutex::new(now),
            last_memory_refresh: Mutex::new(now),
        }
    }

    /// Refresh memory info only (lightweight, ~1ms)
    fn refresh_memory(&self) {
        let mut sys = self.sys.lock().unwrap();
        sys.refresh_memory_specifics(sysinfo::MemoryRefreshKind::everything());
        *self.last_memory_refresh.lock().unwrap() = Instant::now();
    }

    /// Refresh specific processes by PID (targeted, ~10ms)
    fn refresh_processes(&self, pids: &[Pid]) {
        use sysinfo::ProcessesToUpdate;
        let mut sys = self.sys.lock().unwrap();
        sys.refresh_processes_specifics(
            ProcessesToUpdate::Some(pids),
            sysinfo::ProcessRefreshKind::everything(),
        );
    }

    /// Full system refresh (expensive, ~50-200ms)
    fn refresh_all(&self) {
        let mut sys = self.sys.lock().unwrap();
        sys.refresh_all();
        *self.last_full_refresh.lock().unwrap() = Instant::now();
        *self.last_memory_refresh.lock().unwrap() = Instant::now();
    }

    /// Get memory for a specific process by PID
    fn get_process_memory(&self, pid: Pid) -> Option<(u64, u64)> {
        let sys = self.sys.lock().unwrap();
        sys.process(pid).map(|p| (p.memory(), p.virtual_memory()))
    }

    /// Get system memory totals
    fn get_system_memory(&self) -> (u64, u64) {
        let sys = self.sys.lock().unwrap();
        (sys.total_memory(), sys.available_memory())
    }

    /// Get memory for multiple PIDs
    fn get_processes_memory(&self, pids: &[u32]) -> f64 {
        let sys = self.sys.lock().unwrap();
        pids.iter()
            .filter_map(|&p| sys.process(Pid::from_u32(p)))
            .map(|p| p.memory() as f64 / (1024.0 * 1024.0))
            .sum()
    }
}

impl Default for CachedSystem {
    fn default() -> Self {
        Self::new()
    }
}



#[tauri::command]
fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("Window not found")?;
    main.minimize().map_err(|e| e.to_string())?;
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
    Ok(())
}

#[tauri::command]
fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    
    let session_mgr = app.state::<Mutex<SessionManager>>();
    if let Ok(mut session) = session_mgr.lock() {
        if let Some(ref mut s) = session.current_session {
            s.ended_at = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());
        }
    }

    
    let lifecycle = app.state::<WebViewLifecycle>();
    lifecycle.set_destroyed();

    let main = app.get_webview_window("main").ok_or("Window not found")?;
    main.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Set overlay exclusion rectangles on the browser WRY.
///
/// Coordinates are in browser WRY local physical pixels.
/// Each rect is: { x, y, width, height } relative to browser WRY top-left.
///
/// Called from React whenever an overlay opens/updates.
#[tauri::command]
fn set_browser_overlay_exclusions(
    app: tauri::AppHandle,
    // Exclusion rectangles in browser WRY local coordinates (physical pixels).
    rects: Vec<OverlayRect>,
) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    use windows::Win32::Foundation::HWND as RawHWND;

    log::info!("[OVERLAY] set exclusions count={}", rects.len());
    for r in &rects {
        log::info!("[OVERLAY] rect: x={} y={} w={} h={}", r.x, r.y, r.width, r.height);
    }

    // Store the overlay rects
    let state = app.state::<BrowserOverlayState>();
    {
        let mut stored = state.rects.lock().unwrap();
        *stored = rects.clone();
    }

    // Apply region to browser WRY
    #[cfg(target_os = "windows")]
    {
        let main_window = app.get_webview_window("main").ok_or("Main window not found")?;
        let main_hwnd_raw = main_window.hwnd().map_err(|e| format!("hwnd error: {}", e))?;
        let main_hwnd = RawHWND(main_hwnd_raw.0);

        if let Some(browser_wry) = find_browser_wry_by_geometry(main_hwnd) {
            let mut browser_rect = windows::Win32::Foundation::RECT::default();
            unsafe { let _ = GetWindowRect(browser_wry, &mut browser_rect); };

            apply_browser_exclusion_region(browser_wry, &browser_rect, &rects);
        } else {
            log::warn!("[OVERLAY] set_browser_overlay_exclusions: browser WRY not found");
        }
    }

    Ok(())
}

/// Diagnostic: measures all actual HWND geometry and performs controlled exclusion tests.
///
/// TEST_A: full = apply exclusion covering the ENTIRE browser WRY → browser should disappear
/// TEST_B: half = apply exclusion covering upper-left quarter
/// TEST_C: clear = restore full region
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HwndGeometry {
    pub hwnd: String,
    pub rect_screen: String,   // "l,t r,b"
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeometryDiagnostic {
    pub main_hwnd: String,
    pub main_rect_screen: String,
    pub main_client_rect: String,
    pub scale_factor: f64,
    pub react_wry: Option<HwndGeometry>,
    pub browser_wry: Option<HwndGeometry>,
    pub browser_client_rect: Option<String>,
    pub test_result: Option<String>,
}

#[tauri::command]
fn diagnose_browser_exclusion(app: tauri::AppHandle) -> Result<GeometryDiagnostic, String> {
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, GetClientRect, IsWindow};
    use windows::Win32::Foundation::{HWND as RawHWND, RECT};

    let main_window = app.get_webview_window("main").ok_or("Main window not found")?;
    let main_hwnd_raw = main_window.hwnd().map_err(|e| format!("hwnd error: {}", e))?;
    let main_hwnd = RawHWND(main_hwnd_raw.0);
    let scale = main_window.scale_factor().unwrap_or(1.0);

    fn rect_to_str(r: &RECT) -> String {
        format!("({},{} {},{})", r.left, r.top, r.right, r.bottom)
    }

    fn hwr(h: windows::Win32::Foundation::HWND) -> HwndGeometry {
        let mut r = RECT::default();
        unsafe { let _ = GetWindowRect(h, &mut r); };
        HwndGeometry {
            hwnd: format!("0x{:X}", h.0 as isize),
            rect_screen: rect_to_str(&r),
            width: r.right - r.left,
            height: r.bottom - r.top,
        }
    }

    // Main window
    let mut main_rect = RECT::default();
    let mut main_cr = RECT::default();
    unsafe {
        let _ = GetWindowRect(main_hwnd, &mut main_rect);
        let _ = GetClientRect(main_hwnd, &mut main_cr);
    }

    // React WRY
    let react_wry = find_react_ui_wry(main_hwnd).map(|h| hwrect(h));

    // Browser WRY
    let browser_wry_opt = find_browser_wry_by_geometry(main_hwnd);

    let mut browser_wry_rect_str = None;
    let mut browser_client_rect_str = None;
    let mut test_result = None;

    if let Some(browser_wry) = browser_wry_opt {
        let mut br = RECT::default();
        let mut bcr = RECT::default();
        unsafe {
            let _ = GetWindowRect(browser_wry, &mut br);
            let _ = GetClientRect(browser_wry, &mut bcr);
        }
        browser_wry_rect_str = Some(rect_to_str(&br));
        browser_client_rect_str = Some(rect_to_str(&bcr));

        let bw = br.right - br.left;
        let bh = br.bottom - br.top;
        let bcw = bcr.right - bcr.left;
        let bch = bcr.bottom - bcr.top;

        // TEST A: full exclusion — cover the ENTIRE browser WRY
        // If SetWindowRgn works correctly, the browser should become entirely invisible
        log::info!("[TEST_A] Full browser exclusion: {}x{}", bw, bh);

        let full_region = unsafe { windows::Win32::Graphics::Gdi::CreateRectRgn(0, 0, bw, bh) };
        if !full_region.is_invalid() {
            // Subtracting full region from full region = empty
            #[link(name = "gdi32")]
            extern "system" {
                fn CombineRgn(hrgnDest: windows::Win32::Graphics::Gdi::HRGN,
                                hrgnSrc1: windows::Win32::Graphics::Gdi::HRGN,
                                hrgnSrc2: windows::Win32::Graphics::Gdi::HRGN,
                                iMode: i32) -> i32;
            }
            const RGN_DIFF: i32 = 4;
            // full - full = empty region
            let empty_region = unsafe { windows::Win32::Graphics::Gdi::CreateRectRgn(0, 0, 0, 0) };
            let _ = unsafe { CombineRgn(empty_region, full_region, full_region, RGN_DIFF) };

            let applied = unsafe {
                windows::Win32::Graphics::Gdi::SetWindowRgn(browser_wry, Some(empty_region), true)
            };
            test_result = Some(format!(
                "TEST_A: SetWindowRgn full-empty result={} browser_wry={:X} window={} client={}",
                applied != 0, browser_wry.0 as isize, rect_to_str(&br), rect_to_str(&bcr)
            ));
            log::info!("[TEST_A] Result: {}", test_result.as_ref().unwrap());
        }

        // Also compute derived geometry
        log::info!("[COORD] === ACTUAL GEOMETRY ===");
        log::info!("[COORD] main_hwnd={:X} rect={} client={} scale={}",
            main_hwnd.0 as isize, rect_to_str(&main_rect), rect_to_str(&main_cr), scale);
        if let Some(rw) = react_wry.as_ref() {
            log::info!("[COORD] react_wry={} rect={}", rw.hwnd, rw.rect_screen);
        }
        log::info!("[COORD] browser_wry={:X} window={} client={}",
            browser_wry.0 as isize,
            browser_wry_rect_str.as_ref().unwrap_or(&"?".to_string()),
            browser_client_rect_str.as_ref().unwrap_or(&"?".to_string()));
        log::info!("[COORD] === END GEOMETRY ===");
    } else {
        test_result = Some("browser_wry not found".to_string());
        log::warn!("[TEST_A] browser_wry not found");
    }

    Ok(GeometryDiagnostic {
        main_hwnd: format!("0x{:X}", main_hwnd.0 as isize),
        main_rect_screen: rect_to_str(&main_rect),
        main_client_rect: rect_to_str(&main_cr),
        scale_factor: scale,
        react_wry,
        browser_wry: browser_wry_opt.map(|h| hwrect(h)),
        browser_client_rect: browser_client_rect_str,
        test_result,
    })
}

/// Helper: get window rect as HwndGeometry
fn hwrect(h: windows::Win32::Foundation::HWND) -> HwndGeometry {
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    let mut r = windows::Win32::Foundation::RECT::default();
    unsafe { let _ = GetWindowRect(h, &mut r); };
    HwndGeometry {
        hwnd: format!("0x{:X}", h.0 as isize),
        rect_screen: format!("({},{} {},{})", r.left, r.top, r.right, r.bottom),
        width: r.right - r.left,
        height: r.bottom - r.top,
    }
}

/// Restore full browser WRY region (after diagnostic tests).
#[tauri::command]
fn restore_browser_full_region(app: tauri::AppHandle) -> Result<String, String> {
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, GetClientRect};
    use windows::Win32::Foundation::HWND as RawHWND;

    let main_window = app.get_webview_window("main").ok_or("Main window not found")?;
    let main_hwnd_raw = main_window.hwnd().map_err(|e| format!("hwnd error: {}", e))?;
    let main_hwnd = RawHWND(main_hwnd_raw.0);

    if let Some(browser_wry) = find_browser_wry_by_geometry(main_hwnd) {
        let mut cr = windows::Win32::Foundation::RECT::default();
        unsafe { let _ = GetClientRect(browser_wry, &mut cr); };
        let cw = cr.right - cr.left;
        let ch = cr.bottom - cr.top;

        let full = unsafe { windows::Win32::Graphics::Gdi::CreateRectRgn(0, 0, cw.max(1), ch.max(1)) };
        if !full.is_invalid() {
            let applied = unsafe { windows::Win32::Graphics::Gdi::SetWindowRgn(browser_wry, Some(full), true) };
            let msg = format!(
                "restored: browser_wry={:X} client_size={}x{} result={}",
                browser_wry.0 as isize, cw, ch, applied != 0
            );
            log::info!("[REGION] {}", msg);
            return Ok(msg);
        }
    }
    Err("browser_wry not found".to_string())
}

/// Clear all overlay exclusion rectangles, restoring the full browser WRY region.
#[tauri::command]
fn clear_browser_overlay_exclusions(app: tauri::AppHandle) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    use windows::Win32::Foundation::HWND as RawHWND;

    log::info!("[OVERLAY] clear exclusions");

    // Clear stored rects
    let state = app.state::<BrowserOverlayState>();
    {
        let mut stored = state.rects.lock().unwrap();
        stored.clear();
    }

    // Restore full region
    #[cfg(target_os = "windows")]
    {
        let main_window = app.get_webview_window("main").ok_or("Main window not found")?;
        let main_hwnd_raw = main_window.hwnd().map_err(|e| format!("hwnd error: {}", e))?;
        let main_hwnd = RawHWND(main_hwnd_raw.0);

        if let Some(browser_wry) = find_browser_wry_by_geometry(main_hwnd) {
            let mut browser_rect = windows::Win32::Foundation::RECT::default();
            unsafe { let _ = GetWindowRect(browser_wry, &mut browser_rect); };

            clear_browser_exclusion_region(browser_wry, &browser_rect);
        }
    }

    Ok(())
}

/// Re-applies stored overlay exclusions to the browser WRY.
/// Called after browser bounds change (e.g., window resize).
fn reapply_overlay_exclusions(app: &tauri::AppHandle) {
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    use windows::Win32::Foundation::HWND as RawHWND;

    let state = app.state::<BrowserOverlayState>();
    let rects = state.rects.lock().unwrap().clone();

    if rects.is_empty() {
        return;
    }

    let main_window = match app.get_webview_window("main") {
        Some(w) => w,
        None => return,
    };
    let main_hwnd_raw = match main_window.hwnd() {
        Ok(h) => h,
        Err(_) => return,
    };
    let main_hwnd = RawHWND(main_hwnd_raw.0);

    if let Some(browser_wry) = find_browser_wry_by_geometry(main_hwnd) {
        let mut browser_rect = windows::Win32::Foundation::RECT::default();
        unsafe { let _ = GetWindowRect(browser_wry, &mut browser_rect); };
        log::info!("[OVERLAY] reapplying {} exclusions after resize", rects.len());
        apply_browser_exclusion_region(browser_wry, &browser_rect, &rects);
    }
}

#[tauri::command]
async fn navigate_browser(
    app: tauri::AppHandle,
    url: String,
    #[allow(non_snake_case)]
    tabId: String,
    #[allow(non_snake_case)]
    navigationType: String,
) -> Result<(), String> {
    let lifecycle = app.state::<WebViewLifecycle>();
    let browser_state = app.state::<BrowserWebview>();

    let main_window = app.get_window("main").ok_or("Main window not found")?;
    let main_hwnd = main_window.hwnd()
        .map_err(|e| format!("Failed to get main HWND: {}", e))?;
    let main_size = main_window.inner_size()
        .map_err(|e| format!("Failed to get main window size: {}", e))?;
    let scale = main_window.scale_factor()
        .map_err(|e| format!("Failed to get scale factor: {}", e))?;

    // Convert main window size to logical units to match LogicalPosition/LogicalSize.
    // inner_size() returns physical pixels, but LogicalPosition/LogicalSize are logical.
    // Mixing physical height (e.g., 600px at scale 1.5 = 400 logical) with logical position (88)
    // caused the browser to overflow: browser_height=468 physical → LogicalSize=468 logical
    // → 468 * 1.5 = 702 physical, overflowing a 600px window.
    let main_logical_height = main_size.height as f64 / scale;
    let main_logical_width = main_size.width as f64 / scale;

    // Browser child bounds: positioned below React UI at y=UI_HEIGHT, fills remaining area.
    let browser_height = main_logical_height - UI_HEIGHT;
    let browser_bounds = Rect {
        position: LogicalPosition::new(0.0, UI_HEIGHT).into(),
        size: LogicalSize::new(main_logical_width, browser_height).into(),
    };

    // Create the browser child WebView if not yet created.
    let browser_created = {
        let mut browser_wv = browser_state.webview.lock().unwrap();
        if browser_wv.is_none() {
            let parsed_url = url::Url::parse(&url)
                .map_err(|e| format!("Invalid URL: {}", e))?;
            let webview_url = WebviewUrl::External(parsed_url);
            let builder = Webview::builder("browser", webview_url);
            let browser_webview = main_window
                .add_child(
                    builder,
                    LogicalPosition::new(0.0, UI_HEIGHT),
                    LogicalSize::new(main_logical_width, browser_height),
                )
                .map_err(|e| format!("Failed to create browser child webview: {}", e))?;

            log::info!(
                "[NAVIGATE] add_child succeeded: bounds=({:.0},{:.0}) size=({:.0}x{:.0})",
                0.0, UI_HEIGHT, main_logical_width, browser_height
            );
            *browser_wv = Some(browser_webview);

            // ── FORENSIC: Browser WRY created — log lifecycle event ──────────────
            forensic::stage("BROWSER_WRY_CREATED");
            forensic::log_event(main_hwnd.0 as isize, "WEBVIEW_CREATED", &format!(
                "url={} tab={} bounds=({:.0},{:.0}) size=({:.0}x{:.0})",
                url, tabId, 0.0, UI_HEIGHT, main_logical_width, browser_height
            ));

            true
        } else {
            // Update bounds in case the main window was resized since last creation.
            if let Err(e) = browser_wv.as_ref().unwrap().set_bounds(browser_bounds) {
                log::warn!("Failed to update browser bounds: {}", e);
            }
            false
        }
    };
    // ── DIAGNOSTIC: Delayed browser WRY discovery ────────────────────────────
    // Logs browser WRY appearance at intervals after add_child.
    // Uses std::thread::spawn so it does not block the async function.
    let browser_created_diag = browser_created;
    let main_hwnd_diag = main_window.hwnd().ok().map(|h| h.0 as isize);
    if browser_created_diag {
        if let Some(raw_hwnd) = main_hwnd_diag {
            // DIAGNOSTIC LOGGING ONLY — no SetWindowPos or SetWindowRgn here.
            // Observe at t=0 (immediate), 50ms, 200ms, 500ms after add_child.
            std::thread::spawn(move || {
                for (delay_ms, label) in [(0, "immediate"), (50, "+50ms"), (200, "+200ms"), (500, "+500ms")] {
                    if delay_ms > 0 {
                        std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                    }
                    let main_h = windows::Win32::Foundation::HWND(raw_hwnd as *mut std::ffi::c_void);
                    let wry = forensic::find_browser_wry_by_geometry(main_h);
                    if let Some(wry_h) = wry {
                        let mut r = windows::Win32::Foundation::RECT::default();
                        let visible = unsafe {
                            windows::Win32::UI::WindowsAndMessaging::IsWindowVisible(wry_h).as_bool()
                        };
                        let _ = unsafe { windows::Win32::UI::WindowsAndMessaging::GetWindowRect(wry_h, &mut r) };
                        let render = forensic::find_render_surface(wry_h);
                        let render_rect = render.map(|(rh, _, _)| {
                            let mut rr = windows::Win32::Foundation::RECT::default();
                            let _ = unsafe { windows::Win32::UI::WindowsAndMessaging::GetWindowRect(rh, &mut rr) };
                            format!("0x{:X} rect=({},{} {},{})", rh.0 as isize, rr.left, rr.top, rr.right, rr.bottom)
                        }).unwrap_or_else(|| "none".to_string());
                        eprintln!(
                            "[BROWSER_DIAG] {} browser_wry=0x{:X} rect=({},{} {},{}) visible={} render={}",
                            label, wry_h.0 as isize, r.left, r.top, r.right, r.bottom, visible, render_rect
                        );
                    } else {
                        eprintln!("[BROWSER_DIAG] {} browser_wry=NOT FOUND (by geometry)", label);
                    }
                }
            });
        }
    }

    // After browser creation, ensure correct z-order: React above browser.
    // enumerate_hwnd_tree is diagnostic-only (read-only).
    if browser_created {
        enumerate_hwnd_tree(&main_window, "navigate-before-fix");
        ensure_react_ui_above_browser(&main_window);
        // ── FORENSIC: Point inspection at browser viewport ───────────────────
        // Inspect several points to determine pixel ownership.
        if let Ok(main_hwnd_val) = main_window.hwnd() {
            let main_h = windows::Win32::Foundation::HWND(main_hwnd_val.0);
            forensic::stage("POST-CREATE-POINT-INSPECT");
            forensic::dump_tree(main_h.0 as isize, "post-create");
            forensic::dump_webview_paint_hierarchy(main_h.0 as isize, "post-create");

            // Get main window rect in screen coordinates.
            use windows::Win32::Foundation::RECT;
            use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
            let mut main_rect = RECT::default();
            if unsafe { GetWindowRect(main_h, &mut main_rect) }.is_ok() {
                let mw = (main_rect.right - main_rect.left) as i32;
                let mh = (main_rect.bottom - main_rect.top) as i32;
                forensic::kv("main_rect", &format!("({},{} {},{})", main_rect.left, main_rect.top, main_rect.right, main_rect.bottom));
                forensic::kv("ui_height", &format!("{}", UI_HEIGHT));

                // Compute browser viewport center.
                let cx = main_rect.left + mw / 2;
                let cy = main_rect.top + (UI_HEIGHT as i32) + ((mh as f64 - UI_HEIGHT) / 2.0) as i32;
                forensic::kv("browser_center", &format!("({},{})", cx, cy));
                forensic::inspect_point(cx, cy, "BROWSER-CENTER");

                // Browser top-left.
                forensic::inspect_point(main_rect.left + 10, main_rect.top + (UI_HEIGHT as i32) + 10, "BROWSER-TOPLEFT");

                // Browser bottom-right.
                forensic::inspect_point(main_rect.right - 10, main_rect.bottom - 10, "BROWSER-BOTTOMRIGHT");

                // React UI center (control point — should return React WRY).
                forensic::inspect_point(main_rect.left + mw / 2, main_rect.top + 30, "REACT-CENTER");
            }
        }
    }

    lifecycle.mark_active();

    // Navigate to the requested URL.
    let target_url = url::Url::parse(&url)
        .map_err(|e| format!("Invalid URL: {}", e))?;
    if let Some(ref webview) = *browser_state.webview.lock().unwrap() {
        forensic::log_event(main_hwnd.0 as isize, "NAVIGATE_REQUESTED", &format!(
            "url={} tab={}", target_url, tabId
        ));
        let url_for_log = target_url.clone();
        webview.navigate(target_url)
            .map_err(|e: tauri::Error| {
                let msg = format!("{}", e);
                forensic::log_event(main_hwnd.0 as isize, "NAVIGATE_ERROR", &msg);
                format!("Navigation failed: {}", e)
            })?;
        forensic::log_event(main_hwnd.0 as isize, "NAVIGATE_SUBMITTED", &format!(
            "url={} tab={}", url_for_log, tabId
        ));
    }

    // Record navigation in session state (preserved from original).
    lifecycle.record_navigation_sync(&url, &tabId);

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Time error: {}", e))?
        .as_millis() as u64;

    let domain = SequenceTracker::extract_domain(&url);

    let mem_tracker = app.state::<Mutex<MemoryTracker>>();
    let (rss, pressure) = {
        let m = mem_tracker.lock().unwrap();
        let last = m.snapshots.last();
        (last.map(|s| s.combined_rss_mb), last.map(|s| s.pressure_level.clone()))
    };

    let event = NavigationEvent {
        timestamp: now_ms,
        url: url.clone(),
        domain: domain.clone(),
        action: navigationType.clone(),
        tab_id: tabId.clone(),
        duration_ms: None,
        memory_rss_mb: rss,
        memory_pressure: pressure,
    };

    let seq_tracker = app.state::<Mutex<SequenceTracker>>();
    {
        let mut st = seq_tracker.lock().unwrap();
        st.add_event(event);
    }

    let session_mgr = app.state::<Mutex<SessionManager>>();
    if let Ok(mut session) = session_mgr.lock() {
        if let Some(ref mut s) = session.current_session {
            s.total_navigations += 1;
        }
    }

    let tab_manager = app.state::<Mutex<TabManager>>();
    {
        let tm = tab_manager.lock().unwrap();
        let mut tabs = tm.tabs.lock().unwrap();
        let mut history = tm.history.lock().unwrap();

        if let Some(tab) = tabs.get(&tabId) {
            let idx = tab.history_index;
            let new_len = (idx + 1).min(history.len());
            history.truncate(new_len);
        }

        if history.len() >= MAX_HISTORY_ENTRIES {
            let remove_count = (history.len() - MAX_HISTORY_ENTRIES) + 1;
            history.dedup();
            history.drain(0..remove_count);
            for tab in tabs.values_mut() {
                if tab.history_index >= remove_count {
                    tab.history_index -= remove_count;
                } else {
                    tab.history_index = 0;
                }
            }
        }

        history.push(url.clone());
    }

    Ok(())
}

#[tauri::command]
async fn reload_browser(app: tauri::AppHandle) -> Result<(), String> {
    let browser_state = app.state::<BrowserWebview>();
    let webview = browser_state.webview.lock().unwrap();
    let wv = webview.as_ref().ok_or("Browser not created")?;
    wv.reload().map_err(|e| e.to_string())
}

#[tauri::command]
async fn back_browser(app: tauri::AppHandle) -> Result<(), String> {
    let browser_state = app.state::<BrowserWebview>();
    let webview = browser_state.webview.lock().unwrap();
    let wv = webview.as_ref().ok_or("Browser not created")?;
    wv.eval("window.history.back()").map_err(|e| e.to_string())
}

#[tauri::command]
async fn forward_browser(app: tauri::AppHandle) -> Result<(), String> {
    let browser_state = app.state::<BrowserWebview>();
    let webview = browser_state.webview.lock().unwrap();
    let wv = webview.as_ref().ok_or("Browser not created")?;
    wv.eval("window.history.forward()").map_err(|e| e.to_string())
}






#[tauri::command]
fn get_webview_state(app: tauri::AppHandle) -> Result<WebViewStateInfo, String> {
    let lifecycle = app.state::<WebViewLifecycle>();
    let state = lifecycle.get_state();
    let last_active = *lifecycle.last_activity.lock().unwrap();
    let idle_secs = last_active.elapsed().as_secs();
    let last_url = lifecycle.last_url.lock().unwrap().clone();
    let last_tab = lifecycle.last_tab_id.lock().unwrap().clone();

    let can_destroy = lifecycle.should_destroy();
    let idle_threshold = *lifecycle.idle_threshold_secs.lock().unwrap();

    Ok(WebViewStateInfo {
        state: format!("{:?}", state),
        idle_seconds: idle_secs,
        idle_threshold_seconds: idle_threshold,
        can_destroy,
        last_url,
        last_tab_id: last_tab,
    })
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WebViewStateInfo {
    pub state: String,
    pub idle_seconds: u64,
    pub idle_threshold_seconds: u64,
    pub can_destroy: bool,
    pub last_url: Option<String>,
    pub last_tab_id: Option<String>,
}

#[tauri::command]
async fn ensure_webview_active(app: tauri::AppHandle) -> Result<bool, String> {
    let lifecycle = app.state::<WebViewLifecycle>();
    let current_state = lifecycle.get_state();

    if current_state == WebViewState::Active || current_state == WebViewState::Idle {
        lifecycle.mark_active();
        return Ok(false);
    }

    lifecycle.set_restoring();

    let url_to_load = {
        let last_url = lifecycle.last_url.lock().unwrap();
        let last_tab = lifecycle.last_tab_id.lock().unwrap();

        let tab_manager = app.state::<Mutex<TabManager>>();
        let tm = tab_manager.lock().unwrap();
        let tabs = tm.tabs.lock().unwrap();
        let history = tm.history.lock().unwrap();

        let default_tab = "default".to_string();
        let target_tab = last_tab.as_ref().unwrap_or(&default_tab);
        let tab = tabs.get(target_tab);

        if let Some(tab) = tab {
            history.get(tab.history_index).cloned()
        } else {
            last_url.clone()
        }.unwrap_or_else(|| HOMEPAGE.to_string())
    };

    let main_window = app.get_window("main").ok_or("Main window not found")?;
    let main_size = main_window.inner_size()
        .map_err(|e| format!("Failed to get main window size: {}", e))?;
    let scale = main_window.scale_factor()
        .map_err(|e| format!("Failed to get scale factor: {}", e))?;

    // Convert to logical to match LogicalPosition/LogicalSize (see navigate_browser for full explanation).
    let main_logical_height = main_size.height as f64 / scale;
    let main_logical_width = main_size.width as f64 / scale;
    let browser_height = main_logical_height - UI_HEIGHT;

    let browser_state = app.state::<BrowserWebview>();
    let browser_created = {
        let mut browser_wv = browser_state.webview.lock().unwrap();
        if browser_wv.is_none() {
            let parsed_url = url::Url::parse(&url_to_load)
                .map_err(|e| format!("Invalid URL: {}", e))?;
            let builder = Webview::builder("browser", WebviewUrl::External(parsed_url));
            let browser_webview = main_window
                .add_child(
                    builder,
                    LogicalPosition::new(0.0, UI_HEIGHT),
                    LogicalSize::new(main_logical_width, browser_height),
                )
                .map_err(|e| format!("Failed to create browser webview: {}", e))?;
            *browser_wv = Some(browser_webview);
            true
        } else {
            false
        }
    };

    // Ensure correct z-order after browser creation: React above browser.
    if browser_created {
        ensure_react_ui_above_browser(&main_window);
    }

    lifecycle.mark_active();
    log::info!("Browser child WebView restored: {}", url_to_load);
    Ok(true)
}

#[tauri::command]
async fn destroy_webview(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let lifecycle = app.state::<WebViewLifecycle>();
    let current_state = lifecycle.get_state();

    if current_state == WebViewState::Uninitialized || current_state == WebViewState::Destroyed {
        return Ok(None);
    }

    
    let last_url = {
        let tab_manager = app.state::<Mutex<TabManager>>();
        let tm = tab_manager.lock().unwrap();
        let tabs = tm.tabs.lock().unwrap();
        let history = tm.history.lock().unwrap();

        let last_tab = lifecycle.last_tab_id.lock().unwrap();
        let default_tab = "default".to_string();
        let target_tab = last_tab.as_ref().unwrap_or(&default_tab);
        let tab = tabs.get(target_tab);

        tab.map(|t| history.get(t.history_index).cloned()).flatten()
    };


    let browser_state = app.state::<BrowserWebview>();
    if let Some(wv) = browser_state.webview.lock().unwrap().take() {
        let _ = wv.close();
    }

    lifecycle.set_destroyed();
    log::info!("Browser child WebView destroyed");

    Ok(last_url)
}

#[tauri::command]
fn set_idle_threshold(app: tauri::AppHandle, seconds: u64) -> Result<(), String> {
    let lifecycle = app.state::<WebViewLifecycle>();
    lifecycle.set_idle_threshold(seconds);
    log::info!("Idle threshold set to {} seconds", seconds);
    Ok(())
}

#[tauri::command]
fn record_activity(app: tauri::AppHandle) -> Result<(), String> {
    let lifecycle = app.state::<WebViewLifecycle>();
    lifecycle.mark_active();
    Ok(())
}

#[tauri::command]
fn record_navigation(app: tauri::AppHandle, url: String, #[allow(non_snake_case)] tabId: String) -> Result<(), String> {
    let lifecycle = app.state::<WebViewLifecycle>();
    lifecycle.mark_active();
    *lifecycle.last_url.lock().unwrap() = Some(url);
    *lifecycle.last_tab_id.lock().unwrap() = Some(tabId);
    Ok(())
}








#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct TabLifecycleInfo {
    pub tab_id: String,
    pub lifecycle_state: String,
    pub estimated_memory_mb: f64,
    pub can_suspend: bool,
    pub can_evict: bool,
}

#[tauri::command]
fn suspend_tab(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<TabLifecycleInfo, String> {
    
    
    let lifecycle = app.state::<WebViewLifecycle>();
    let current_state = lifecycle.get_state();

    
    if current_state != WebViewState::Active && current_state != WebViewState::Idle {
        return Err("WebView must be Active or Idle to suspend".to_string());
    }

    
    lifecycle.mark_idle();

    log::info!("Tab {} suspended (reduced resources, state preserved)", tabId);

    Ok(TabLifecycleInfo {
        tab_id: tabId,
        lifecycle_state: "suspended".to_string(),
        estimated_memory_mb: 10.0, 
        can_suspend: false,
        can_evict: true,
    })
}

#[tauri::command]
fn evict_tab(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<TabLifecycleInfo, String> {
    
    
    let lifecycle = app.state::<WebViewLifecycle>();
    let current_state = lifecycle.get_state();
    let previous_state_str = match current_state {
        WebViewState::Active => "active",
        WebViewState::Idle => "idle",
        WebViewState::Uninitialized => "uninitialized",
        WebViewState::Destroyed => "destroyed",
        WebViewState::Creating => "creating",
        WebViewState::Restoring => "restoring",
    };

    
    if current_state == WebViewState::Uninitialized || current_state == WebViewState::Destroyed {
        
        let event = LifecycleEvent::new(
            format!("evt-{}-{}", tabId, next_event_sequence()),
            next_event_sequence(),
            LifecycleEventType::EvictCompleted,
            tabId.clone(),
            previous_state_str.to_string(),
            "evicted".to_string(),
            "unknown".to_string(),
            "Already evicted".to_string(),
            ProcessStateSnapshot {
                timestamp_ms: current_timestamp_ms(),
                group_memory_mb: 0.0,
                process_count: 0,
                processes: vec![],
            },
            ProcessStateSnapshot {
                timestamp_ms: current_timestamp_ms(),
                group_memory_mb: 0.0,
                process_count: 0,
                processes: vec![],
            },
            true, 
        );
        emit_lifecycle_event(&app, event);

        return Ok(TabLifecycleInfo {
            tab_id: tabId,
            lifecycle_state: "evicted".to_string(),
            estimated_memory_mb: 0.0,
            can_suspend: false,
            can_evict: false,
        });
    }

    
    let mut sys = System::new();
    sys.refresh_all();
    let process_before = capture_process_state(&sys);

    
    let total_mem = sys.total_memory() as f64 / (1024.0 * 1024.0);
    let avail_mem = sys.available_memory() as f64 / (1024.0 * 1024.0);
    let pressure_ratio = avail_mem / total_mem;
    let pressure_level = if pressure_ratio > 0.5 {
        "low"
    } else if pressure_ratio > 0.2 {
        "medium"
    } else if pressure_ratio > 0.1 {
        "high"
    } else {
        "critical"
    };

    
    let evict_requested_event = LifecycleEvent::new(
        format!("evt-req-{}-{}", tabId, next_event_sequence()),
        next_event_sequence(),
        LifecycleEventType::EvictRequested,
        tabId.clone(),
        previous_state_str.to_string(),
        "evicted".to_string(),
        pressure_level.to_string(),
        format!("Manual eviction requested for {}", tabId),
        process_before.clone(),
        process_before.clone(), 
        true,
    );
    emit_lifecycle_event(&app, evict_requested_event);

    
    let browser_state = app.state::<BrowserWebview>();
    let action_succeeded = if let Some(wv) = browser_state.webview.lock().unwrap().take() {
        wv.close().is_ok()
    } else {
        true
    };

    lifecycle.set_destroyed();
    log::info!("Tab {} evicted (WebView destroyed, resources released)", tabId);

    
    sys.refresh_all();
    let process_after = capture_process_state(&sys);

    
    let evict_completed_event = LifecycleEvent::new(
        format!("evt-cmp-{}-{}", tabId, next_event_sequence()),
        next_event_sequence(),
        if action_succeeded {
            LifecycleEventType::EvictCompleted
        } else {
            LifecycleEventType::EvictFailed
        },
        tabId.clone(),
        previous_state_str.to_string(),
        "evicted".to_string(),
        pressure_level.to_string(),
        if action_succeeded {
            "Eviction successful".to_string()
        } else {
            "Eviction failed".to_string()
        },
        process_before,
        process_after,
        action_succeeded,
    );
    emit_lifecycle_event(&app, evict_completed_event);

    Ok(TabLifecycleInfo {
        tab_id: tabId,
        lifecycle_state: "evicted".to_string(),
        estimated_memory_mb: 0.0,
        can_suspend: false,
        can_evict: false,
    })
}

#[tauri::command]
fn restore_tab(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<TabLifecycleInfo, String> {
    
    
    let lifecycle = app.state::<WebViewLifecycle>();
    let current_state = lifecycle.get_state();
    let previous_state_str = match current_state {
        WebViewState::Active => "active",
        WebViewState::Idle => "idle",
        WebViewState::Uninitialized => "uninitialized",
        WebViewState::Destroyed => "destroyed",
        WebViewState::Restoring => "restoring",
        WebViewState::Creating => "creating",
    };

    
    if current_state == WebViewState::Active || current_state == WebViewState::Idle {
        let process_empty = ProcessStateSnapshot {
            timestamp_ms: current_timestamp_ms(),
            group_memory_mb: 0.0,
            process_count: 0,
            processes: vec![],
        };

        let event = LifecycleEvent::new(
            format!("rst-cmp-{}-{}", tabId, next_event_sequence()),
            next_event_sequence(),
            LifecycleEventType::RestoreCompleted,
            tabId.clone(),
            previous_state_str.to_string(),
            "active".to_string(),
            "unknown".to_string(),
            "Already active".to_string(),
            process_empty.clone(),
            process_empty,
            true,
        );
        emit_lifecycle_event(&app, event);

        return Ok(TabLifecycleInfo {
            tab_id: tabId,
            lifecycle_state: "visible".to_string(),
            estimated_memory_mb: 50.0,
            can_suspend: true,
            can_evict: true,
        });
    }

    
    let mut sys = System::new();
    sys.refresh_all();
    let process_before = capture_process_state(&sys);

    
    let total_mem = sys.total_memory() as f64 / (1024.0 * 1024.0);
    let avail_mem = sys.available_memory() as f64 / (1024.0 * 1024.0);
    let pressure_ratio = avail_mem / total_mem;
    let pressure_level = if pressure_ratio > 0.5 {
        "low"
    } else if pressure_ratio > 0.2 {
        "medium"
    } else if pressure_ratio > 0.1 {
        "high"
    } else {
        "critical"
    };

    
    let tab_manager = app.state::<Mutex<TabManager>>();
    let url_to_load = {
        let tm = tab_manager.lock().unwrap();
        let tabs = tm.tabs.lock().unwrap();
        let history = tm.history.lock().unwrap();

        tabs.get(&tabId)
            .and_then(|t| history.get(t.history_index).cloned())
            .unwrap_or_else(|| HOMEPAGE.to_string())
    };

    
    let restore_requested_event = LifecycleEvent::new(
        format!("rst-req-{}-{}", tabId, next_event_sequence()),
        next_event_sequence(),
        LifecycleEventType::RestoreRequested,
        tabId.clone(),
        previous_state_str.to_string(),
        "restoring".to_string(),
        pressure_level.to_string(),
        format!("Restore requested for {} to {}", tabId, url_to_load),
        process_before.clone(),
        process_before.clone(),
        true,
    );
    emit_lifecycle_event(&app, restore_requested_event);

    
    lifecycle.set_restoring();


    let process_before_for_error = process_before.clone();


    let main_window = match app.get_window("main") {
        Some(w) => w,
        None => {
            let event = LifecycleEvent::new(
                format!("rst-fail-{}-{}", tabId, next_event_sequence()),
                next_event_sequence(),
                LifecycleEventType::RestoreFailed,
                tabId.clone(),
                previous_state_str.to_string(),
                previous_state_str.to_string(),
                pressure_level.to_string(),
                "Main window not found".to_string(),
                process_before_for_error.clone(),
                process_before_for_error,
                false,
            );
            emit_lifecycle_event(&app, event);
            return Err("Main window not found".to_string());
        }
    };

    let main_size = match main_window.inner_size() {
        Ok(s) => s,
        Err(e) => {
            let event = LifecycleEvent::new(
                format!("rst-fail-{}-{}", tabId, next_event_sequence()),
                next_event_sequence(),
                LifecycleEventType::RestoreFailed,
                tabId.clone(),
                previous_state_str.to_string(),
                previous_state_str.to_string(),
                pressure_level.to_string(),
                format!("Failed to get main window size: {}", e),
                process_before_for_error.clone(),
                process_before_for_error,
                false,
            );
            emit_lifecycle_event(&app, event);
            return Err(format!("Failed to get main window size: {}", e));
        }
    };

    let scale = match main_window.scale_factor() {
        Ok(s) => s,
        Err(e) => {
            let event = LifecycleEvent::new(
                format!("rst-fail-{}-{}", tabId, next_event_sequence()),
                next_event_sequence(),
                LifecycleEventType::RestoreFailed,
                tabId.clone(),
                previous_state_str.to_string(),
                previous_state_str.to_string(),
                pressure_level.to_string(),
                format!("Failed to get scale factor: {}", e),
                process_before_for_error.clone(),
                process_before_for_error,
                false,
            );
            emit_lifecycle_event(&app, event);
            return Err(format!("Failed to get scale factor: {}", e));
        }
    };

    let main_logical_height = main_size.height as f64 / scale;
    let main_logical_width = main_size.width as f64 / scale;
    let browser_height = main_logical_height - UI_HEIGHT;

    let browser_state = app.state::<BrowserWebview>();
    let browser_created = {
        let mut browser_wv = browser_state.webview.lock().unwrap();
        if browser_wv.is_none() {
            let parsed_url = url::Url::parse(&url_to_load)
                .map_err(|e| format!("Invalid URL: {}", e))?;
            let builder = Webview::builder("browser", WebviewUrl::External(parsed_url));
            let browser_webview = main_window
                .add_child(
                    builder,
                    LogicalPosition::new(0.0, UI_HEIGHT),
                    LogicalSize::new(main_logical_width, browser_height),
                )
                .map_err(|e| format!("Failed to create browser webview: {}", e))?;
            *browser_wv = Some(browser_webview);
            true
        } else {
            false
        }
    };

    // Ensure correct z-order after browser creation: React above browser.
    if browser_created {
        ensure_react_ui_above_browser(&main_window);
    }

    lifecycle.mark_active();
    *lifecycle.last_url.lock().unwrap() = Some(url_to_load.clone());
    *lifecycle.last_tab_id.lock().unwrap() = Some(tabId.clone());

    log::info!("Tab {} restored from evicted state", tabId);

    Ok(TabLifecycleInfo {
        tab_id: tabId,
        lifecycle_state: "restoring".to_string(),
        estimated_memory_mb: 50.0,
        can_suspend: true,
        can_evict: true,
    })
}

#[tauri::command]
fn get_tab_lifecycle(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<TabLifecycleInfo, String> {
    let lifecycle = app.state::<WebViewLifecycle>();
    let current_state = lifecycle.get_state();

    let state_str = match current_state {
        WebViewState::Uninitialized => "uninitialized",
        WebViewState::Creating => "creating",
        WebViewState::Active => "visible",
        WebViewState::Idle => "hidden",
        WebViewState::Destroyed => "evicted",
        WebViewState::Restoring => "restoring",
    };

    Ok(TabLifecycleInfo {
        tab_id: tabId,
        lifecycle_state: state_str.to_string(),
        estimated_memory_mb: if current_state == WebViewState::Destroyed { 0.0 } else { 50.0 },
        can_suspend: current_state == WebViewState::Active || current_state == WebViewState::Idle,
        can_evict: current_state != WebViewState::Destroyed && current_state != WebViewState::Uninitialized,
    })
}



#[tauri::command]
fn create_tab(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<TabSnapshot, String> {
    log::info!("[NEW_TAB_10] create_tab command entered");
    log::info!("[NEW_TAB_10] tabId: {}", tabId);
    log::info!("[NEW_TAB_10] timestamp_ms: {}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis());

    let tab_manager = app.state::<Mutex<TabManager>>();
    let now = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Time error: {}", e))?
        .as_secs();

    let tm = tab_manager.lock().map_err(|e| format!("TabManager lock failed: {}", e))?;
    let mut tabs = tm.tabs.lock().map_err(|e| format!("Tabs lock failed: {}", e))?;
    let history = tm.history.lock().map_err(|e| format!("History lock failed: {}", e))?;

    log::info!("[NEW_TAB_11] current tabs count: {}", tabs.len());
    log::info!("[NEW_TAB_11] current history count: {}", history.len());

    tabs.remove(&tabId);

    let history_index = history.len().saturating_sub(1);

    let tab = TabData {
        id: tabId.clone(),
        history_index,
        created_at: now,
        last_accessed: now,
    };

    tabs.insert(tabId.clone(), tab.clone());

    Ok(TabSnapshot {
        tab_id: tabId.clone(),
        current_url: history.last().cloned().unwrap_or_default(),
        history_count: history.len(),
        created_at: now,
        last_accessed: now,
    })
    .map(|snapshot| {
        log::info!("[NEW_TAB_18] create_tab completed successfully");
        log::info!("[NEW_TAB_18] tabId: {}, history_count: {}", snapshot.tab_id, snapshot.history_count);
        log::info!("[NEW_TAB_18] timestamp_ms: {}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis());
        snapshot
    })
}

#[tauri::command]
fn switch_tab(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<String, String> {
    let tab_manager = app.state::<Mutex<TabManager>>();
    let tm = tab_manager.lock().unwrap();
    let mut tabs = tm.tabs.lock().unwrap();
    let history = tm.history.lock().unwrap();

    let tab = tabs.get(&tabId).ok_or("Tab not found")?;
    let url = history.get(tab.history_index).cloned().ok_or("History index out of bounds")?;

    Ok(url)
}

#[tauri::command]
fn close_tab(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<(), String> {
    let tab_manager = app.state::<Mutex<TabManager>>();
    let tm = tab_manager.lock().unwrap();
    let mut tabs = tm.tabs.lock().unwrap();
    tabs.remove(&tabId);
    Ok(())
}

#[tauri::command]
fn get_tab_snapshots(app: tauri::AppHandle) -> Result<Vec<TabSnapshot>, String> {
    let tab_manager = app.state::<Mutex<TabManager>>();
    let tm = tab_manager.lock().unwrap();
    let mut tabs = tm.tabs.lock().unwrap();
    let history = tm.history.lock().unwrap();

    let snapshots: Vec<TabSnapshot> = tabs.values()
        .map(|tab| TabSnapshot {
            tab_id: tab.id.clone(),
            current_url: history.get(tab.history_index).cloned().unwrap_or_default(),
            history_count: tab.history_index + 1,
            created_at: tab.created_at,
            last_accessed: tab.last_accessed,
        })
        .collect();

    Ok(snapshots)
}






















/// Authoritative WebView2 process snapshot
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WebView2ProcessSnapshot {
    pub timestamp_ms: u64,
    /// Whether we successfully found and queried the WebView2 environment
    pub environment_found: bool,
    /// Environment identity (for cross-run validation)
    pub browser_version: Option<String>,
    pub user_data_folder: Option<String>,
    pub process_count: u32,
    pub browser_count: u32,
    pub renderer_count: u32,
    pub gpu_count: u32,
    pub utility_count: u32,
    pub helper_count: u32,
    pub ppapi_plugin_count: u32,
    pub ppapi_broker_count: u32,
    pub total_memory_mb: f64,
    /// The authoritative process list from WebView2 API
    pub processes: Vec<WebView2ProcessInfo>,
}

/// Single process info — KIND comes from WebView2 API, not name heuristics
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WebView2ProcessInfo {
    pub pid: u32,
    /// Authoritative kind from COREWEBVIEW2_PROCESS_KIND
    pub kind: String,
    /// Memory from sysinfo (supplements, not replaces WebView2 identity)
    pub memory_mb: f64,
    /// Proof: this was classified by WebView2 API, not by name pattern
    pub kind_from_webview2_api: bool,
}

impl WebView2ProcessSnapshot {
    fn kind_to_string(kind: webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PROCESS_KIND) -> &'static str {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        if kind == COREWEBVIEW2_PROCESS_KIND_BROWSER {
            "Browser"
        } else if kind == COREWEBVIEW2_PROCESS_KIND_RENDERER {
            "Renderer"
        } else if kind == COREWEBVIEW2_PROCESS_KIND_UTILITY {
            "Utility"
        } else if kind == COREWEBVIEW2_PROCESS_KIND_SANDBOX_HELPER {
            "SandboxHelper"
        } else if kind == COREWEBVIEW2_PROCESS_KIND_GPU {
            "GPU"
        } else if kind == COREWEBVIEW2_PROCESS_KIND_PPAPI_PLUGIN {
            "PPAPIPlugin"
        } else if kind == COREWEBVIEW2_PROCESS_KIND_PPAPI_BROKER {
            "PPAPIBroker"
        } else {
            "Unknown"
        }
    }
}

/// Internal: collect WebView2 memory sample via production API chain.
/// Called by both `get_webview2_process_snapshot` (command) and `run_benchmark_workload` (benchmark).
/// All COM work happens inside the `with_webview` closure.
#[cfg(windows)]
fn sample_webview2_memory(
    browser_webview: &tauri::Webview,
    app: &tauri::AppHandle,
) -> Result<(f64, u32, u32, Vec<u32>), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows::core::Interface;
    use std::sync::{Arc, Mutex};

    let result_arc: Arc<Mutex<Option<(Vec<u32>, u32, u32)>>> = Arc::new(Mutex::new(None));

    let r = browser_webview.with_webview({
        let result_arc = result_arc.clone();
        move |webview| {
            let controller: ICoreWebView2Controller = webview.controller();
            let webview2: ICoreWebView2 = match unsafe { controller.CoreWebView2() } {
                Ok(w) => w,
                Err(_) => return,
            };
            let webview2_10: ICoreWebView2_10 = match webview2.cast() {
                Ok(w) => w,
                Err(_) => return,
            };
            let env: ICoreWebView2Environment = match unsafe { webview2_10.Environment() } {
                Ok(e) => e,
                Err(_) => return,
            };
            let env8: ICoreWebView2Environment8 = match env.cast() {
                Ok(e) => e,
                Err(_) => return,
            };

            let collection: ICoreWebView2ProcessInfoCollection = match unsafe { env8.GetProcessInfos() } {
                Ok(c) => c,
                Err(_) => return,
            };
            let count: u32 = unsafe {
                let mut n: u32 = 0;
                if collection.Count(&mut n).is_err() { return; }
                n
            };

            let mut pids: Vec<u32> = Vec::with_capacity(count as usize);
            let mut browser_count = 0u32;
            let mut renderer_count = 0u32;

            for i in 0..count {
                let info: ICoreWebView2ProcessInfo = match unsafe { collection.GetValueAtIndex(i) } {
                    Ok(info) => info,
                    Err(_) => continue,
                };
                let pid: i32 = unsafe {
                    let mut p: i32 = 0;
                    if info.ProcessId(&mut p).is_err() { continue; }
                    p
                };
                let kind_val: COREWEBVIEW2_PROCESS_KIND = unsafe {
                    let mut k: COREWEBVIEW2_PROCESS_KIND = COREWEBVIEW2_PROCESS_KIND::default();
                    if info.Kind(&mut k).is_err() { continue; }
                    k
                };
                match kind_val {
                    COREWEBVIEW2_PROCESS_KIND_BROWSER => browser_count += 1,
                    COREWEBVIEW2_PROCESS_KIND_RENDERER => renderer_count += 1,
                    _ => {}
                }
                pids.push(pid as u32);
            }

            *result_arc.lock().unwrap() = Some((pids, browser_count, renderer_count));
        }
    });

    if r.is_err() {
        return Err("Browser window not accessible".to_string());
    }

    let (webview2_pids, browser_count, renderer_count) = result_arc
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| "WebView2 not initialized".to_string())?;

    
    
    let cached = app.state::<CachedSystem>();

    
    let sysinfo_pids: Vec<Pid> = webview2_pids.iter().map(|&p| Pid::from_u32(p)).collect();

    
    cached.refresh_processes(&sysinfo_pids);

    
    let total_mb = cached.get_processes_memory(&webview2_pids);

    Ok((total_mb, browser_count, renderer_count, webview2_pids))
}

/// Get authoritative WebView2 process snapshot via production API chain.
///
/// Chain:
///   WebviewWindow → with_webview → PlatformWebview → controller
///   controller.CoreWebView2() → webview
///   webview.Environment() → environment
///   environment.GetProcessInfos() → authoritative PID + ProcessKind
///
/// Memory: sysinfo looks up RSS for each PID returned by WebView2 API.
///
/// Returns kind_from_webview2_api=true for every process — proof that
/// WebView2 API, not name heuristics, determined the classification.
#[cfg(windows)]
#[tauri::command]
fn get_webview2_process_snapshot(app: tauri::AppHandle) -> Result<WebView2ProcessSnapshot, String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows::core::Interface;
    use std::sync::{Arc, Mutex};

    let timestamp_ms = current_timestamp_ms();

    let browser_state = app.state::<BrowserWebview>();
    let browser_webview = browser_state.webview.lock().unwrap();
    let bw = browser_webview.as_ref().ok_or("Browser not created")?;

    let (total_mb, browser_count, renderer_count, webview2_pids) =
        sample_webview2_memory(bw, &app)?;


    let env_result_arc: Arc<Mutex<Option<(Option<String>, Option<String>)>>> =
        Arc::new(Mutex::new(None));

    let _r = bw.with_webview({
        let env_result_arc = env_result_arc.clone();
        move |webview| {
            let controller: ICoreWebView2Controller = webview.controller();
            let webview2: ICoreWebView2 = match unsafe { controller.CoreWebView2() } {
                Ok(w) => w,
                Err(_) => return,
            };
            let webview2_10: ICoreWebView2_10 = match webview2.cast() {
                Ok(w) => w,
                Err(_) => return,
            };
            let env: ICoreWebView2Environment = match unsafe { webview2_10.Environment() } {
                Ok(e) => e,
                Err(_) => return,
            };

            let mut version_pwstr = windows::core::PWSTR::null();
            let browser_version = match unsafe { env.BrowserVersionString(&mut version_pwstr) } {
                Ok(()) => {
                    let s = take_pwstr(version_pwstr);
                    if s.is_empty() { None } else { Some(s) }
                }
                Err(_) => None,
            };

            let env8: ICoreWebView2Environment8 = match env.cast() {
                Ok(e) => e,
                Err(_) => return,
            };
            let mut udf_pwstr = windows::core::PWSTR::null();
            let user_data_folder = match unsafe { env8.UserDataFolder(&mut udf_pwstr) } {
                Ok(()) => {
                    let s = take_pwstr(udf_pwstr);
                    if s.is_empty() { None } else { Some(s) }
                }
                Err(_) => None,
            };

            *env_result_arc.lock().unwrap() = Some((browser_version, user_data_folder));
        }
    });

    let (browser_version, user_data_folder) = env_result_arc.lock().unwrap()
        .take()
        .ok_or_else(|| "WebView2 not initialized".to_string())?;

    
    let kinds_result_arc: Arc<Mutex<Option<Vec<String>>>> = Arc::new(Mutex::new(None));

    let _r = bw.with_webview({
        let kinds_result_arc = kinds_result_arc.clone();
        move |webview| {
            let controller: ICoreWebView2Controller = webview.controller();
            let webview2: ICoreWebView2 = match unsafe { controller.CoreWebView2() } {
                Ok(w) => w,
                Err(_) => return,
            };
            let webview2_10: ICoreWebView2_10 = match webview2.cast() {
                Ok(w) => w,
                Err(_) => return,
            };
            let env: ICoreWebView2Environment = match unsafe { webview2_10.Environment() } {
                Ok(e) => e,
                Err(_) => return,
            };
            let env8: ICoreWebView2Environment8 = match env.cast() {
                Ok(e) => e,
                Err(_) => return,
            };

            let collection: ICoreWebView2ProcessInfoCollection = match unsafe { env8.GetProcessInfos() } {
                Ok(c) => c,
                Err(_) => return,
            };
            let count: u32 = unsafe {
                let mut n: u32 = 0;
                if collection.Count(&mut n).is_err() { return; }
                n
            };

            let mut kinds = Vec::with_capacity(count as usize);
            for i in 0..count {
                let info: ICoreWebView2ProcessInfo = match unsafe { collection.GetValueAtIndex(i) } {
                    Ok(info) => info,
                    Err(_) => continue,
                };
                let kind_val: COREWEBVIEW2_PROCESS_KIND = unsafe {
                    let mut k: COREWEBVIEW2_PROCESS_KIND = COREWEBVIEW2_PROCESS_KIND::default();
                    if info.Kind(&mut k).is_err() { continue; }
                    k
                };
                kinds.push(WebView2ProcessSnapshot::kind_to_string(kind_val).to_string());
            }

            *kinds_result_arc.lock().unwrap() = Some(kinds);
        }
    });

    let webview2_kinds: Vec<String> = kinds_result_arc.lock().unwrap().take().unwrap_or_default();

    let mut processes = Vec::with_capacity(webview2_pids.len());
    let mut gpu_count = 0u32;
    let mut utility_count = 0u32;
    let mut helper_count = 0u32;
    let mut ppapi_plugin_count = 0u32;
    let mut ppapi_broker_count = 0u32;

    
    let cached = app.state::<CachedSystem>();
    let sysinfo_pids: Vec<Pid> = webview2_pids.iter().map(|&p| Pid::from_u32(p)).collect();
    cached.refresh_processes(&sysinfo_pids);

    for (i, &pid) in webview2_pids.iter().enumerate() {
        let kind = webview2_kinds.get(i).cloned().unwrap_or_else(|| "Unknown".to_string());
        let memory_mb = cached.get_processes_memory(&[pid]);

        match kind.as_str() {
            "GPU" => gpu_count += 1,
            "Utility" => utility_count += 1,
            "SandboxHelper" => helper_count += 1,
            "PPAPIPlugin" => ppapi_plugin_count += 1,
            "PPAPIBroker" => ppapi_broker_count += 1,
            _ => {}
        }

        processes.push(WebView2ProcessInfo {
            pid,
            kind,
            memory_mb,
            kind_from_webview2_api: true,
        });
    }
    processes.sort_by_key(|p| p.pid);

    let snapshot = WebView2ProcessSnapshot {
        timestamp_ms,
        environment_found: true,
        browser_version,
        user_data_folder,
        process_count: processes.len() as u32,
        browser_count,
        renderer_count,
        gpu_count,
        utility_count,
        helper_count,
        ppapi_plugin_count,
        ppapi_broker_count,
        total_memory_mb: total_mb,
        processes,
    };

    log::info!(
        "WebView2 process snapshot: {} processes (browser={}, renderer={}, gpu={}, utility={}, helper={}), total={:.1}MB",
        snapshot.process_count,
        snapshot.browser_count,
        snapshot.renderer_count,
        snapshot.gpu_count,
        snapshot.utility_count,
        snapshot.helper_count,
        snapshot.total_memory_mb
    );

    Ok(snapshot)
}

/// Helper: take ownership of PWSTR string from Windows API
fn take_pwstr(pwstr: windows::core::PWSTR) -> String {
    if pwstr.is_null() {
        return String::new();
    }
    unsafe {
        let len = (0..).take_while(|&i| *pwstr.0.add(i) != 0).count();
        let slice = std::slice::from_raw_parts(pwstr.0, len);
        String::from_utf16_lossy(slice)
    }
}

#[tauri::command]
fn get_memory_snapshot(app: tauri::AppHandle) -> Result<MemorySnapshot, String> {
    let tracker = app.state::<Mutex<MemoryTracker>>();
    let cached = app.state::<CachedSystem>();

    
    
    cached.refresh_memory();

    
    let pid = Pid::from_u32(std::process::id());
    let (combined_rss_mb, combined_virt_mb) = cached.get_process_memory(pid)
        .map(|(mem, virt)| (
            mem as f64 / 1024.0 / 1024.0, 
            virt as f64 / 1024.0 / 1024.0, 
        ))
        .unwrap_or((0.0, 0.0));

    
    let (total_ram, available_ram) = cached.get_system_memory();
    let total_ram_mb = total_ram as f64 / 1024.0 / 1024.0;
    let available_ram_mb = available_ram as f64 / 1024.0 / 1024.0;

    
    let pressure_ratio = available_ram_mb / total_ram_mb;
    let pressure_level = if pressure_ratio > 0.5 {
        "low"
    } else if pressure_ratio > 0.2 {
        "medium"
    } else if pressure_ratio > 0.1 {
        "high"
    } else {
        "critical"
    };

    let snapshot = MemorySnapshot {
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        combined_rss_mb,
        combined_virt_mb,
        total_ram_mb,
        available_ram_mb,
        pressure_level: pressure_level.to_string(),
        pressure_ratio,
    };

    let mut t = tracker.lock().unwrap();
    
    if t.snapshots.len() >= MAX_MEMORY_SNAPSHOTS {
        t.snapshots.remove(0);
    }
    t.snapshots.push(snapshot.clone());

    Ok(snapshot)
}

#[tauri::command]
fn get_memory_history(app: tauri::AppHandle) -> Result<Vec<MemorySnapshot>, String> {
    let tracker = app.state::<Mutex<MemoryTracker>>();
    let t = tracker.lock().unwrap();
    Ok(t.snapshots.clone())
}



#[tauri::command]
fn get_navigation_events(app: tauri::AppHandle, limit: Option<usize>) -> Result<Vec<NavigationEvent>, String> {
    let tracker = app.state::<Mutex<SequenceTracker>>();
    let t = tracker.lock().unwrap();

    let events = match limit {
        Some(n) => t.events.iter().rev().take(n).cloned().collect(),
        None => t.events.clone(),
    };

    Ok(events)
}

#[tauri::command]
fn get_domain_sequence(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let tracker = app.state::<Mutex<SequenceTracker>>();
    let t = tracker.lock().unwrap();
    Ok(t.domain_sequence.clone())
}

#[tauri::command]
fn analyze_patterns(app: tauri::AppHandle) -> Result<SequenceAnalysis, String> {
    let tracker = app.state::<Mutex<SequenceTracker>>();
    let t = tracker.lock().unwrap();
    Ok(t.analyze_sequence())
}



#[tauri::command]
fn start_research_session(app: tauri::AppHandle) -> Result<ResearchSession, String> {
    let session_mgr = app.state::<Mutex<SessionManager>>();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

    let session = ResearchSession {
        id: format!("session_{}", uuid_simple()),
        started_at: now,
        ended_at: None,
        total_navigations: 0,
        gap_markers_count: 0,
        analysis_count: 0,
    };

    let mut s = session_mgr.lock().unwrap();
    s.current_session = Some(session.clone());

    Ok(session)
}

#[tauri::command]
fn get_current_session(app: tauri::AppHandle) -> Result<Option<ResearchSession>, String> {
    let session_mgr = app.state::<Mutex<SessionManager>>();
    let s = session_mgr.lock().unwrap();
    Ok(s.current_session.clone())
}

#[tauri::command]
fn export_research_data(app: tauri::AppHandle) -> Result<ResearchExport, String> {
    let seq_tracker = app.state::<Mutex<SequenceTracker>>();
    let session_mgr = app.state::<Mutex<SessionManager>>();
    let memory = app.state::<Mutex<MemoryTracker>>();

    let (events, gap_markers) = {
        let st = seq_tracker.lock().unwrap();
        (st.events.clone(), st.gap_markers.clone())
    };

    let (session, literature, questions) = {
        let s = session_mgr.lock().unwrap();
        (s.current_session.clone(), s.literature_notes.clone(), s.research_questions.clone())
    };

    let snapshots = {
        let m = memory.lock().unwrap();
        m.snapshots.clone()
    };

    
    let mut session_update = session.clone();
    if let Some(ref mut sess) = session_update {
        sess.gap_markers_count = gap_markers.len();
    }

    let export = ResearchExport {
        session: session_update.unwrap_or(ResearchSession {
            id: "no_session".to_string(),
            started_at: 0,
            ended_at: None,
            total_navigations: 0,
            gap_markers_count: 0,
            analysis_count: 0,
        }),
        navigation_events: events,
        memory_snapshots: snapshots,
        literature_notes: literature,
        research_questions: questions,
    };

    Ok(export)
}

#[tauri::command]
fn get_literature_notes(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let session_mgr = app.state::<Mutex<SessionManager>>();
    let s = session_mgr.lock().unwrap();
    Ok(s.literature_notes.clone())
}

#[tauri::command]
fn get_research_questions(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let session_mgr = app.state::<Mutex<SessionManager>>();
    let s = session_mgr.lock().unwrap();
    Ok(s.research_questions.clone())
}



#[tauri::command]
fn get_app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        architecture: "Single WebView with Virtual Tab Navigation".to_string(),
        description: "Research browser for observing knowledge work patterns".to_string(),
        research_features: vec![
            "Raw Navigation Tracking: timestamp, url, domain, action, tab_id".to_string(),
            "Real Memory Measurement: RSS, virtual, system RAM via sysinfo".to_string(),
            "Gap Markers: Potential boundary markers based on temporal gaps".to_string(),
            "Domain Sequences: Raw domain order for analysis".to_string(),
            "Research Export: JSON export for external analysis".to_string(),
        ],
        research_notes: vec![
            "We collect RAW OBSERVATIONS only - no labels stored".to_string(),
            "Analysis is done EXTERNALLY, not in storage layer".to_string(),
            "We TEST hypotheses: RQ1-RQ5 are questions, not conclusions".to_string(),
            "All 'context' labels are DERIVED, not observed".to_string(),
        ],
    }
}

#[derive(Serialize)]
struct AppInfo {
    version: String,
    architecture: String,
    description: String,
    research_features: Vec<String>,
    research_notes: Vec<String>,
}



/// Maximum number of session data entries to retain.
/// Uses FIFO eviction when limit is reached.
const MAX_SESSION_DATA_ENTRIES: usize = 50;

struct SessionData {
    /// Bounded HashMap: keeps at most MAX_SESSION_DATA_ENTRIES entries.
    /// Oldest entry is evicted when limit is reached (FIFO).
    sessions: Mutex<HashMap<String, serde_json::Value>>,
    /// Track insertion order for FIFO eviction
    insertion_order: Mutex<Vec<String>>,
}

impl SessionData {
    /// Insert with bounded retention (FIFO eviction)
    fn insert(&self, key: String, data: serde_json::Value) {
        let mut sessions = self.sessions.lock().unwrap();
        let mut order = self.insertion_order.lock().unwrap();

        
        if sessions.contains_key(&key) {
            sessions.insert(key.clone(), data);
            order.retain(|k| k != &key);
            order.push(key);
            return;
        }

        
        if sessions.len() >= MAX_SESSION_DATA_ENTRIES {
            if let Some(oldest_key) = order.first().cloned() {
                sessions.remove(&oldest_key);
                order.remove(0);
            }
        }

        sessions.insert(key.clone(), data);
        order.push(key);
    }
}

#[tauri::command]
fn save_session_data(app: tauri::AppHandle, key: String, data: serde_json::Value) -> Result<(), String> {
    let session = app.state::<SessionData>();
    session.insert(key, data);
    Ok(())
}

/// Save benchmark results directly to a JSON file (for harness use)
#[tauri::command]
fn save_benchmark_results(data: serde_json::Value) -> Result<(), String> {
    log::info!("[RUN1] save_benchmark_results called with {} control, {} treatment runs",
        data.get("control").and_then(|c| c.as_array()).map(|c| c.len()).unwrap_or(0),
        data.get("treatment").and_then(|t| t.as_array()).map(|t| t.len()).unwrap_or(0));
    let path = std::path::PathBuf::from(r"D:\main\Projects\BRWSR\benchmark_results.json");
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write results: {}", e))?;
    log::info!("Benchmark results saved to {:?}", path);
    Ok(())
}

#[tauri::command]
fn load_session_data(app: tauri::AppHandle, key: String) -> Result<Option<serde_json::Value>, String> {
    let session = app.state::<SessionData>();
    let sessions = session.sessions.lock().unwrap();
    Ok(sessions.get(&key).cloned())
}

#[tauri::command]
fn clear_session_data(app: tauri::AppHandle) -> Result<(), String> {
    let session = app.state::<SessionData>();
    let mut sessions = session.sessions.lock().unwrap();
    let mut order = session.insertion_order.lock().unwrap();
    sessions.clear();
    order.clear();
    Ok(())
}



/// Start a benchmark run with full metadata
#[tauri::command]
fn start_benchmark_run(
    app: tauri::AppHandle,
    run_id: String,
    workload_id: String,
    run_index: u32,
    condition: String,
) -> Result<(), String> {
    let event_store = app.state::<LifecycleEventStore>();

    
    let sys = System::new_all();
    let ram_mb = sys.total_memory() / (1024 * 1024);

    let metadata = BenchmarkMetadata {
        run_id: run_id.clone(),
        workload_id: workload_id.clone(),
        run_index,
        condition: condition.clone(),
        os: "Windows".to_string(),
        os_version: std::env::consts::OS.to_string(),
        cpu_brand: sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_else(|| "Unknown".to_string()),
        cpu_count: sys.cpus().len(),
        ram_mb,
        webview2_version: None, 
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        build_type: if cfg!(debug_assertions) { "debug".to_string() } else { "release".to_string() },
        idle_threshold_secs: 300, 
        memory_pressure_thresholds: PressureThresholds::default(),
        start_time_ms: current_timestamp_ms(),
        end_time_ms: None,
        duration_ms: None,
    };

    event_store.start_benchmark_run(metadata);

    log::info!(
        "Benchmark run started: run_id={}, workload_id={}, run_index={}, condition={}",
        run_id, workload_id, run_index, condition
    );
    Ok(())
}

/// End benchmark run - returns summary with metadata
#[tauri::command]
fn end_benchmark_run(app: tauri::AppHandle) -> Result<BenchmarkRunResult, String> {
    let event_store = app.state::<LifecycleEventStore>();
    let metadata = event_store.get_metadata()
        .ok_or("No benchmark run in progress")?;
    let events = event_store.get_events();
    let stats = event_store.get_stats();

    
    let end_time_ms = current_timestamp_ms();
    let duration_ms = end_time_ms - metadata.start_time_ms;

    log::info!(
        "Benchmark run ended: run_id={}, events={}, duration={}ms",
        metadata.run_id, stats.total_events, duration_ms
    );

    Ok(BenchmarkRunResult {
        metadata,
        stats,
        event_count: events.len(),
        end_time_ms,
        duration_ms,
    })
}

/// Result from ending a benchmark run
#[derive(Serialize)]
struct BenchmarkRunResult {
    metadata: BenchmarkMetadata,
    stats: LifecycleEventStats,
    event_count: usize,
    end_time_ms: u64,
    duration_ms: u64,
}

/// Get all lifecycle events for current benchmark run
#[tauri::command]
fn get_lifecycle_events(app: tauri::AppHandle) -> Result<Vec<LifecycleEvent>, String> {
    let event_store = app.state::<LifecycleEventStore>();
    let metadata = event_store.get_metadata();

    log::debug!("Querying lifecycle events: run_id={:?}", metadata.map(|m| m.run_id));

    Ok(event_store.get_events())
}

/// Get lifecycle event statistics
#[tauri::command]
fn get_lifecycle_event_stats(app: tauri::AppHandle) -> Result<LifecycleEventStats, String> {
    let event_store = app.state::<LifecycleEventStore>();
    Ok(event_store.get_stats())
}

/// Get current benchmark metadata
#[tauri::command]
fn get_benchmark_metadata(app: tauri::AppHandle) -> Result<Option<BenchmarkMetadata>, String> {
    let event_store = app.state::<LifecycleEventStore>();
    Ok(event_store.get_metadata())
}

/// Clear all lifecycle events (for new benchmark run)
#[tauri::command]
fn clear_lifecycle_events(app: tauri::AppHandle) -> Result<(), String> {
    let event_store = app.state::<LifecycleEventStore>();
    let mut events = event_store.events.lock().unwrap();
    events.clear();
    log::info!("Lifecycle events cleared");
    Ok(())
}



/// Run a benchmark workload and collect measurements (synchronous version)
#[tauri::command]
fn run_benchmark_workload(
    app: tauri::AppHandle,
    tab_count: u32,
    urls: Vec<String>,
    measurement_seconds: u64,
    sampling_interval_ms: u64,
    condition: String,
) -> Result<BenchmarkWorkloadResult, String> {
    log::info!("[RUN1] run_benchmark_workload INVOKED: {} tabs, {}s, condition={}", tab_count, measurement_seconds, condition);
    eprintln!("[RUN1] run_benchmark_workload INVOKED via IPC");
    log::info!("[RUN1] state access check...");
    
    let run_id = format!("bench-{}", current_timestamp_ms());
    let event_store = app.state::<LifecycleEventStore>();
    let workload_id = format!("workload-{}-tabs", tab_count);

    
    let sys = System::new_all();
    let ram_mb = sys.total_memory() / (1024 * 1024);

    let metadata = BenchmarkMetadata {
        run_id: run_id.clone(),
        workload_id: workload_id.clone(),
        run_index: 1,
        condition: condition.clone(),
        os: "Windows".to_string(),
        os_version: std::env::consts::OS.to_string(),
        cpu_brand: sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_else(|| "Unknown".to_string()),
        cpu_count: sys.cpus().len(),
        ram_mb,
        webview2_version: None,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        build_type: if cfg!(debug_assertions) { "debug".to_string() } else { "release".to_string() },
        idle_threshold_secs: 300,
        memory_pressure_thresholds: PressureThresholds::default(),
        start_time_ms: current_timestamp_ms(),
        end_time_ms: None,
        duration_ms: None,
    };

    let start_time_ms = metadata.start_time_ms;
    event_store.start_benchmark_run(metadata);

    
    let tab_manager = app.state::<Mutex<TabManager>>();

    
    let mut tab_ids = Vec::new();
    for i in 0..tab_count {
        let tab_id = format!("bench-tab-{}", i);
        let url = urls.get(i as usize).cloned().unwrap_or_else(|| HOMEPAGE.to_string());

        let tab_data = TabData {
            id: tab_id.clone(),
            history_index: 0,
            created_at: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            last_accessed: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
        };

        {
            let mut tm = tab_manager.lock().unwrap();
            let mut tabs = tm.tabs.lock().unwrap();
            tabs.insert(tab_id.clone(), tab_data);
        }
        {
            let mut tm = tab_manager.lock().unwrap();
            let mut history = tm.history.lock().unwrap();
            history.push(url);
        }

        tab_ids.push(tab_id);
    }

    
    std::thread::sleep(std::time::Duration::from_secs(30));

    let start_time = std::time::Instant::now();
    let mut samples = Vec::new();

    while start_time.elapsed().as_secs() < measurement_seconds {
        
        
        
        let browser_state = app.state::<BrowserWebview>();
        let group_memory_mb = browser_state.webview.lock().unwrap()
            .as_ref()
            .and_then(|w| sample_webview2_memory(w, &app).ok())
            .map(|(mb, _, _, _)| mb)
            .unwrap_or(0.0);

        samples.push(group_memory_mb);
        std::thread::sleep(std::time::Duration::from_millis(sampling_interval_ms));
    }

    
    let peak = samples.iter().cloned().fold(0.0f64, f64::max);
    let mean = if !samples.is_empty() {
        samples.iter().sum::<f64>() / samples.len() as f64
    } else {
        0.0
    };

    
    let lifecycle_stats = event_store.get_stats();
    let lifecycle_events = event_store.get_events();

    let end_time_ms = current_timestamp_ms();

    log::info!(
        "Benchmark workload completed: peak={:.1}MB, mean={:.1}MB, eviction_attempts={}",
        peak, mean, lifecycle_stats.evict_completed
    );

    Ok(BenchmarkWorkloadResult {
        run_id,
        workload_id,
        tab_count,
        peak_memory_mb: peak,
        mean_memory_mb: mean,
        samples,
        lifecycle_stats,
        lifecycle_events,
        end_time_ms,
        duration_ms: end_time_ms - start_time_ms,
    })
}

/// Result from benchmark workload run
#[derive(Serialize)]
struct BenchmarkWorkloadResult {
    run_id: String,
    workload_id: String,
    tab_count: u32,
    peak_memory_mb: f64,
    mean_memory_mb: f64,
    samples: Vec<f64>,
    lifecycle_stats: LifecycleEventStats,
    lifecycle_events: Vec<LifecycleEvent>,
    end_time_ms: u64,
    duration_ms: u64,
}





static BENCHMARK_MODE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Returns true if the app was started with --benchmark flag.
/// Frontend checks this on mount to auto-start the harness.
#[tauri::command]
fn is_benchmark_mode() -> bool {
    let v = BENCHMARK_MODE.load(std::sync::atomic::Ordering::SeqCst);
    log::info!("[RUN1] is_benchmark_mode called, returning {}", v);
    v
}

/// Exits the application (used after harness completes in benchmark mode).
#[tauri::command]
fn exit_app() {
    log::info!("[RUN1] exit_app invoked — shutting down");
    std::process::exit(0);
}

/// Simple test command to verify IPC works.
#[tauri::command]
fn test_command(message: String) -> Result<String, String> {
    log::info!("[TEST] test_command called with: {}", message);
    eprintln!("[TEST] test_command called with: {}", message);
    Ok(format!("ECHO: {}", message))
}

/// Long-running test command (simulates benchmark).
#[tauri::command]
async fn test_long_command(app: tauri::AppHandle, seconds: u64) -> Result<String, String> {
    log::info!("[TEST] test_long_command called: sleeping {}s", seconds);
    
    let event_store = app.state::<LifecycleEventStore>();
    log::info!("[TEST] test_long_command: state accessed OK");
    std::thread::sleep(std::time::Duration::from_secs(seconds));
    log::info!("[TEST] test_long_command completed after {}s", seconds);
    Ok(format!("slept {} seconds", seconds))
}

/// Quick benchmark test (2s warmup, 5s measurement).
#[tauri::command]
async fn test_benchmark_quick(
    app: tauri::AppHandle,
    tab_count: u32,
    condition: String,
) -> Result<BenchmarkWorkloadResult, String> {
    log::info!("[TEST] test_benchmark_quick called: {} tabs, condition={}", tab_count, condition);
    eprintln!("[TEST] test_benchmark_quick INVOKED via IPC");

    let event_store = app.state::<LifecycleEventStore>();
    log::info!("[TEST] test_benchmark_quick: state accessed OK");

    let event_store = app.state::<LifecycleEventStore>();
    let cached = app.state::<CachedSystem>();
    let run_id = format!("quick-{}", current_timestamp_ms());

    
    let (total_ram, _) = cached.get_system_memory();
    let ram_mb = total_ram / (1024 * 1024);

    
    cached.refresh_all();
    let (cpu_brand, cpu_count) = {
        let sys = cached.sys.lock().unwrap();
        (
            sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_else(|| "Unknown".to_string()),
            sys.cpus().len(),
        )
    };

    let metadata = BenchmarkMetadata {
        run_id: run_id.clone(),
        workload_id: format!("quick-{}-tabs", tab_count),
        run_index: 1,
        condition: condition.clone(),
        os: "Windows".to_string(),
        os_version: std::env::consts::OS.to_string(),
        cpu_brand,
        cpu_count,
        ram_mb,
        webview2_version: None,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        build_type: if cfg!(debug_assertions) { "debug".to_string() } else { "release".to_string() },
        idle_threshold_secs: 300,
        memory_pressure_thresholds: PressureThresholds::default(),
        start_time_ms: current_timestamp_ms(),
        end_time_ms: None,
        duration_ms: None,
    };
    event_store.start_benchmark_run(metadata);

    
    log::info!("[TEST] test_benchmark_quick: warmup 2s...");
    std::thread::sleep(std::time::Duration::from_secs(2));

    
    log::info!("[TEST] test_benchmark_quick: measuring 5s...");
    let start_time = std::time::Instant::now();
    let mut samples = Vec::new();
    let pid = Pid::from_u32(std::process::id());

    while start_time.elapsed().as_secs() < 5 {
        
        
        cached.refresh_memory();
        let rss = cached.get_process_memory(pid)
            .map(|(mem, _)| mem as f64 / 1024.0 / 1024.0)
            .unwrap_or(0.0);
        samples.push(rss);
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    log::info!("[TEST] test_benchmark_quick: completed {} samples", samples.len());
    let stats = event_store.get_stats();
    let start_ms = event_store.get_metadata().map(|m| m.start_time_ms).unwrap_or(0);
    Ok(BenchmarkWorkloadResult {
        run_id,
        workload_id: format!("quick-{}-tabs", tab_count),
        tab_count,
        peak_memory_mb: samples.iter().cloned().fold(0.0f64, f64::max),
        mean_memory_mb: if !samples.is_empty() { samples.iter().sum::<f64>() / samples.len() as f64 } else { 0.0 },
        samples,
        lifecycle_stats: stats,
        lifecycle_events: event_store.get_events(),
        end_time_ms: current_timestamp_ms(),
        duration_ms: current_timestamp_ms().saturating_sub(start_ms),
    })
}



/// Panic handler that writes to a log file for diagnostics
fn setup_panic_handler() {
    use std::panic;
    use std::fs::OpenOptions;
    use std::io::Write;

    // Get app-local log directory
    let log_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let panic_log_path = log_dir.join("panic_log.txt");
    let panic_log_path_for_closure = panic_log_path.clone();
    let panic_log_path_for_log = panic_log_path.clone();

    panic::set_hook(Box::new(move |panic_info| {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);

        let location = panic_info.location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());

        let message = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };

        let log_line = format!(
            "[{}] PANIC at {}: {}\n",
            timestamp, location, message
        );

        // Write to stderr
        eprintln!("{}", log_line);
        eprintln!("PANIC DETAILS: {:?}", panic_info);

        // Write to file
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&panic_log_path_for_closure)
        {
            let _ = writeln!(file, "{}", log_line);
            let _ = writeln!(file, "Full panic info: {:?}", panic_info);
            let _ = writeln!(file, "---");
        }

        eprintln!("[PANIC] Panic written to: {:?}", panic_log_path_for_closure);
    }));

    log::info!("[STARTUP] Panic handler installed. Log path: {:?}", panic_log_path_for_log);
}

// ── Forensic paint hierarchy commands ─────────────────────────────────────────
#[cfg(target_os = "windows")]
#[tauri::command]
fn dump_paint_hierarchy(app: tauri::AppHandle) -> Result<String, String> {
    let main_window = app.get_window("main").ok_or("Main window not found")?;
    let main_hwnd = main_window.hwnd().map_err(|e| format!("hwnd error: {}", e))?;
    let raw = main_hwnd.0 as isize;
    forensic::dump_webview_paint_hierarchy(raw, "MANUAL_TRIGGER");
    Ok(format!("Paint hierarchy written to forensic log for main hwnd=0x{:X}", raw))
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn run_zorder_tests(app: tauri::AppHandle) -> Result<String, String> {
    let main_window = app.get_window("main").ok_or("Main window not found")?;
    let main_hwnd = main_window.hwnd().map_err(|e| format!("hwnd error: {}", e))?;
    let raw = main_hwnd.0 as isize;
    forensic::run_zorder_tests(raw);
    Ok(format!("Z-order tests complete for main hwnd=0x{:X}", raw))
}

// ── FORENSIC: Comprehensive browser geometry diagnostic ─────────────────────
// Inspects both WRY windows and pixel ownership at key viewport points.
// Writes to %TEMP%\eduos-browser-hwnd-diagnostic.log
#[cfg(target_os = "windows")]
#[tauri::command]
fn diagnose_browser_geometry(app: tauri::AppHandle) -> Result<String, String> {
    use windows::Win32::Foundation::{HWND as RawHWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    use windows::Win32::UI::WindowsAndMessaging::IsWindowVisible;

    forensic::stage("DIAGNOSE_BROWSER_GEOMETRY");

    let main_window = app.get_window("main").ok_or("Main window not found")?;
    let main_hwnd_val = main_window.hwnd().map_err(|e| format!("hwnd error: {}", e))?;
    let main_h = RawHWND(main_hwnd_val.0);

    // Full tree dump.
    forensic::dump_tree(main_h.0 as isize, "diagnose");
    forensic::dump_webview_paint_hierarchy(main_h.0 as isize, "diagnose");

    // Get main window rect.
    let mut main_rect = RECT::default();
    let mr: RECT = if unsafe { GetWindowRect(main_h, &mut main_rect) }.is_ok() {
        main_rect
    } else {
        forensic::log_event(main_h.0 as isize, "DIAGNOSE", "Failed to get main window rect");
        return Err("Failed to get main window rect".into());
    };

    let mw = (mr.right - mr.left) as i32;
    let mh = (mr.bottom - mr.top) as i32;
    forensic::kv("main_rect", &format!("({},{} {},{})", mr.left, mr.top, mr.right, mr.bottom));
    forensic::kv("main_size", &format!("{}x{}", mw, mh));
    forensic::kv("ui_height", &format!("{}", UI_HEIGHT));

    // Inspect React WRY.
    if let Some(react_h) = find_react_ui_wry(main_h) {
        let mut rr = RECT::default();
        let rv = unsafe { IsWindowVisible(react_h) }.as_bool();
        let _ = unsafe { GetWindowRect(react_h, &mut rr) };
        forensic::log_event(react_h.0 as isize, "REACT_WRY", &format!(
            "rect=({},{} {},{}) visible={}", rr.left, rr.top, rr.right, rr.bottom, rv
        ));
    } else {
        forensic::line("  REACT_WRY: not found");
    }

    // Inspect Browser WRY.
    if let Some(browser_h) = find_browser_wry_by_geometry(main_h) {
        let mut br = RECT::default();
        let bv = unsafe { IsWindowVisible(browser_h) }.as_bool();
        let _ = unsafe { GetWindowRect(browser_h, &mut br) };
        forensic::log_event(browser_h.0 as isize, "BROWSER_WRY", &format!(
            "rect=({},{} {},{}) visible={}", br.left, br.top, br.right, br.bottom, bv
        ));

        // Browser render surface.
        if let Some((rh, cls, depth)) = find_render_surface(browser_h) {
            let mut rr = RECT::default();
            let _ = unsafe { GetWindowRect(rh, &mut rr) };
            forensic::log_event(rh.0 as isize, "BROWSER_RENDER_SURFACE", &format!(
                "cls={} depth={} rect=({},{} {},{})", cls, depth, rr.left, rr.top, rr.right, rr.bottom
            ));
        }

        // Point inspections at browser viewport.
        forensic::section("BROWSER-VIEWPORT-POINTS");

        // Browser center.
        let bx1 = br.left + (br.right - br.left) / 2;
        let by1 = br.top + (br.bottom - br.top) / 2;
        forensic::kv("browser_center", &format!("({},{})", bx1, by1));
        forensic::inspect_point(bx1, by1, "BROWSER-CENTER");

        // Browser top-left.
        forensic::inspect_point(br.left + 10, br.top + 10, "BROWSER-TOPLEFT");

        // Browser bottom-right.
        forensic::inspect_point(br.right - 10, br.bottom - 10, "BROWSER-BOTTOMRIGHT");

        // React center (control — should be React WRY).
        forensic::inspect_point(mr.left + mw / 2, mr.top + 30, "REACT-CENTER");

        // Point at the boundary (y = UI_HEIGHT).
        let boundary_y = mr.top + UI_HEIGHT as i32;
        forensic::inspect_point(mr.left + mw / 2, boundary_y, "UI-BOUNDARY");

    } else {
        forensic::line("  BROWSER_WRY: not found");
    }

    Ok(format!(
        "Diagnostic written to forensic log: main=0x{:X} main_rect=({},{} {},{})",
        main_h.0 as isize, mr.left, mr.top, mr.right, mr.bottom
    ))
}

// ── FORENSIC: Controlled browser geometry experiment ──────────────────────────
// Temporarily moves the browser WRY to a non-overlapping position.
// The browser WRY is repositioned using MoveWindow (not add_child/set_bounds).
// After inspection, the browser WRY is RESTORED to its original position.
// This tests whether non-overlapping geometry allows browser rendering.
#[cfg(target_os = "windows")]
#[tauri::command]
fn experiment_browser_nonoverlap(app: tauri::AppHandle) -> Result<String, String> {
    use windows::Win32::Foundation::{HWND as RawHWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowRect, MoveWindow, GetWindow};

    forensic::stage("EXPERIMENT_NONOVERLAP");

    let main_window = app.get_window("main").ok_or("Main window not found")?;
    let main_hwnd_val = main_window.hwnd().map_err(|e| format!("hwnd error: {}", e))?;
    let main_h = RawHWND(main_hwnd_val.0);

    // Get main window rect.
    let mut mr = RECT::default();
    if unsafe { GetWindowRect(main_h, &mut mr) }.is_err() {
        return Err("Failed to get main window rect".into());
    }
    let mw = (mr.right - mr.left) as i32;
    let mh = (mr.bottom - mr.top) as i32;

    forensic::kv("main_rect", &format!("({},{} {},{})", mr.left, mr.top, mr.right, mr.bottom));
    forensic::kv("experiment", "NONOVERLAP");
    forensic::kv("ui_height", &format!("{}", UI_HEIGHT));

    // Find browser WRY.
    let Some(browser_h) = find_browser_wry_by_geometry(main_h) else {
        return Err("Browser WRY not found".into());
    };

    // Get original browser WRY rect.
    let mut orig_rect = RECT::default();
    if unsafe { GetWindowRect(browser_h, &mut orig_rect) }.is_err() {
        return Err("Failed to get browser WRY rect".into());
    }

    let orig_left = orig_rect.left;
    let orig_top = orig_rect.top;
    let orig_w = orig_rect.right - orig_rect.left;
    let orig_h = orig_rect.bottom - orig_rect.top;

    forensic::log_event(browser_h.0 as isize, "EXPERIMENT_ORIG", &format!(
        "rect=({},{} {},{}) size={}x{}", orig_left, orig_top, orig_rect.right, orig_rect.bottom, orig_w, orig_h
    ));

    // ── Experiment: Move browser WRY to a smaller, clearly non-overlapping position ─
    // Position: shifted 50px down and 50px right from original.
    // Size: reduced to 50% to make it visually obvious.
    let exp_w = orig_w / 2;
    let exp_h = orig_h / 2;
    let exp_x = orig_left + 50;
    let exp_y = orig_top + 50;

    forensic::line(&format!("  Moving browser WRY to non-overlapping position: ({},{}) {}x{}", exp_x, exp_y, exp_w, exp_h));

    let moved = unsafe {
        MoveWindow(browser_h, exp_x, exp_y, exp_w, exp_h, true)
    };

    forensic::kv("move_result", if moved.is_ok() { "OK" } else { "FAILED" });

    if moved.is_err() {
        return Err("MoveWindow failed".into());
    }

    // Give the window time to paint.
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Capture post-move state.
    forensic::dump_tree(main_h.0 as isize, "post-move");
    forensic::inspect_point(exp_x + exp_w / 2, exp_y + exp_h / 2, "POST-MOVE-BROWSER-CENTER");
    forensic::inspect_point(orig_left + orig_w / 2, orig_top + orig_h / 2, "POST-MOVE-ORIG-CENTER");

    forensic::line("  === Experiment observation window ===");
    forensic::line("  Please visually inspect the application now.");
    forensic::line(&format!("  Browser WRY should appear at: ({},{}) {}x{}", exp_x, exp_y, exp_w, exp_h));
    forensic::line("  React UI should remain at original position.");
    forensic::line("  === End observation window ===");

    // Restore original position.
    forensic::line(&format!("  Restoring browser WRY to original: ({},{}) {}x{}", orig_left, orig_top, orig_w, orig_h));
    let restored = unsafe {
        MoveWindow(browser_h, orig_left, orig_top, orig_w, orig_h, true)
    };
    forensic::kv("restore_result", if restored.is_ok() { "OK" } else { "FAILED" });

    forensic::stage("EXPERIMENT_COMPLETE");

    Ok(format!(
        "Experiment complete. Browser WRY moved to ({},{}) {}x{} then restored.",
        exp_x, exp_y, exp_w, exp_h
    ))
}

/// Native overlay window geometry: viewport-relative rect in PHYSICAL pixels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeOverlayRect {
    pub viewport_x: i32,
    pub viewport_y: i32,
    pub width: i32,
    pub height: i32,
}

/// Native overlay window state — holds the overlay WebviewWindow reference.
struct OverlayWindowState {
    window: Mutex<Option<tauri::WebviewWindow>>,
    browser_offset_y: Mutex<i32>,
}

impl Default for OverlayWindowState {
    fn default() -> Self {
        Self {
            window: Mutex::new(None),
            browser_offset_y: Mutex::new(0),
        }
    }
}

/// Debug overlay window state — holds the debug-overlay WebviewWindow reference.
struct DebugOverlayState {
    window: Mutex<Option<tauri::WebviewWindow>>,
}

impl Default for DebugOverlayState {
    fn default() -> Self {
        Self {
            window: Mutex::new(None),
        }
    }
}

/// ─────────────────────────────────────────────────────────────────────────────
/// Create the native overlay WebviewWindow.
/// Window starts HIDDEN and is shown via show() call.
/// Uses skip_taskbar=true to keep it out of the Windows taskbar.
/// ─────────────────────────────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
fn create_overlay_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    const PRODUCTION_WINDOW_LABEL: &str = "native-overlay";

    log::info!("[NATIVE-OVERLAY] CREATE_NEW_WINDOW label={}", PRODUCTION_WINDOW_LABEL);

    // Production window configuration:
    // - decorations(false): no title bar
    // - transparent(false): solid background (works reliably)
    // - always_on_top(true): stays above other windows
    // - visible(false): starts hidden, shown via .show()
    // - skip_taskbar(true): hidden from Windows taskbar
    let builder = WebviewWindowBuilder::new(app, PRODUCTION_WINDOW_LABEL, WebviewUrl::App("src/overlay.html".into()))
        .title("EduOS Menu")
        .inner_size(288.0, 350.0)
        .decorations(false)
        .transparent(false)
        .always_on_top(true)
        .visible(false)
        .skip_taskbar(true);

    log::info!("[NATIVE-OVERLAY] Builder created, calling build()...");

    let overlay = builder.build()
        .map_err(|e| {
            log::error!("[NATIVE-OVERLAY] CREATE_FAILED: {}", e);
            format!("[NATIVE-OVERLAY] Failed to create overlay window: {}", e)
        })?;

    log::info!("[NATIVE-OVERLAY] CREATE_SUCCESS label={}", overlay.label());
    let is_visible = overlay.is_visible().unwrap_or(false);
    log::info!("[NATIVE-OVERLAY] initial_visibility={} (expected: false)", is_visible);

    if let Ok(hwnd) = overlay.hwnd() {
        log::info!("[NATIVE-OVERLAY] hwnd=0x{:X}", hwnd.0 as isize);
    }

    log::info!("[NATIVE-OVERLAY] CREATE_COMPLETE");

    Ok(overlay)
}

#[cfg(not(target_os = "windows"))]
fn create_overlay_window(_app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    Err("Overlay window only supported on Windows".into())
}

/// ─────────────────────────────────────────────────────────────────────────────
/// Command: Show the native overlay window at the given screen position.
/// Creates the window on first call, reuses on subsequent calls.
/// ─────────────────────────────────────────────────────────────────────────────
#[tauri::command]
async fn show_native_overlay(
    app: tauri::AppHandle,
    overlay_type: String,
    viewport_x: i32,
    viewport_y: i32,
    width: i32,
    height: i32,
) -> Result<String, String> {
    use tauri::Manager;
    use windows::Win32::Foundation::{HWND as RawHWND, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowRect, SetWindowPos, IsWindowVisible,
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // [NATIVE-OVERLAY] Deterministic production logging
    // ═══════════════════════════════════════════════════════════════════════════════
    log::info!("");
    log::info!("[NATIVE-OVERLAY] ════════════════════════════════════════════");
    log::info!("[NATIVE-OVERLAY] SHOW_REQUEST overlay_type={}", overlay_type);
    log::info!("[NATIVE-OVERLAY] viewport=({},{}) size=({}x{})", viewport_x, viewport_y, width, height);

    let state = app.state::<OverlayWindowState>();

    // ── Check if window exists ─────────────────────────────────────────────
    let window_exists = {
        let opt = state.window.lock().unwrap();
        opt.is_some()
    };
    log::info!("[NATIVE-OVERLAY] WINDOW_EXISTS={}", window_exists);

    // ── Create or reuse overlay window ─────────────────────────────────────
    let overlay = {
        if window_exists {
            log::info!("[NATIVE-OVERLAY] REUSE_EXISTING_WINDOW");
            let opt = state.window.lock().unwrap();
            opt.as_ref().unwrap().clone()
        } else {
            log::info!("[NATIVE-OVERLAY] CREATE_NEW_WINDOW");
            let w = create_overlay_window(&app)?;
            let mut opt = state.window.lock().unwrap();
            *opt = Some(w.clone());
            w
        }
    };

    log::info!("[NATIVE-OVERLAY] window_label={}", overlay.label());

    // ── Get main window HWND ────────────────────────────────────────────────
    let main_window = app.get_window("main")
        .ok_or_else(|| "[NATIVE-OVERLAY] get_window('main') returned None".to_string())?;
    let main_hwnd_raw = main_window.hwnd()
        .map_err(|e| format!("hwnd error: {}", e))?;
    let main_hwnd = RawHWND(main_hwnd_raw.0);

    // ── Get main window rect ───────────────────────────────────────────────
    let mut main_rect = RECT::default();
    unsafe {
        if GetWindowRect(main_hwnd, &mut main_rect).is_err() {
            return Err("[NATIVE-OVERLAY] Failed to get main window rect".into());
        }
    }
    log::info!("[NATIVE-OVERLAY] main_rect=({},{})→({},{})",
        main_rect.left, main_rect.top, main_rect.right, main_rect.bottom);

    // ── Calculate screen position ─────────────────────────────────────────
    let browser_offset_y = *state.browser_offset_y.lock().unwrap();
    let screen_x = main_rect.left + viewport_x;
    let screen_y = main_rect.top + browser_offset_y + viewport_y;
    let w = width.max(200);
    let h = height.max(100);

    log::info!("[NATIVE-OVERLAY] UPDATE_GEOMETRY screen=({},{}) size=({}x{})", screen_x, screen_y, w, h);

    // ── Get overlay HWND and set position ──────────────────────────────────
    let overlay_hwnd_raw = overlay.hwnd()
        .map_err(|e| format!("hwnd error: {}", e))?;
    let overlay_hwnd = RawHWND(overlay_hwnd_raw.0);

    unsafe {
        let r = SetWindowPos(
            overlay_hwnd,
            Some(windows::Win32::UI::WindowsAndMessaging::HWND_TOPMOST),
            screen_x,
            screen_y,
            w,
            h,
            windows::Win32::UI::WindowsAndMessaging::SWP_NOACTIVATE
                | windows::Win32::UI::WindowsAndMessaging::SWP_NOZORDER,
        );
        if r.is_err() {
            return Err("[NATIVE-OVERLAY] SetWindowPos failed".into());
        }
    }
    log::info!("[NATIVE-OVERLAY] SetWindowPos OK");

    // ── Show the window ───────────────────────────────────────────────────
    overlay.show()
        .map_err(|e| format!("show failed: {}", e))?;
    log::info!("[NATIVE-OVERLAY] show() OK");

    overlay.set_always_on_top(true)
        .map_err(|e| format!("set_always_on_top failed: {}", e))?;
    log::info!("[NATIVE-OVERLAY] set_always_on_top OK");

    // ── Verify visibility ─────────────────────────────────────────────────
    let is_visible = unsafe { IsWindowVisible(overlay_hwnd).as_bool() };
    log::info!("[NATIVE-OVERLAY] is_visible={}", is_visible);

    // ── Restore focus to main window ──────────────────────────────────────
    let _ = main_window.set_focus();

    log::info!("[NATIVE-OVERLAY] SHOW_COMPLETE type={} at=({},{}) size=({}x{}) visible={}",
        overlay_type, screen_x, screen_y, w, h, is_visible);
    log::info!("[NATIVE-OVERLAY] ════════════════════════════════════════════");
    log::info!("");

    Ok(format!(
        "overlay: type={} at=({},{}) size=({}x{}) visible={} hwnd=0x{:X}",
        overlay_type, screen_x, screen_y, w, h, is_visible, overlay_hwnd.0 as isize
    ))
}

/// Command: Hide the native overlay window.
#[tauri::command]
fn hide_native_overlay(app: tauri::AppHandle) -> Result<String, String> {
    log::info!("[NATIVE-OVERLAY] HIDE_REQUEST");

    let state = app.state::<OverlayWindowState>();
    let opt = state.window.lock().unwrap();

    if let Some(ref window) = *opt {
        window.hide()
            .map_err(|e| format!("[NATIVE-OVERLAY] hide failed: {}", e))?;
        log::info!("[NATIVE-OVERLAY] HIDE_COMPLETE");
        Ok("[NATIVE-OVERLAY] hidden".into())
    } else {
        log::info!("[NATIVE-OVERLAY] HIDE_COMPLETE (window not created yet)");
        Ok("[NATIVE-OVERLAY] not created yet".into())
    }
}

/// Command: Check if the overlay window is visible.
#[tauri::command]
fn is_native_overlay_visible(app: tauri::AppHandle) -> Result<bool, String> {
    let state = app.state::<OverlayWindowState>();
    let opt = state.window.lock().unwrap();

    if let Some(ref window) = *opt {
        window.is_visible()
            .map_err(|e| format!("[OVERLAY_WINDOW] visibility check failed: {}", e))
    } else {
        Ok(false)
    }
}

/// Command: Toggle bookmark for current URL. Called from overlay window.
#[tauri::command]
fn overlay_bookmark_toggle(app: tauri::AppHandle) -> Result<String, String> {
    // Get the URL from active tab via tab manager state.
    // For now, emit an event to the main React app to handle the toggle.
    use tauri::Emitter;
    app.emit("overlay-bookmark-toggle", ())
        .map_err(|e| format!("[OVERLAY_WINDOW] emit failed: {}", e))?;
    log::info!("[OVERLAY_WINDOW] overlay-bookmark-toggle emitted");
    Ok("bookmark toggle emitted".into())
}

/// Command: Navigate to a URL. Called from overlay window.
#[tauri::command]
fn overlay_navigate(app: tauri::AppHandle, url: String) -> Result<String, String> {
    // Emit navigation event to main React app.
    use tauri::Emitter;
    app.emit("overlay-navigate", &url)
        .map_err(|e| format!("[OVERLAY_WINDOW] emit failed: {}", e))?;
    // Also hide the overlay after navigation.
    let state = app.state::<OverlayWindowState>();
    let opt = state.window.lock().unwrap();
    if let Some(ref window) = *opt {
        let _ = window.hide();
    }
    log::info!("[OVERLAY_WINDOW] overlay-navigate: {}", url);
    Ok(format!("navigating to {}", url))
}

// ═══════════════════════════════════════════════════════════════════════════════
// MINIMAL WINDOW EXPERIMENT
// Tests whether WebviewWindow creation hangs when scheduled on Tauri runtime
// ═══════════════════════════════════════════════════════════════════════════════

/// Command: Minimal window threading experiment (Ctrl+Shift+M).
/// Calls WebviewWindowBuilder::build() directly inside an async Tauri IPC command.
/// This tests whether the hang is specific to sync command context.
#[tauri::command]
async fn show_minimal_window_experiment(window: tauri::Window) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write as IoWrite;
    use std::path::PathBuf;
    use tauri::Manager;
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    let temp_dir = std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| "C:\\Temp".into());
    let log_path: PathBuf = PathBuf::from(&temp_dir).join("eduos-native-overlay.log");

    let mut log_file = File::create(&log_path)
        .map_err(|e| format!("failed to create log {}: {}", log_path.display(), e))?;

    macro_rules! log {
        ($($tt:tt)*) => { {
            let line = format!($($tt)*);
            let _ = log_file.write_all(line.as_bytes());
            let _ = log_file.write_all(b"\n");
        } };
    }

    log!("");
    log!("[MINWIN] ===== MINIMAL WINDOW EXPERIMENT =====");
    log!("[MINWIN] log_file={}", log_path.display());
    log!("[MINWIN] COMMAND_ENTERED");
    log!("[MINWIN] CALLING_WINDOW_LABEL={}", window.label());
    let app = window.app_handle();
    log!("[MINWIN] APP_HANDLE_ACQUIRED");

    log!("[MINWIN] BEFORE_BUILDER");

    let app_owned = app.clone();
    let builder = WebviewWindowBuilder::new(
        &app_owned,
        "minimal-window-experiment",
        WebviewUrl::App("src/minimal-window.html".into()),
    )
    .title("MINIMAL WINDOW TEST")
    .inner_size(400.0, 300.0)
    .visible(true)
    .decorations(true)
    .transparent(false)
    .always_on_top(false)
    .skip_taskbar(false);

    log!("[MINWIN] BEFORE_BUILD");

    let build_result = builder.build();

    log!("[MINWIN] AFTER_BUILD");

    let _ = log_file.flush();

    match build_result {
        Ok(w) => {
            log!("[MINWIN] BUILD_SUCCESS label={} visible={}", w.label(), w.is_visible().unwrap_or(false));
            log!("[MINWIN] ===== COMPLETE =====");
            let _ = log_file.flush();
            Ok(format!("minimal window created: {}", w.label()))
        }
        Err(e) => {
            log!("[MINWIN] BUILD_ERROR={}", e);
            log!("[MINWIN] ===== FAILED =====");
            let _ = log_file.flush();
            Err(format!("build failed: {}", e))
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BORDERLESS + ALWAYS_ON_TOP EXPERIMENT
// Tests whether decorations(false) + always_on_top(true) creates a visible
// borderless window above the browser WebView.
// ═══════════════════════════════════════════════════════════════════════════════

/// Command: Minimal borderless always-on-top window experiment (Ctrl+Shift+T).
/// IDENTICAL to show_minimal_window_experiment EXCEPT:
///   - decorations(false)
///   - always_on_top(true)
///   - unique label "minimal-topmost"
///   - title "MINIMAL BORDERLESS TOPMOST"
/// Purpose: isolate whether z-order / always_on_top fixes the invisible borderless window.
#[tauri::command]
async fn show_minimal_topmost(window: tauri::Window) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write as IoWrite;
    use std::path::PathBuf;
    use tauri::Manager;
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    let temp_dir = std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| "C:\\Temp".into());
    let log_path: PathBuf = PathBuf::from(&temp_dir).join("eduos-native-overlay.log");

    let mut log_file = File::create(&log_path)
        .map_err(|e| format!("failed to create log {}: {}", log_path.display(), e))?;

    macro_rules! log {
        ($($tt:tt)*) => { {
            let line = format!($($tt)*);
            let _ = log_file.write_all(line.as_bytes());
            let _ = log_file.write_all(b"\n");
        } };
    }

    log!("");
    log!("[TOPMOST] ===== MINIMAL BORDERLESS TOPMOST EXPERIMENT =====");
    log!("[TOPMOST] log_file={}", log_path.display());
    log!("[TOPMOST] COMMAND_ENTERED");
    log!("[TOPMOST] CALLING_WINDOW_LABEL={}", window.label());
    let app = window.app_handle();
    log!("[TOPMOST] APP_HANDLE_ACQUIRED");

    log!("[TOPMOST] BEFORE_BUILDER");

    let app_owned = app.clone();
    let builder = WebviewWindowBuilder::new(
        &app_owned,
        "minimal-topmost",
        WebviewUrl::App("src/minimal-window.html".into()),
    )
    .title("MINIMAL BORDERLESS TOPMOST")
    .inner_size(400.0, 300.0)
    .visible(true)
    .decorations(false)
    .transparent(false)
    .always_on_top(true)
    .skip_taskbar(false);

    log!("[TOPMOST] BEFORE_BUILD");

    let build_result = builder.build();

    log!("[TOPMOST] AFTER_BUILD");

    let _ = log_file.flush();

    match build_result {
        Ok(w) => {
            log!("[TOPMOST] BUILD_SUCCESS label={} visible={}", w.label(), w.is_visible().unwrap_or(false));
            log!("[TOPMOST] ===== COMPLETE =====");
            let _ = log_file.flush();
            Ok(format!("minimal-topmost created: {}", w.label()))
        }
        Err(e) => {
            log!("[TOPMOST] BUILD_ERROR={}", e);
            log!("[TOPMOST] ===== FAILED =====");
            let _ = log_file.flush();
            Err(format!("build failed: {}", e))
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEBUG OVERLAY — MINIMAL PROOF-OF-CONCEPT
// Phase 1: Prove a separate WebviewWindow can visibly appear above main window
// ═══════════════════════════════════════════════════════════════════════════════

/// Command: Show debug overlay window (Ctrl+Shift+O).
/// MINIMAL EXPERIMENT: EXACT copy of show_minimal_window_experiment body.
/// Changes ONLY: label="debug-overlay-copy", URL="src/debug-overlay.html".
/// Everything else — command structure, AppHandle acquisition, builder options,
/// log flushing — is IDENTICAL to the working show_minimal_window_experiment.
/// NO state. NO mutex. NO conditional build. NO forensics before flush.
#[tauri::command]
async fn show_debug_overlay(window: tauri::Window) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write as IoWrite;
    use std::path::PathBuf;
    use tauri::Manager;
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    let temp_dir = std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| "C:\\Temp".into());
    let log_path: PathBuf = PathBuf::from(&temp_dir).join("eduos-native-overlay.log");

    let mut log_file = File::create(&log_path)
        .map_err(|e| format!("failed to create log {}: {}", log_path.display(), e))?;

    macro_rules! log {
        ($($tt:tt)*) => { {
            let line = format!($($tt)*);
            let _ = log_file.write_all(line.as_bytes());
            let _ = log_file.write_all(b"\n");
        } };
    }

    log!("");
    log!("[OVERLAY] ===== DEBUG OVERLAY MINIMAL EXPERIMENT =====");
    log!("[OVERLAY] log_file={}", log_path.display());
    log!("[OVERLAY] COMMAND_ENTERED");
    log!("[OVERLAY] CALLING_WINDOW_LABEL={}", window.label());
    let app = window.app_handle();
    log!("[OVERLAY] APP_HANDLE_ACQUIRED");

    log!("[OVERLAY] BEFORE_BUILDER");

    let app_owned = app.clone();
    let builder = WebviewWindowBuilder::new(
        &app_owned,
        "debug-overlay-copy",
        WebviewUrl::App("src/debug-overlay.html".into()),
    )
    .title("Debug Overlay Copy")
    .inner_size(400.0, 300.0)
    .visible(true)
    .decorations(true)
    .transparent(false)
    .always_on_top(false)
    .skip_taskbar(false);

    log!("[OVERLAY] BEFORE_BUILD");

    let build_result = builder.build();

    log!("[OVERLAY] AFTER_BUILD");

    let _ = log_file.flush();

    match build_result {
        Ok(w) => {
            log!("[OVERLAY] BUILD_SUCCESS label={} visible={}", w.label(), w.is_visible().unwrap_or(false));
            log!("[OVERLAY] ===== COMPLETE =====");
            let _ = log_file.flush();
            Ok(format!("debug-overlay-copy created: {}", w.label()))
        }
        Err(e) => {
            log!("[OVERLAY] BUILD_ERROR={}", e);
            log!("[OVERLAY] ===== FAILED =====");
            let _ = log_file.flush();
            Err(format!("build failed: {}", e))
        }
    }
}

/// Experiment: show_minimal_window_experiment but with decorations(false).
/// All other options IDENTICAL to the working minimal window.
/// Changes ONLY: decorations(false).
/// Purpose: isolate whether decorations=false causes .build() to hang.
#[tauri::command]
async fn show_minimal_decorated_false(window: tauri::Window) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write as IoWrite;
    use std::path::PathBuf;
    use tauri::Manager;
    use tauri::WebviewWindowBuilder;
    use tauri::WebviewUrl;

    let temp_dir = std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| "C:\\Temp".into());
    let log_path: PathBuf = PathBuf::from(&temp_dir).join("eduos-native-overlay.log");

    let mut log_file = File::create(&log_path)
        .map_err(|e| format!("failed to create log {}: {}", log_path.display(), e))?;

    macro_rules! log {
        ($($tt:tt)*) => { {
            let line = format!($($tt)*);
            let _ = log_file.write_all(line.as_bytes());
            let _ = log_file.write_all(b"\n");
        } };
    }

    log!("");
    log!("[DECO-FALSE] ===== MINIMAL DECORATED=FALSE EXPERIMENT =====");
    log!("[DECO-FALSE] log_file={}", log_path.display());
    log!("[DECO-FALSE] COMMAND_ENTERED");
    log!("[DECO-FALSE] CALLING_WINDOW_LABEL={}", window.label());
    let app = window.app_handle();
    log!("[DECO-FALSE] APP_HANDLE_ACQUIRED");

    log!("[DECO-FALSE] BEFORE_BUILDER");

    let app_owned = app.clone();
    let builder = WebviewWindowBuilder::new(
        &app_owned,
        "minimal-decorated-false",
        WebviewUrl::App("src/minimal-window.html".into()),
    )
    .title("MINIMAL NO DECORATIONS")
    .inner_size(400.0, 300.0)
    .visible(true)
    .decorations(false)
    .transparent(false)
    .always_on_top(false)
    .skip_taskbar(false);

    log!("[DECO-FALSE] BEFORE_BUILD");

    let build_result = builder.build();

    log!("[DECO-FALSE] AFTER_BUILD");

    let _ = log_file.flush();

    match build_result {
        Ok(w) => {
            log!("[DECO-FALSE] BUILD_SUCCESS label={} visible={}", w.label(), w.is_visible().unwrap_or(false));
            log!("[DECO-FALSE] ===== COMPLETE =====");
            let _ = log_file.flush();
            Ok(format!("minimal-decorated-false created: {}", w.label()))
        }
        Err(e) => {
            log!("[DECO-FALSE] BUILD_ERROR={}", e);
            log!("[DECO-FALSE] ===== FAILED =====");
            let _ = log_file.flush();
            Err(format!("build failed: {}", e))
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORENSIC INPUT / HIT-TEST AUDIT
// Diagnoses whether an invisible overlay HWND is intercepting input
// ═══════════════════════════════════════════════════════════════════════════════

/// Command: Forensic input/hit-test audit.
/// Inspects all relevant HWNDs to determine which one receives input
/// at key screen coordinates (address bar, menu button, browser center).
/// Writes ALL output to %TEMP%\eduos-input-debug.log for external inspection.
#[tauri::command]
fn forensic_input_diagnostic(app: tauri::AppHandle) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write as IoWrite;
    use std::path::PathBuf;
    use std::time::SystemTime;
    use windows::Win32::Foundation::{HWND as RawHWND, POINT, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindow, GetClassNameW, GetWindowRect, GetWindowLongW,
        IsWindowVisible, WindowFromPoint,
        GWL_STYLE, GWL_EXSTYLE, GW_CHILD,
    };

    // ── Open output file ──────────────────────────────────────────────────────────
    let temp_dir = std::env::var("TEMP")
        .or_else(|_| std::env::var("TMP"))
        .unwrap_or_else(|_| "C:\\Temp".into());
    let out_path: PathBuf = PathBuf::from(&temp_dir).join("eduos-input-debug.log");
    let timestamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "unknown".into());

    let mut file = File::create(&out_path)
        .map_err(|e| format!("failed to create {}: {}", out_path.display(), e))?;

    macro_rules! write_diag {
        ($($tt:tt)*) => { {
            let line = format!($($tt)*);
            file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
            file.write_all(b"\n").map_err(|e| e.to_string())?;
        } };
    }

    // ── Helpers (pure, no capture) ───────────────────────────────────────────────
    fn class_of(h: RawHWND) -> String {
        if h.0.is_null() { return "(null)".to_string(); }
        let mut buf = [0u16; 128];
        let len = unsafe { GetClassNameW(h, &mut buf) };
        if len > 0 { String::from_utf16_lossy(&buf[..len as usize]) } else { "?".to_string() }
    }

    fn rect_of(h: RawHWND) -> Option<RECT> {
        if h.0.is_null() { return None; }
        let mut r = RECT::default();
        if unsafe { GetWindowRect(h, &mut r) }.is_ok() { Some(r) } else { None }
    }

    fn rect_str(r: &RECT) -> String {
        format!("({},{} {},{})", r.left, r.top, r.right, r.bottom)
    }

    // ── Header ─────────────────────────────────────────────────────────────────
    write_diag!("");
    write_diag!("[INPUT-DIAG] ===== DIAGNOSTIC START =====");
    write_diag!("[INPUT-DIAG] timestamp={}", timestamp);
    write_diag!("[INPUT-DIAG] output_file={}", out_path.display());
    write_diag!("");

    // ── 1. Foreground window ────────────────────────────────────────────────────
    write_diag!("[INPUT-DIAG] ── FOREGROUND ──");
    let fgw = unsafe { GetForegroundWindow() };
    let fgw_raw = fgw.0 as isize;
    let fgw_cls = class_of(fgw);
    let fgw_vis = if fgw.0.is_null() { false } else { unsafe { IsWindowVisible(fgw) }.as_bool() };
    write_diag!("[INPUT-DIAG] HWND=0x{:X}", fgw_raw);
    write_diag!("[INPUT-DIAG] class=\"{}\"", fgw_cls);
    write_diag!("[INPUT-DIAG] visible={}", fgw_vis);
    if !fgw.0.is_null() {
        if let Some(r) = rect_of(fgw) {
            write_diag!("[INPUT-DIAG] GetWindowRect={}", rect_str(&r));
        }
    }

    // ── 2. Main window ──────────────────────────────────────────────────────────
    write_diag!("");
    write_diag!("[INPUT-DIAG] ── MAIN ──");
    let main_window = app.get_webview_window("main");
    let (main_hwnd, main_rect) = match &main_window {
        Some(w) => {
            let h = match w.hwnd() {
                Ok(h) => RawHWND(h.0),
                Err(_) => RawHWND(std::ptr::null_mut()),
            };
            let r = rect_of(h);
            let cls = class_of(h);
            let vis = if h.0.is_null() { false } else { unsafe { IsWindowVisible(h) }.as_bool() };
            let style = if h.0.is_null() { 0 } else { unsafe { GetWindowLongW(h, GWL_STYLE) } };
            let exstyle = if h.0.is_null() { 0 } else { unsafe { GetWindowLongW(h, GWL_EXSTYLE) } };
            let vis_api = w.is_visible().unwrap_or(false);
            write_diag!("[INPUT-DIAG] HWND=0x{:X}", h.0 as isize);
            write_diag!("[INPUT-DIAG] class=\"{}\"", cls);
            write_diag!("[INPUT-DIAG] IsWindowVisible={}", vis);
            write_diag!("[INPUT-DIAG] is_visible(WebviewWindow API)={}", vis_api);
            if let Some(rect) = &r {
                write_diag!("[INPUT-DIAG] GetWindowRect={} size={}x{}", rect_str(rect), rect.right - rect.left, rect.bottom - rect.top);
            } else {
                write_diag!("[INPUT-DIAG] GetWindowRect=N/A");
            }
            write_diag!("[INPUT-DIAG] GWL_STYLE=0x{:X}", style);
            write_diag!("[INPUT-DIAG] GWL_EXSTYLE=0x{:X}", exstyle);
            (Some(h), r)
        }
        None => {
            write_diag!("[INPUT-DIAG] HWND=(not found)");
            write_diag!("[INPUT-DIAG] *** main window NOT FOUND ***");
            (None, None)
        }
    };

    // ── 3. Overlay window ────────────────────────────────────────────────────────
    write_diag!("");
    write_diag!("[INPUT-DIAG] ── OVERLAY ──");
    let state = app.state::<OverlayWindowState>();
    let overlay_hwnd = match state.window.lock().unwrap().as_ref() {
        Some(w) => {
            let h = match w.hwnd() {
                Ok(h) => RawHWND(h.0),
                Err(_) => RawHWND(std::ptr::null_mut()),
            };
            let h_raw = h.0 as isize;
            let cls = class_of(h);
            let label = w.label().to_string();
            let is_vis_api = w.is_visible().unwrap_or(false);
            let is_vis_win32 = if h.0.is_null() { false } else { unsafe { IsWindowVisible(h) }.as_bool() };
            let style = if h.0.is_null() { 0 } else { unsafe { GetWindowLongW(h, GWL_STYLE) } };
            let exstyle = if h.0.is_null() { 0 } else { unsafe { GetWindowLongW(h, GWL_EXSTYLE) } };
            let r = rect_of(h);

            write_diag!("[INPUT-DIAG] HWND=0x{:X}", h_raw);
            write_diag!("[INPUT-DIAG] class=\"{}\"", cls);
            write_diag!("[INPUT-DIAG] label=\"{}\"", label);
            write_diag!("[INPUT-DIAG] IsWindowVisible={}", is_vis_win32);
            write_diag!("[INPUT-DIAG] is_visible(WebviewWindow API)={}", is_vis_api);
            if let Some(rect) = &r {
                write_diag!("[INPUT-DIAG] GetWindowRect={} size={}x{}", rect_str(rect), rect.right - rect.left, rect.bottom - rect.top);
            } else {
                write_diag!("[INPUT-DIAG] GetWindowRect=N/A");
            }
            write_diag!("[INPUT-DIAG] GWL_STYLE=0x{:X}", style);
            write_diag!("[INPUT-DIAG] GWL_EXSTYLE=0x{:X}", exstyle);

            // Flag breakdown
            let ws_visible     = (style as u32) & 0x10000000u32;
            let ws_disabled    = (style as u32) & 0x08000000u32;
            let ws_ex_trans    = (exstyle as u32) & 0x00000020u32;
            let ws_ex_noact    = (exstyle as u32) & 0x08000000u32;
            let ws_ex_layered  = (exstyle as u32) & 0x00080000u32;
            write_diag!("[INPUT-DIAG] WS_VISIBLE        =0x{:X} ({})", ws_visible,   if ws_visible   != 0 { "SET" } else { "NOT SET" });
            write_diag!("[INPUT-DIAG] WS_DISABLED       =0x{:X} ({})", ws_disabled,  if ws_disabled  != 0 { "SET" } else { "NOT SET" });
            write_diag!("[INPUT-DIAG] WS_EX_TRANSPARENT =0x{:X} ({})", ws_ex_trans, if ws_ex_trans  != 0 { "SET" } else { "NOT SET" });
            write_diag!("[INPUT-DIAG] WS_EX_NOACTIVATE  =0x{:X} ({})", ws_ex_noact, if ws_ex_noact  != 0 { "SET" } else { "NOT SET" });
            write_diag!("[INPUT-DIAG] WS_EX_LAYERED     =0x{:X} ({})", ws_ex_layered, if ws_ex_layered != 0 { "SET" } else { "NOT SET" });

            // First child
            let child = unsafe { GetWindow(h, GW_CHILD) };
            let child_raw = child.as_ref().map(|p| p.0 as isize).unwrap_or(0);
            let child_cls = child.as_ref().map(|p| class_of(*p)).unwrap_or_else(|_| "none".to_string());
            write_diag!("[INPUT-DIAG] first child HWND=0x{:X} class=\"{}\"", child_raw, child_cls);

            h
        }
        None => {
            write_diag!("[INPUT-DIAG] HWND=(not created)");
            write_diag!("[INPUT-DIAG] *** OVERLAY NOT CREATED YET ***");
            RawHWND(std::ptr::null_mut())
        }
    };

    // ── 4. WindowFromPoint at key positions ─────────────────────────────────────
    write_diag!("");
    write_diag!("[INPUT-DIAG] ── WINDOWFROMPOINT AT KEY POSITIONS ──");

    let mr = match main_rect {
        Some(r) => r,
        None => {
            write_diag!("[INPUT-DIAG] *** Cannot test points: main rect unknown ***");
            write_diag!("[INPUT-DIAG] ===== DIAGNOSTIC COMPLETE =====");
            file.flush().map_err(|e| e.to_string())?;
            return Ok(format!("written to {}", out_path.display()));
        }
    };

    // NavBar height = 48 logical = 60 physical at scale 1.25
    let nav_h: i32 = 60;
    let search_x = (mr.left + mr.right) / 2;
    let search_y = mr.top + nav_h / 2;
    let menu_x = mr.left + 100;
    let menu_y = mr.top + nav_h / 2;
    let center_x = (mr.left + mr.right) / 2;
    let center_y = mr.top + 300;

    let points = [
        ("SEARCH_BAR_CENTER", search_x, search_y),
        ("MENU_BUTTON",       menu_x,   menu_y),
        ("BROWSER_CENTER",    center_x, center_y),
    ];

    for (name, x, y) in points {
        let pt = POINT { x, y };
        let wf = unsafe { WindowFromPoint(pt) };
        let wf_raw = wf.0 as isize;
        let wf_cls = class_of(wf);
        let wf_vis = if wf.0.is_null() { false } else { unsafe { IsWindowVisible(wf) }.as_bool() };
        write_diag!("");
        write_diag!("[INPUT-DIAG] POINT {}:", name);
        write_diag!("[INPUT-DIAG]   screen=({},{})", x, y);
        write_diag!("[INPUT-DIAG]   HWND=0x{:X}", wf_raw);
        write_diag!("[INPUT-DIAG]   class=\"{}\"", wf_cls);
        write_diag!("[INPUT-DIAG]   visible={}", wf_vis);

        if !overlay_hwnd.0.is_null() && wf == overlay_hwnd {
            write_diag!("[INPUT-DIAG]   *** OVERLAY RECEIVES THIS POINT ***");
        } else if !overlay_hwnd.0.is_null() {
            if let Some(or) = rect_of(overlay_hwnd) {
                if x >= or.left && x <= or.right && y >= or.top && y <= or.bottom {
                    write_diag!("[INPUT-DIAG]   *** POINT INSIDE OVERLAY RECT but DIFFERENT HWND returned ***");
                }
            }
        }
    }

    // ── 5. Summary ──────────────────────────────────────────────────────────────
    write_diag!("");
    write_diag!("[INPUT-DIAG] ── SUMMARY ──");
    write_diag!("[INPUT-DIAG] main window rect={}", rect_str(&mr));
    if !overlay_hwnd.0.is_null() {
        if let Some(or) = rect_of(overlay_hwnd) {
            write_diag!("[INPUT-DIAG] overlay rect={} size={}x{}", rect_str(&or), or.right - or.left, or.bottom - or.top);
            write_diag!("[INPUT-DIAG] overlay.y=[{},{}] vs main.y=[{},{}]", or.top, or.bottom, mr.top, mr.bottom);
            if or.top <= mr.bottom && or.bottom >= mr.top {
                write_diag!("[INPUT-DIAG] *** OVERLAY VERTICALLY OVERLAPS MAIN WINDOW ***");
            }
        }
        if unsafe { IsWindowVisible(overlay_hwnd) }.as_bool() {
            write_diag!("[INPUT-DIAG] *** OVERLAY IS VISIBLE (WS_VISIBLE flag set) ***");
        }
    }

    write_diag!("");
    write_diag!("[INPUT-DIAG] ===== DIAGNOSTIC COMPLETE =====");

    file.flush().map_err(|e| e.to_string())?;
    Ok(format!("written to {}", out_path.display()))
}

fn main() {

    setup_panic_handler();

    use std::time::SystemTime;
    let program_start = SystemTime::now();
    let program_start_instant = std::time::Instant::now();

    let args: Vec<String> = std::env::args().collect();

    let benchmark_mode = args.get(1).map(|s| s.as_str()) == Some("--benchmark");
    let test_region_mode = args.get(1).map(|s| s.as_str()) == Some("--test-rgn");
    BENCHMARK_MODE.store(benchmark_mode, std::sync::atomic::Ordering::SeqCst);

    log::info!("Starting EduOS Browser v{} - Research Edition", env!("CARGO_PKG_VERSION"));
    log::info!("Research: Observable behavior tracking for knowledge work analysis");
    log::info!("Storage = Raw observations. Labels = Derived (analysis layer).");
    if benchmark_mode {
        log::info!("BENCHMARK MODE: Harness will auto-start on frontend mount");
    }
    if test_region_mode {
        log::info!("TEST MODE: Region exclusion diagnostic will auto-run after WebView creation");
    }

    
    let tab_manager = TabManager::default();
    let default_tab = TabData {
        id: "default".to_string(),
        history_index: 0,
        created_at: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
        last_accessed: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
    };
    {
        let mut tm = tab_manager.tabs.lock().unwrap();
        tm.insert("default".to_string(), default_tab);
        let mut history = tab_manager.history.lock().unwrap();
        history.push(HOMEPAGE.to_string());
    }

    
    let builder_start_instant = std::time::Instant::now();

    // Initialize forensic diagnostic log: writes to %TEMP%\eduos-browser-hwnd-diagnostic.log
    forensic::init_log();
    forensic::log_app_info();
    forensic::section("APP_STARTUP");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(Mutex::new(MemoryTracker::default()))
        .manage(Mutex::new(SequenceTracker::default()))
        .manage(WebViewLifecycle::default())
        .manage(BrowserWebview::default())
        .manage(LifecycleEventStore::default())
        .manage(Mutex::new(tab_manager))
        .manage(Mutex::new(SessionManager::default()))
        .manage(SessionData {
            sessions: Mutex::new(HashMap::new()),
            insertion_order: Mutex::new(Vec::new()),
        })
        .manage(CachedSystem::new())
        .manage(Mutex::new(StartupProfiler::new()))
        .manage(BrowserOverlayState::default())
        .manage(OverlayWindowState::default())
        .manage(DebugOverlayState::default())
        .invoke_handler(tauri::generate_handler![
            
            minimize_window,
            toggle_maximize,
            close_window,
            get_app_version,
            is_benchmark_mode,
            exit_app,
            test_command,
            test_long_command,
            test_benchmark_quick,
            
            get_webview_state,
            ensure_webview_active,
            destroy_webview,
            set_idle_threshold,
            record_activity,
            record_navigation,
            
            suspend_tab,
            evict_tab,
            restore_tab,
            get_tab_lifecycle,
            
            navigate_browser,
            reload_browser,
            back_browser,
            forward_browser,
            
            create_tab,
            switch_tab,
            close_tab,
            get_tab_snapshots,
            
            get_memory_snapshot,
            get_memory_history,
            #[cfg(windows)]
            get_webview2_process_snapshot,  
            
            get_navigation_events,
            get_domain_sequence,
            analyze_patterns,
            
            start_research_session,
            get_current_session,
            export_research_data,
            get_literature_notes,
            get_research_questions,
            
            save_session_data,
            load_session_data,
            clear_session_data,
            save_benchmark_results,
            
            start_benchmark_run,
            end_benchmark_run,
            get_lifecycle_events,
            get_lifecycle_event_stats,
            clear_lifecycle_events,
            run_benchmark_workload,

            #[cfg(target_os = "windows")]
            set_browser_overlay_exclusions,
            #[cfg(target_os = "windows")]
            clear_browser_overlay_exclusions,
            #[cfg(target_os = "windows")]
            diagnose_browser_exclusion,
            #[cfg(target_os = "windows")]
            restore_browser_full_region,

            #[cfg(target_os = "windows")]
            dump_paint_hierarchy,
            #[cfg(target_os = "windows")]
            run_zorder_tests,
            #[cfg(target_os = "windows")]
            diagnose_browser_geometry,
            #[cfg(target_os = "windows")]
            experiment_browser_nonoverlap,

            // Native overlay window commands
            #[cfg(target_os = "windows")]
            show_native_overlay,
            #[cfg(target_os = "windows")]
            hide_native_overlay,
            #[cfg(target_os = "windows")]
            is_native_overlay_visible,
            #[cfg(target_os = "windows")]
            overlay_bookmark_toggle,
            #[cfg(target_os = "windows")]
            overlay_navigate,
            #[cfg(target_os = "windows")]
            forensic_input_diagnostic,
            #[cfg(target_os = "windows")]
            show_debug_overlay,
            #[cfg(target_os = "windows")]
            show_minimal_decorated_false,
            #[cfg(target_os = "windows")]
            show_minimal_window_experiment,
            #[cfg(target_os = "windows")]
            show_minimal_topmost,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            // Clone again for the test_region_mode thread (handle is moved into on_window_event).
            let handle_for_test = if test_region_mode { Some(handle.clone()) } else { None };

            
            let profiler = app.state::<Mutex<StartupProfiler>>();
            let mut p = profiler.lock().unwrap();

            
            let pre_builder_ms = builder_start_instant.elapsed().as_millis() as u64;
            let total_elapsed = program_start_instant.elapsed().as_millis() as u64;
            log::info!("[STARTUP] TOTAL ELAPSED at setup(): {}ms", total_elapsed);
            log::info!("[STARTUP]   pre_builder_chain: {}ms", pre_builder_ms);
            log::info!("[STARTUP]   setup_entry_delay: {}ms", total_elapsed - pre_builder_ms);

            p.phase_start("setup_tauri_complete");

            
            p.phase_start("window_builder_create");
            let main_window = WebviewWindowBuilder::new(
                &handle,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("EduOS Browser")
            .inner_size(1280.0, 800.0)
            .min_inner_size(960.0, 600.0)
            .center()
            .resizable(true)
            .decorations(false)
            .visible(true)
            .focused(true);
            p.phase_end("window_builder_create", Some("builder created"));

            p.phase_start("window_build");
            let main_window = match main_window.build() {
                Ok(w) => {
                    p.phase_end("window_build", Some("built successfully"));
                    w
                }
                Err(e) => {
                    p.phase_end("window_build", Some(&format!("FAILED: {}", e)));
                    panic!("Failed to create main window: {}", e);
                }
            };

            disable_main_window_rounded_corners(&main_window);
            disable_main_window_rounded_corners(&main_window);

            // Clone for the focus event handler which needs to call ensure_react_ui_above_browser.
            let main_window_for_zorder = main_window.clone();

            p.phase_start("window_event_listeners");

            main_window.on_window_event(move |event| match event {
                // On close: close browser child webview before main window closes.
                tauri::WindowEvent::CloseRequested { .. } => {
                    let browser_state = handle.state::<BrowserWebview>();
                    if let Some(wv) = browser_state.webview.lock().unwrap().take() {
                        let _ = wv.close();
                    };
                }
                // On main window gaining focus: ensure React UI stays above browser.
                tauri::WindowEvent::Focused(true) => {
                    ensure_react_ui_above_browser(&main_window_for_zorder.as_ref().window());
                }
                _ => {}
            });
            p.phase_end("window_event_listeners", None);

            p.phase_end("setup_complete", Some("EduOS Browser ready, WebView lazy"));


            let trace = p.finish();
            log::info!("[STARTUP] Setup trace: {}ms total", trace.total_ms);
            for (phase, dur) in &trace.phase_breakdown {
                log::info!("[STARTUP]   {}: {}ms", phase, dur);
            }

            log::info!("[STARTUP] NOTE: WebView is created on first navigation");
            log::info!("[STARTUP] Frontend initialization happens in browser process");

            // Auto-trigger diagnostic test sequence if --test-rgn flag was passed.
            if test_region_mode {
                log::info!("[TEST] --test-rgn flag detected: scheduling diagnostic test sequence");
                log::info!("[TEST] Run `npm run tauri dev` without --test-rgn for normal operation");
                log::info!("[TEST] With --test-rgn: browser WRY will be created and TEST A/B run automatically");
                let handle_clone = handle_for_test.unwrap();
                std::thread::spawn(move || {
                    // Wait for the React WebView frontend to fully initialize (navigates to load itself).
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    log::info!("[TEST] Creating browser WRY via ensure_webview_active...");
                    // Create the browser WRY by calling ensure_webview_active.
                    let app_handle = &handle_clone;
                    use tauri::WebviewWindow;
                    use windows::Win32::Foundation::HWND as RawHWND2;
                    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
                    use windows::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn, HRGN};

                    #[link(name = "gdi32")]
                    extern "system" {
                        fn CombineRgn(
                            hrgnDest: HRGN,
                            hrgnSrc1: HRGN,
                            hrgnSrc2: HRGN,
                            iMode: i32,
                        ) -> i32;
                    }
                    const RGN_DIFF: i32 = 4;

                    let result = {
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        rt.block_on(ensure_webview_active(handle_clone.clone()))
                    };
                    match result {
                        Ok(_) => {
                            log::info!("[TEST] Browser WRY created, running diagnostic sequence...");
                            std::thread::sleep(std::time::Duration::from_secs(1));

                            // Now run the diagnostic: find browser WRY and apply TEST A/B.
                            if let Some(main_win) = handle_clone.get_window("main") {
                                if let Ok(main_hwnd_raw) = main_win.hwnd() {
                                    let main_hwnd = RawHWND2(main_hwnd_raw.0);
                                    if let Some(browser_wry) = find_browser_wry_by_geometry(main_hwnd) {
                                        let mut br = windows::Win32::Foundation::RECT::default();
                                        unsafe { let _ = GetWindowRect(browser_wry, &mut br); };
                                        let bw = (br.right - br.left).max(1);
                                        let bh = (br.bottom - br.top).max(1);

                                        log::info!("[TEST_A] Applying FULL exclusion: browser_wry=0x{:X} size={}x{}",
                                            browser_wry.0 as isize, bw, bh);

                                        // Create full region and subtract full region = empty region
                                        let full_r = unsafe { CreateRectRgn(0, 0, bw, bh) };
                                        let empty_r = unsafe { CreateRectRgn(0, 0, 0, 0) };
                                        let _ = unsafe { CombineRgn(empty_r, full_r, full_r, RGN_DIFF) };
                                        let applied = unsafe { SetWindowRgn(browser_wry, Some(empty_r), true) };
                                        log::info!("[TEST_A] SetWindowRgn(empty) result={} (1=ok)",
                                            applied != 0);
                                        log::info!("[TEST_A] EXPECTED: Entire browser area should now be BLANK/transparent");

                                        std::thread::sleep(std::time::Duration::from_secs(4));

                                        // Restore full region
                                        log::info!("[TEST_A] Restoring full browser region");
                                        let full_r = unsafe { CreateRectRgn(0, 0, bw, bh) };
                                        if !full_r.is_invalid() {
                                            let applied = unsafe { SetWindowRgn(browser_wry, Some(full_r), true) };
                                            log::info!("[TEST_A] Full region restored: SetWindowRgn result={}",
                                                applied != 0);
                                            log::info!("[TEST_A] EXPECTED: Browser should now show content normally");
                                        }

                                        std::thread::sleep(std::time::Duration::from_secs(2));

                                        // TEST B: upper-left quarter exclusion
                                        let hw = bw / 2;
                                        let hh = bh / 2;
                                        log::info!("[TEST_B] Applying UPPER-LEFT QUARTER exclusion: (0,0 {}x{})", hw, hh);
                                        let full_r = unsafe { CreateRectRgn(0, 0, bw, bh) };
                                        let ul = unsafe { CreateRectRgn(0, 0, hw, hh) };
                                        let _ = unsafe { CombineRgn(full_r, full_r, ul, RGN_DIFF) };
                                        let applied = unsafe { SetWindowRgn(browser_wry, Some(full_r), true) };
                                        log::info!("[TEST_B] SetWindowRgn(quarter) result={}", applied != 0);
                                        log::info!("[TEST_B] EXPECTED: Lower-RIGHT quarter visible, upper-left transparent");

                                        std::thread::sleep(std::time::Duration::from_secs(4));

                                        // Restore full region
                                        log::info!("[TEST_B] Restoring full browser region");
                                        let full_r = unsafe { CreateRectRgn(0, 0, bw, bh) };
                                        if !full_r.is_invalid() {
                                            let applied = unsafe { SetWindowRgn(browser_wry, Some(full_r), true) };
                                            log::info!("[TEST_B] Full region restored: SetWindowRgn result={}",
                                                applied != 0);
                                        }

                                        log::info!("[TEST] Diagnostic test sequence complete.");
                                    } else {
                                        log::info!("[TEST] ERROR: Browser WRY not found by geometry");
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            log::info!("[TEST] ERROR: ensure_webview_active failed: {}", e);
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EduOS Browser");
}
