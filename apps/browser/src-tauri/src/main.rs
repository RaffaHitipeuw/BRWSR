// EduOS Browser - Backend with Research Features
//
// Architecture: Single WebView with Virtual Tab Navigation
//
// Research Focus: Observable behavior tracking for knowledge work analysis
//
// STORAGE LAYER (Raw Observations Only):
// - Navigation events: timestamp, url, domain, action, tab_id, duration
// - Memory snapshots: RSS, working_set, commit, virtual_size (Windows metrics)
// - Window focus events: timestamp, focused_app, duration
//
// ANALYSIS LAYER (Inference - NOT stored):
// - "Context" labels are derived, not stored
// - Domain sequences are patterns, not entities
// - Research questions are hypotheses to test, not conclusions
//
// Research Questions (Proposed):
// RQ1: How do users organize information during prolonged knowledge work?
// RQ2: Can URL sequence patterns reveal latent cognitive units?
// RQ3: Does memory pressure affect navigation behavior?
//
// IMPORTANT: This is exploratory research infrastructure.
// We collect data to TEST hypotheses, not to prove conclusions.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

// ─── Constants ────────────────────────────────────────────────────────────────

const UI_HEIGHT: f64 = 88.0;
const HOMEPAGE: &str = "https://www.google.com";
const EDGE_INSET_LEFT: f64 = 8.0;
const EDGE_INSET_RIGHT: f64 = -7.0;

// Research constants - these are HYPOTHESES to test, not facts
const TEMPORAL_GAP_THRESHOLD_MS: u64 = 300_000; // 5 min gap = potential boundary marker
const MIN_SEQUENCE_SIZE: usize = 2; // Minimum events to form a sequence

// ─── Geometry ────────────────────────────────────────────────────────────────

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
        width: (main_size.width as i32 + left_inset_px + right_inset_px).max(0) as u32,
        height: (main_size.height as i32 - ui_height_px).max(0) as u32,
    }
}

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

// ─── Types ──────────────────────────────────────────────────────────────────

// REAL memory snapshot using sysinfo
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct MemorySnapshot {
    pub timestamp: u64,
    // Process memory (via sysinfo)
    pub process_rss_mb: f64,        // Resident Set Size - actual physical memory
    pub process_virt_mb: f64,       // Virtual memory size
    // System memory
    pub total_ram_mb: f64,
    pub used_ram_mb: f64,
    pub available_ram_mb: f64,
    // Memory pressure classification
    pub pressure_level: String,      // "low" | "medium" | "high" | "critical"
    pub pressure_ratio: f64,         // available / total (0.0 - 1.0)
}

// Raw navigation event - this is what we STORE
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct NavigationEvent {
    pub timestamp: u64,              // Unix timestamp in milliseconds
    pub url: String,                 // Full URL
    pub domain: Option<String>,       // Extracted domain (null for invalid URLs)
    pub action: String,              // "navigate" | "reload" | "back" | "forward"
    pub tab_id: String,              // Tab identifier
    pub duration_ms: Option<u64>,    // Time on page (null if still on page)
    pub memory_rss_mb: Option<f64>,  // Process RSS at time of navigation
    pub memory_pressure: Option<String>, // System pressure at navigation time
}

