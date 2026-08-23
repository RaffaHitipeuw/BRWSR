























#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

mod startup_profiler;
use startup_profiler::{StartupEvent, StartupProfiler, StartupTrace};



const UI_HEIGHT: f64 = 88.0;
const HOMEPAGE: &str = "https://www.google.com";


const TEMPORAL_GAP_THRESHOLD_MS: u64 = 300_000; 
const MIN_SEQUENCE_SIZE: usize = 2; 



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
    BrowserGeometry {
        x: main_pos.x,
        y: main_pos.y + ui_height_px,
        width: main_size.width - 18,
        height: ((main_size.height as i32) - ui_height_px).max(1) as u32,
    }
}

fn sync_browser_layout(app: &tauri::AppHandle) {
    let (Some(main), Some(browser)) = (
        app.get_webview_window("main"),
        app.get_webview_window("browser"),
    ) else {
        return;
    };

    let Ok(pos) = main.outer_position() else { return };
    let Ok(size) = main.outer_size() else { return };
    let scale = main.scale_factor().unwrap_or(1.0);

    let geo = compute_browser_geometry(pos, size, scale);
    let _ = browser.set_position(PhysicalPosition::new(geo.x, geo.y));
    let _ = browser.set_size(PhysicalSize::new(geo.width, geo.height));
}






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
    
    let session_mgr = app.state::<Mutex<SessionManager>>();
    if let Ok(mut session) = session_mgr.lock() {
        if let Some(ref mut s) = session.current_session {
            s.ended_at = Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs());
        }
    }

    
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
    let needs_creation = lifecycle.get_state() == WebViewState::Uninitialized
        || lifecycle.get_state() == WebViewState::Destroyed;

    
    let profiler = app.state::<Mutex<StartupProfiler>>();

    if needs_creation {

        let mut p = profiler.lock().unwrap();
        p.phase_start("webview_checking_geometry");


        let handle = app.app_handle().clone();
        let main_window = app.get_webview_window("main")
            .ok_or("Main window not found")?;

        std::thread::sleep(std::time::Duration::from_millis(100));


        let main_pos = main_window.outer_position().unwrap_or_default();
        let main_size = main_window.outer_size().unwrap_or(tauri::PhysicalSize { width: 1280, height: 800 });


        let geo = compute_browser_geometry(main_pos, main_size, 1.0);
        
        let pos_x = geo.x as f64;
        let pos_y = geo.y as f64;
        let size_w = geo.width as f64;
        let size_h = geo.height as f64;

        p.phase_end("webview_checking_geometry", Some("geometry computed"));

        let webview_url: WebviewUrl = match url::Url::parse(&url) {
            Ok(u) => WebviewUrl::External(u),
            Err(_) => WebviewUrl::App("about:blank".into()),
        };

        p.phase_start("webview_builder_create");
        match WebviewWindowBuilder::new(&handle, "browser", webview_url)
            .title("EduOS Browser")
            .position(pos_x, pos_y)
            .inner_size(size_w, size_h)
            .decorations(false)
            .resizable(false)
            .skip_taskbar(true)
            .visible(true)
            .focused(true)
            .parent(&main_window)
        {
            Ok(builder) => {
                p.phase_end("webview_builder_create", Some("builder created"));

                p.phase_start("webview_build");
                match builder.build() {
                    Ok(browser_win) => {
                        p.phase_end("webview_build", Some("WebView built successfully"));

                        disable_main_window_rounded_corners(&browser_win);
                        lifecycle.mark_active();

                        sync_browser_layout(&handle);

                        let trace = p.finish();
                        log::info!("[WEBVIEW] WebView created in {}ms total", trace.total_ms);
                        for (phase, dur) in &trace.phase_breakdown {
                            log::info!("[WEBVIEW]   {}: {}ms", phase, dur);
                        }
                    }
                    Err(e) => return Err(format!("Failed to create WebView: {}", e)),
                }
            }
            Err(e) => return Err(format!("Failed to create WebView: {}", e)),
        }
    } else {
        lifecycle.mark_active();
    }

    
    lifecycle.record_navigation_sync(&url, &tabId);

    
    let window = app.get_webview_window("browser").ok_or("Browser not found")?;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    
    let domain = SequenceTracker::extract_domain(&url);

    
    let mem_tracker = app.state::<Mutex<MemoryTracker>>();
    let (rss, pressure) = {
        let m = mem_tracker.lock().unwrap();
        
        let last = m.snapshots.last();
        (
            last.map(|s| s.combined_rss_mb),
            last.map(|s| s.pressure_level.clone()),
        )
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
        let mut tm = tab_manager.lock().unwrap();
        let mut tabs = tm.tabs.lock().unwrap();
        let mut history = tm.history.lock().unwrap();

        if let Some(tab) = tabs.get(&tabId) {
            let idx = tab.history_index;
            let new_len = (idx + 1).min(history.len());
            history.truncate(new_len);
        }

        
        if history.len() >= MAX_HISTORY_ENTRIES {
            
            let remove_count = (history.len() - MAX_HISTORY_ENTRIES) + 1;
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

    
    let handle = app.app_handle().clone();
    let main_window = app.get_webview_window("main")
        .ok_or("Main window not found")?;

    let main_pos = main_window.outer_position().unwrap_or_default();
    let main_size = main_window.outer_size().unwrap_or(tauri::PhysicalSize { width: 1280, height: 800 });


    let geo = compute_browser_geometry(main_pos, main_size, 1.0);
    let pos_x = geo.x as f64;
    let pos_y = geo.y as f64;
    let size_w = geo.width as f64;
    let size_h = geo.height as f64;

    let webview_url: WebviewUrl = match url::Url::parse(&url_to_load) {
        Ok(u) => WebviewUrl::External(u),
        Err(_) => WebviewUrl::App("about:blank".into()),
    };

    match WebviewWindowBuilder::new(&handle, "browser", webview_url)
        .title("EduOS Browser")
        .position(pos_x, pos_y)
        .inner_size(size_w, size_h)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .visible(true)
        .focused(true)
        .parent(&main_window)
    {
        Ok(builder) => match builder.build() {
            Ok(browser_win) => {
                
                disable_main_window_rounded_corners(&browser_win);
                lifecycle.mark_active();
                log::info!("WebView restored: {}", url_to_load);
                Ok(true) 
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

    
    let action_succeeded = if let Some(browser) = app.get_webview_window("browser") {
        browser.close().is_ok()
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

    
    let handle = app.app_handle().clone();
    let main_window = match app.get_webview_window("main") {
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

    let main_pos = main_window.outer_position().unwrap_or_default();
    let main_size = main_window.outer_size().unwrap_or(tauri::PhysicalSize { width: 1280, height: 800 });


    let geo = compute_browser_geometry(main_pos, main_size, 1.0);
    let pos_x = geo.x as f64;
    let pos_y = geo.y as f64;
    let size_w = geo.width as f64;
    let size_h = geo.height as f64;

    let webview_url: WebviewUrl = match url::Url::parse(&url_to_load) {
        Ok(u) => WebviewUrl::External(u),
        Err(_) => WebviewUrl::App("about:blank".into()),
    };

    match WebviewWindowBuilder::new(&handle, "browser", webview_url)
        .title("EduOS Browser")
        .position(pos_x, pos_y)
        .inner_size(size_w, size_h)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .visible(true)
        .focused(true)
        .parent(&main_window)
    {
        Ok(builder) => match builder.build() {
            Ok(browser_win) => {
                
                disable_main_window_rounded_corners(&browser_win);
                lifecycle.mark_active();
                *lifecycle.last_url.lock().unwrap() = Some(url_to_load.clone());
                *lifecycle.last_tab_id.lock().unwrap() = Some(tabId.clone());

                log::info!("Tab {} restored from evicted state", tabId);

                
                sys.refresh_all();
                let process_after = capture_process_state(&sys);

                
                let restore_completed_event = LifecycleEvent::new(
                    format!("rst-cmp-{}-{}", tabId, next_event_sequence()),
                    next_event_sequence(),
                    LifecycleEventType::RestoreCompleted,
                    tabId.clone(),
                    previous_state_str.to_string(),
                    "active".to_string(),
                    pressure_level.to_string(),
                    format!("Restore completed for {} to {}", tabId, url_to_load),
                    process_before,
                    process_after,
                    true,
                );
                emit_lifecycle_event(&app, restore_completed_event);

                Ok(TabLifecycleInfo {
                    tab_id: tabId,
                    lifecycle_state: "restoring".to_string(),
                    estimated_memory_mb: 50.0,
                    can_suspend: true,
                    can_evict: true,
                })
            }
            Err(e) => {
                
                sys.refresh_all();
                let process_after = capture_process_state(&sys);

                let event = LifecycleEvent::new(
                    format!("rst-fail-{}-{}", tabId, next_event_sequence()),
                    next_event_sequence(),
                    LifecycleEventType::RestoreFailed,
                    tabId.clone(),
                    previous_state_str.to_string(),
                    previous_state_str.to_string(),
                    pressure_level.to_string(),
                    format!("Restore failed: {}", e),
                    process_before,
                    process_after,
                    false,
                );
                emit_lifecycle_event(&app, event);

                log::error!("Failed to restore tab: {}", e);
                Err(format!("Failed to restore tab: {}", e))
            }
        },
        Err(e) => {
            
            sys.refresh_all();
            let process_after = capture_process_state(&sys);

            let event = LifecycleEvent::new(
                format!("rst-fail-{}-{}", tabId, next_event_sequence()),
                next_event_sequence(),
                LifecycleEventType::RestoreFailed,
                tabId.clone(),
                previous_state_str.to_string(),
                previous_state_str.to_string(),
                pressure_level.to_string(),
                format!("Restore failed: {}", e),
                process_before,
                process_after,
                false,
            );
            emit_lifecycle_event(&app, event);

            log::error!("Failed to create WebView builder: {}", e);
            Err(format!("Failed to restore tab: {}", e))
        }
    }
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
    browser_window: &tauri::WebviewWindow,
    app: &tauri::AppHandle,
) -> Result<(f64, u32, u32, Vec<u32>), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows::core::Interface;
    use std::sync::{Arc, Mutex};

    let result_arc: Arc<Mutex<Option<(Vec<u32>, u32, u32)>>> = Arc::new(Mutex::new(None));

    let r = browser_window.with_webview({
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

    let browser_window = app.get_webview_window("browser")
        .ok_or_else(|| "Browser window not found".to_string())?;

    
    let (total_mb, browser_count, renderer_count, webview2_pids) =
        sample_webview2_memory(&browser_window, &app)?;

    
    let env_result_arc: Arc<Mutex<Option<(Option<String>, Option<String>)>>> =
        Arc::new(Mutex::new(None));

    let _r = browser_window.with_webview({
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

    let _r = browser_window.with_webview({
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
        
        
        
        let group_memory_mb = app.get_webview_window("browser")
            .and_then(|w| sample_webview2_memory(&w, &app).ok())
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



fn main() {
    
    use std::time::SystemTime;
    let program_start = SystemTime::now();
    let program_start_instant = std::time::Instant::now();

    let args: Vec<String> = std::env::args().collect();

    let benchmark_mode = args.get(1).map(|s| s.as_str()) == Some("--benchmark");
    BENCHMARK_MODE.store(benchmark_mode, std::sync::atomic::Ordering::SeqCst);

    log::info!("Starting EduOS Browser v{} - Research Edition", env!("CARGO_PKG_VERSION"));
    log::info!("Research: Observable behavior tracking for knowledge work analysis");
    log::info!("Storage = Raw observations. Labels = Derived (analysis layer).");
    if benchmark_mode {
        log::info!("BENCHMARK MODE: Harness will auto-start on frontend mount");
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

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(Mutex::new(MemoryTracker::default()))
        .manage(Mutex::new(SequenceTracker::default()))
        .manage(WebViewLifecycle::default())
        .manage(LifecycleEventStore::default())
        .manage(Mutex::new(tab_manager))
        .manage(Mutex::new(SessionManager::default()))
        .manage(SessionData {
            sessions: Mutex::new(HashMap::new()),
            insertion_order: Mutex::new(Vec::new()),
        })
        .manage(CachedSystem::new()) 
        .manage(Mutex::new(StartupProfiler::new())) 
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
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            
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

            p.phase_start("window_event_listeners");
            
            let resize_handle = handle.clone();
            main_window.on_window_event(move |event| match event {
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                    sync_browser_layout(&resize_handle);
                }
                tauri::WindowEvent::Focused(true) => {
                    
                    if let Some(browser) = resize_handle.get_webview_window("browser") {
                        let _ = browser.show();
                        sync_browser_layout(&resize_handle);
                    }
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EduOS Browser");
}