// URL compression: Domain table for memory efficiency
#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct DomainTable {
    pub domains: Vec<String>,        // domain_id -> domain string
    pub url_entries: Vec<UrlEntry>,  // Compressed URL storage
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct UrlEntry {
    pub domain_id: u32,              // Index into domain table
    pub path_hash: u64,             // Hash of path for deduplication
    pub path_ref: Option<u32>,       // Reference to parent path (for /user/repo pattern)
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct TabSnapshot {
    pub tab_id: String,
    pub current_url: String,
    pub history_count: usize,
    pub created_at: u64,
    pub last_accessed: u64,
}

// ─── Research Analysis Types (NOT stored - derived) ──────────────────────────

// Analysis output - NOT stored in backend
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SequenceAnalysis {
    pub total_navigations: usize,
    pub unique_domains: usize,
    pub domain_sequence: Vec<String>,         // Raw sequence for analysis
    pub temporal_gaps_ms: Vec<u64>,          // Gaps between navigations
    pub gap_markers: Vec<GapMarker>,         // Potential boundary markers
    pub proposed_labels: Vec<SequenceLabel>, // Hypothetical labels (NOT facts)
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct GapMarker {
    pub before_idx: usize,
    pub after_idx: usize,
    pub gap_ms: u64,
    pub exceeds_threshold: bool,
    pub proposed_reason: Option<String>, // "temporal_gap" - NOT confirmed
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SequenceLabel {
    pub sequence_start: usize,
    pub sequence_end: usize,
    pub label: String,              // e.g., "Programming" - derived, not fact
    pub confidence: f64,            // How confident is the label?
    pub method: String,             // "domain_clustering" | "timeout_boundary" | etc
    pub evidence: Vec<String>,      // URLs supporting this label
}

// ─── Research Session ────────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ResearchSession {
    pub id: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub total_navigations: usize,
    pub gap_markers_count: usize,
    pub analysis_count: usize,  // Number of times analysis was run
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ResearchExport {
    pub session: ResearchSession,
    pub navigation_events: Vec<NavigationEvent>,  // Raw observations
    pub memory_snapshots: Vec<MemorySnapshot>,   // Raw observations
    pub literature_notes: Vec<String>,           // Theoretical grounding
    pub research_questions: Vec<String>,          // Hypotheses being tested
}

// ─── State Managers ──────────────────────────────────────────────────────────

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
    history: Mutex<Vec<String>>,
}

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

// ─── WebView Lifecycle Manager ───────────────────────────────────────────────
//
// Implements lazy WebView creation and destroy-on-idle
//
// States:
//   Uninitialized → Created → Active ↔ Idle → Destroyed
//                      ↑         ↓         ↓
//                      └─── resume ───────┘

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WebViewState {
    Uninitialized,  // WebView not created yet
    Creating,        // Currently creating
    Active,          // User actively browsing
    Idle,            // Not active, can be destroyed
    Destroyed,       // WebView released
    Restoring,       // Recreating after destroy
}

impl Default for WebViewState {
    fn default() -> Self {
        Self::Uninitialized
    }
}

struct WebViewLifecycle {
    state: Mutex<WebViewState>,
    last_activity: Mutex<Instant>,
    idle_threshold_secs: Mutex<u64>,  // Destroy after this idle time
    last_url: Mutex<Option<String>>, // URL to restore
    last_tab_id: Mutex<Option<String>>, // Last active tab
}

impl Default for WebViewLifecycle {
    fn default() -> Self {
        Self {
            state: Mutex::new(WebViewState::Uninitialized),
            last_activity: Mutex::new(Instant::now()),
            idle_threshold_secs: Mutex::new(300), // 5 minutes
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

// ─── Sequence Tracker (Research - Raw Events Only) ───────────────────────────
//
// NOTE: This tracks raw navigation events. All "context" inference happens
// in the analysis layer, not here. We store:
// - Raw navigation events with timestamps
// - Gap markers (potential boundary locations)
// - Domain sequences for analysis
//
// We do NOT store:
// - "Context" labels (derived, not observed)
// - Confidence scores (interpretation, not fact)
// - Intent or purpose (latent variables)

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
        // Track domain sequence
        if let Some(ref domain) = event.domain {
            self.domain_sequence.push(domain.clone());
        }

        // Detect gap markers
        if let Some(last_time) = self.last_navigation_time {
            let gap_ms = last_time.elapsed().as_millis() as u64;
            if gap_ms >= TEMPORAL_GAP_THRESHOLD_MS && self.events.len() >= MIN_SEQUENCE_SIZE {
                // Potential boundary marker - but this is just a marker, NOT a confirmed boundary
                let marker = GapMarker {
                    before_idx: self.events.len() - 1,
                    after_idx: self.events.len(),
                    gap_ms,
                    exceeds_threshold: true,
                    proposed_reason: Some("temporal_gap".to_string()), // PROPOSED, not confirmed
                };
                self.gap_markers.push(marker);
            }
        }

        self.last_navigation_time = Some(Instant::now());
        self.events.push(event);
    }

    fn analyze_sequence(&self) -> SequenceAnalysis {
        let total_navigations = self.events.len();
        let unique_domains: usize = self.events.iter()
            .filter_map(|e| e.domain.clone())
            .collect::<std::collections::HashSet<_>>()
            .len();

        // Calculate temporal gaps
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
            proposed_labels: Vec::new(), // Labels are derived in analysis layer
        }
    }
}

fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    format!("{:x}{:x}", now.as_secs(), now.subsec_nanos())
}

// ─── Session Manager ────────────────────────────────────────────────────────

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
                // Theoretical Foundations
                "Activity Theory: Leontiev (1978) - Activity/Action/Operation hierarchy".to_string(),
                "Situated Cognition: Brown, Collins, Duguid (1989) - Knowledge is context-dependent".to_string(),
                "Distributed Cognition: Hutchins (1995) - Cognition spreads across tools".to_string(),
                "Cognitive Load Theory: Sweller (1988) - Working memory limits".to_string(),
                // Key Distinctions
                "NOTE: We observe URL sequences; Activity Theory focuses on goal-directed actions".to_string(),
                "NOTE: 'Context' labels are derived (latent variable), not observed".to_string(),
                "NOTE: Navigation events are observable; meaning is inferred".to_string(),
                // Research Approach
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

// ─── Commands: Window Control ─────────────────────────────────────────────────

#[tauri::command]
fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("Window not found")?;
    main.minimize().map_err(|e| e.to_string())?;
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
    // End research session
    let session_mgr = app.state::<Mutex<SessionManager>>();
    if let Ok(mut session) = session_mgr.lock() {
        if let Some(ref mut s) = session.current_session {
            s.ended_at = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());
        }
    }

    // Destroy WebView (release memory)
    let lifecycle = app.state::<WebViewLifecycle>();
    lifecycle.set_destroyed();

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

// ─── Commands: Navigation ─────────────────────────────────────────────────────

#[tauri::command]
async fn navigate_browser(
    app: tauri::AppHandle,
    url: String,
    #[allow(non_snake_case)]
    tabId: String,
    #[allow(non_snake_case)]
    navigationType: String,
) -> Result<(), String> {
    // Check if WebView exists, if not create it (lazy creation)
    let lifecycle = app.state::<WebViewLifecycle>();
    let needs_creation = lifecycle.get_state() == WebViewState::Uninitialized
        || lifecycle.get_state() == WebViewState::Destroyed;

    if needs_creation {
        // Create WebView first
        let handle = app.app_handle().clone();
        let main_window = app.get_webview_window("main")
            .ok_or("Main window not found")?;

        let main_pos = main_window.inner_position().unwrap_or_default();
        let main_size = main_window.inner_size().unwrap_or(tauri::PhysicalSize { width: 1280, height: 800 });
        let scale = main_window.scale_factor().unwrap_or(1.0);
        let geo = compute_browser_geometry(main_pos, main_size, scale);

        let logical_x = geo.x as f64 / scale;
        let logical_y = geo.y as f64 / scale;
        let logical_width = geo.width as f64 / scale;
        let logical_height = geo.height as f64 / scale;

        let webview_url: WebviewUrl = match url::Url::parse(&url) {
            Ok(u) => WebviewUrl::External(u),
            Err(_) => WebviewUrl::App("about:blank".into()),
        };

        match WebviewWindowBuilder::new(&handle, "browser", webview_url)
            .title("EduOS Browser")
            .position(logical_x, logical_y)
            .inner_size(logical_width, logical_height)
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .visible(true)
            .focused(true)
            .parent(&main_window)
        {
            Ok(builder) => match builder.build() {
                Ok(_) => {
                    lifecycle.mark_active();
                    log::info!("WebView created on first navigation: {}", url);
                }
                Err(e) => return Err(format!("Failed to create WebView: {}", e)),
            },
            Err(e) => return Err(format!("Failed to create WebView: {}", e)),
        }
    } else {
        lifecycle.mark_active();
    }

    // Track navigation in lifecycle
    lifecycle.record_navigation_sync(&url, &tabId);

    // Now navigate
    let window = app.get_webview_window("browser").ok_or("Browser not found")?;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    // Extract domain
    let domain = SequenceTracker::extract_domain(&url);

    // Get current memory snapshot for this event
    let mem_tracker = app.state::<Mutex<MemoryTracker>>();
    let (rss, pressure) = {
        let m = mem_tracker.lock().unwrap();
        // Get latest snapshot
        let last = m.snapshots.last();
        (
            last.map(|s| s.process_rss_mb),
            last.map(|s| s.pressure_level.clone()),
        )
    };

    // Create raw navigation event
    let event = NavigationEvent {
        timestamp: now_ms,
        url: url.clone(),
        domain: domain.clone(),
        action: navigationType.clone(),
        tab_id: tabId.clone(),
        duration_ms: None, // Will be set on next navigation
        memory_rss_mb: rss,
        memory_pressure: pressure,
    };

    // Track in sequence tracker
    let seq_tracker = app.state::<Mutex<SequenceTracker>>();
    {
        let mut st = seq_tracker.lock().unwrap();
        st.add_event(event);
    }

    // Update session navigation count
    let session_mgr = app.state::<Mutex<SessionManager>>();
    if let Ok(mut session) = session_mgr.lock() {
        if let Some(ref mut s) = session.current_session {
            s.total_navigations += 1;
        }
    }

    // Update tab history
    let tab_manager = app.state::<Mutex<TabManager>>();
    {
        let mut tm = tab_manager.lock().unwrap();
        let mut tabs = tm.tabs.lock().unwrap();
        let mut history = tm.history.lock().unwrap();

        if let Some(tab) = tabs.get(&tabId) {
            let idx = tab.history_index;
            let new_len = (idx + 1).min(history.len());
            history.truncate(new_len);
        }
        history.push(url.clone());
    }

    // Actually navigate
    let encoded = serde_json::to_string(&url).map_err(|e| e.to_string())?;
    let script = format!("window.location.href = {}", encoded);
    window.eval(&script).map_err(|e| e.to_string())
}

#[tauri::command]
async fn reload_browser(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("browser").ok_or("Browser not found")?;
    window.eval("window.location.reload()").map_err(|e| e.to_string())
}

#[tauri::command]
async fn back_browser(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("browser").ok_or("Browser not found")?;
    window.eval("window.history.back()").map_err(|e| e.to_string())
}

#[tauri::command]
async fn forward_browser(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("browser").ok_or("Browser not found")?;
    window.eval("window.history.forward()").map_err(|e| e.to_string())
}

// ─── Commands: WebView Lifecycle ─────────────────────────────────────────────
//
// Implements lazy creation and destroy-on-idle
// Reduces memory when browser not in use

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
        // Already have WebView, just activate
        lifecycle.mark_active();
        return Ok(false); // Was already active
    }

    // Need to create/restore WebView
    lifecycle.set_restoring();

    // Get last URL or use homepage
    let url_to_load = {
        let last_url = lifecycle.last_url.lock().unwrap();
        let last_tab = lifecycle.last_tab_id.lock().unwrap();

        // Get current tab's URL
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

    // Create WebView
    let handle = app.app_handle().clone();
    let main_window = app.get_webview_window("main")
        .ok_or("Main window not found")?;

    let main_pos = main_window.inner_position().unwrap_or_default();
    let main_size = main_window.inner_size().unwrap_or(tauri::PhysicalSize { width: 1280, height: 800 });
    let scale = main_window.scale_factor().unwrap_or(1.0);
    let geo = compute_browser_geometry(main_pos, main_size, scale);

    let logical_x = geo.x as f64 / scale;
    let logical_y = geo.y as f64 / scale;
    let logical_width = geo.width as f64 / scale;
    let logical_height = geo.height as f64 / scale;

    let webview_url: WebviewUrl = match url::Url::parse(&url_to_load) {
        Ok(u) => WebviewUrl::External(u),
        Err(_) => WebviewUrl::App("about:blank".into()),
    };

    match WebviewWindowBuilder::new(&handle, "browser", webview_url)
        .title("EduOS Browser")
        .position(logical_x, logical_y)
        .inner_size(logical_width, logical_height)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .visible(true)
        .focused(true)
        .parent(&main_window)
    {
        Ok(builder) => match builder.build() {
            Ok(_) => {
                lifecycle.mark_active();
                log::info!("WebView restored: {}", url_to_load);
                Ok(true) // Newly created
            }
            Err(e) => {
                log::error!("Failed to restore WebView: {}", e);
                Err(format!("Failed to restore WebView: {}", e))
            }
        },
        Err(e) => {
            log::error!("Failed to create WebView builder: {}", e);
            Err(format!("Failed to create WebView: {}", e))
        }
    }
}

#[tauri::command]
async fn destroy_webview(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let lifecycle = app.state::<WebViewLifecycle>();
    let current_state = lifecycle.get_state();

    if current_state == WebViewState::Uninitialized || current_state == WebViewState::Destroyed {
        return Ok(None);
    }

    // Get last URL before destroying
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

    // Close browser window
    if let Some(browser) = app.get_webview_window("browser") {
        let _ = browser.close();
    }

    lifecycle.set_destroyed();
    log::info!("WebView destroyed");

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

// ─── Commands: Tab Management ─────────────────────────────────────────────────

#[tauri::command]
fn create_tab(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<TabSnapshot, String> {
    let tab_manager = app.state::<Mutex<TabManager>>();
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();

    let mut tm = tab_manager.lock().unwrap();
    let mut tabs = tm.tabs.lock().unwrap();
    let mut history = tm.history.lock().unwrap();

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
        tab_id: tabId,
        current_url: history.last().cloned().unwrap_or_default(),
        history_count: history.len(),
        created_at: now,
        last_accessed: now,
    })
}

#[tauri::command]
fn switch_tab(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<String, String> {
    let tab_manager = app.state::<Mutex<TabManager>>();
    let tm = tab_manager.lock().unwrap();
    let tabs = tm.tabs.lock().unwrap();
    let history = tm.history.lock().unwrap();

    let tab = tabs.get(&tabId).ok_or("Tab not found")?;
    let url = history.get(tab.history_index).cloned().ok_or("History index out of bounds")?;

    Ok(url)
}

#[tauri::command]
fn close_tab(app: tauri::AppHandle, #[allow(non_snake_case)] tabId: String) -> Result<(), String> {
    let tab_manager = app.state::<Mutex<TabManager>>();
    let mut tm = tab_manager.lock().unwrap();
    let mut tabs = tm.tabs.lock().unwrap();
    tabs.remove(&tabId);
    Ok(())
}

#[tauri::command]
fn get_tab_snapshots(app: tauri::AppHandle) -> Result<Vec<TabSnapshot>, String> {
    let tab_manager = app.state::<Mutex<TabManager>>();
    let tm = tab_manager.lock().unwrap();
    let tabs = tm.tabs.lock().unwrap();
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

// ─── Commands: Memory Tracking ────────────────────────────────────────────────

// ─── Commands: Memory Tracking (Real) ─────────────────────────────────────────

#[tauri::command]
fn get_memory_snapshot(app: tauri::AppHandle) -> Result<MemorySnapshot, String> {
    let tracker = app.state::<Mutex<MemoryTracker>>();

    // Use sysinfo for real memory measurements
    let mut sys = System::new_all();
    sys.refresh_all();

    // Get process memory (Tauri process)
    let pid = Pid::from_u32(std::process::id());
    let (process_rss_mb, process_virt_mb) = if let Some(process) = sys.process(pid) {
        (
            process.memory() as f64 / 1024.0 / 1024.0, // RSS in MB
            process.virtual_memory() as f64 / 1024.0 / 1024.0, // Virtual in MB
        )
    } else {
        (0.0, 0.0) // Fallback if process not found
    };

    // Get system memory
    let total_ram_mb = sys.total_memory() as f64 / 1024.0 / 1024.0;
    let used_ram_mb = sys.used_memory() as f64 / 1024.0 / 1024.0;
    let available_ram_mb = sys.available_memory() as f64 / 1024.0 / 1024.0;

    // Calculate memory pressure
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
        process_rss_mb,
        process_virt_mb,
        total_ram_mb,
        used_ram_mb,
        available_ram_mb,
        pressure_level: pressure_level.to_string(),
        pressure_ratio,
    };

    let mut t = tracker.lock().unwrap();
    t.snapshots.push(snapshot.clone());

    Ok(snapshot)
}

#[tauri::command]
fn get_memory_history(app: tauri::AppHandle) -> Result<Vec<MemorySnapshot>, String> {
    let tracker = app.state::<Mutex<MemoryTracker>>();
    let t = tracker.lock().unwrap();
    Ok(t.snapshots.clone())
}

// ─── Commands: Navigation Patterns ─────────────────────────────────────────────

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

// ─── Commands: Session & Research Export ─────────────────────────────────────

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

    // Update session stats
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

// ─── Commands: App Info ──────────────────────────────────────────────────────

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

// ─── Session Data ────────────────────────────────────────────────────────────

struct SessionData {
    sessions: Mutex<HashMap<String, serde_json::Value>>,
}

#[tauri::command]
fn save_session_data(app: tauri::AppHandle, key: String, data: serde_json::Value) -> Result<(), String> {
    let session = app.state::<SessionData>();
    let mut sessions = session.sessions.lock().unwrap();
    sessions.insert(key, data);
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
    sessions.clear();
    Ok(())
}

// ─── Main ────────────────────────────────────────────────────────────────────

fn main() {
    log::info!("Starting EduOS Browser v{} - Research Edition", env!("CARGO_PKG_VERSION"));
    log::info!("Research: Observable behavior tracking for knowledge work analysis");
    log::info!("Storage = Raw observations. Labels = Derived (analysis layer).");

    // Initialize state
    let tab_manager = TabManager::default();
    let default_tab = TabData {
        id: "default".to_string(),
        history_index: 0,
        created_at: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
        last_accessed: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
    };
    let mut tm = tab_manager.tabs.lock().unwrap();
    tm.insert("default".to_string(), default_tab);
    drop(tm);
    let mut th = tab_manager.history.lock().unwrap();
    th.push(HOMEPAGE.to_string());
    drop(th);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(MemoryTracker::default())
        .manage(SequenceTracker::default())
        .manage(WebViewLifecycle::default())
        .manage(tab_manager)
        .manage(SessionManager::default())
        .manage(SessionData {
            sessions: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            // Window
            minimize_window,
            toggle_maximize,
            close_window,
            get_app_version,
            // WebView Lifecycle (Lazy creation, destroy-on-idle)
            get_webview_state,
            ensure_webview_active,
            destroy_webview,
            set_idle_threshold,
            record_activity,
            record_navigation,
            // Navigation
            navigate_browser,
            reload_browser,
            back_browser,
            forward_browser,
            // Tab management
            create_tab,
            switch_tab,
            close_tab,
            get_tab_snapshots,
            // Memory
            get_memory_snapshot,
            get_memory_history,
            // Patterns (raw analysis)
            get_navigation_events,
            get_domain_sequence,
            analyze_patterns,
            // Research
            start_research_session,
            get_current_session,
            export_research_data,
            get_literature_notes,
            get_research_questions,
            // Session
            save_session_data,
            load_session_data,
            clear_session_data,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            let main_window = app.get_webview_window("main").expect("main window not found");

            // NOTE: WebView is NOT created on startup - lazy creation
            log::info!("EduOS Browser Research Edition ready");
            log::info!("WebView lifecycle: Lazy creation enabled");
            log::info!("WebView will be created on first navigation");

            // Sync layout only when window events happen
            let resize_handle = handle.clone();
            main_window.on_window_event(move |event| match event {
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                    sync_browser_layout(&resize_handle);
                }
                tauri::WindowEvent::Focused(true) => {
                    // When main window gains focus, ensure browser is visible if it exists
                    if let Some(browser) = resize_handle.get_webview_window("browser") {
                        let _ = browser.show();
                        sync_browser_layout(&resize_handle);
                    }
                }
                _ => {}
            });

            // Debug: Press F8 to destroy WebView (for testing T3 measurement)
            // This bypasses the ACL issue by handling it directly in Rust
            let debug_handle = handle.clone();
            if let Ok(_) = main_window.listen(tauri::Event::WindowEvent(
                std::sync::Arc::new(tauri::EventType::KeyboardInput {
                    device_id: 0,
                    event: std::sync::Arc::new(tauri::Event::new()),
                    is_synthetic: false,
                }),
            )) {
                // Listen not supported, skip debug shortcut
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EduOS Browser");
}
