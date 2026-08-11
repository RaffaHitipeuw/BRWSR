// WebView2 Process Collector - Benchmark Infrastructure
//
// RESEARCH METHODOLOGY DOCUMENTATION
//
// Memory Metric:
//   We collect process memory via sysinfo, which returns resident memory (RSS-like).
//   Note: For more accurate Windows metrics, consider using Windows API directly:
//   - PrivateMemorySize64: Private bytes (not shared)
//   - WorkingSetSize: Physical memory (not shared)
//   - VirtualAlloc: Commit size
//
// Process Identity:
//   Windows PID is NOT stable identity across process lifetimes.
//   A PID can be reused after a process exits.
//   We use (pid, start_time) as stable identity.
//
// Peak Definition:
//   peak = max(total_memory_mb) during measurement window
//   warmup: excluded from measurement
//   measurement_window: after warmup completes
//
// Process Group:
//   WebView2 uses multiple processes: browser, renderer(s), GPU, helpers.
//   We enumerate all Edge/msedge processes as a heuristic for the process group.

use serde::{Deserialize, Serialize};
use sysinfo::System;

// ─── PROCESS IDENTITY ─────────────────────────────────────────────────────────
//
// Windows PID is NOT stable identity.
// A PID can be reused after process exits.
//
// Stable identity = (pid, start_time)
// If process with same PID but different start_time exists, it's a DIFFERENT process.

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq, Hash)]
pub struct ProcessIdentity {
    pub pid: u32,
    /// Process start time (Unix timestamp) - stable across PID reuse
    pub start_time: u64,
}

impl ProcessIdentity {
    pub fn new(pid: u32, start_time: u64) -> Self {
        Self { pid, start_time }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ProcessSnapshot {
    /// Stable identity (pid + start_time)
    pub identity: ProcessIdentity,
    /// Display name
    pub name: String,
    /// Process classification
    pub kind: ProcessKind,
    /// Memory in MB (sysinfo memory() - resident memory)
    pub memory_mb: f64,
    /// Virtual memory in MB
    pub virtual_mb: f64,
    /// First observed in this run
    pub first_seen_ms: u64,
    /// Last observed in this run
    pub last_seen_ms: u64,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ProcessKind {
    Browser,
    Renderer,
    Gpu,
    Audio,
    Network,
    Utility,
    Unknown,
}

// ─── WEBVIEW2 SNAPSHOT ───────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WebView2Snapshot {
    /// Wall clock timestamp (ms since Unix epoch)
    pub timestamp_ms: u64,

    /// All processes observed
    pub processes: Vec<ProcessSnapshot>,

    /// Categorized processes
    pub browser: Option<ProcessSnapshot>,
    pub renderers: Vec<ProcessSnapshot>,
    pub gpu: Option<ProcessSnapshot>,
    pub helpers: Vec<ProcessSnapshot>,

    /// Aggregated memory of process GROUP
    /// IMPORTANT: This is sum of all processes, not a single process
    pub group_memory_mb: f64,

    /// Count of processes in group
    pub group_process_count: u32,

    /// System memory context
    pub system_total_mb: f64,
    pub system_available_mb: f64,
    pub system_pressure_ratio: f64,

    /// Environment at snapshot time
    pub environment: EnvironmentInfo,
}

/// Environment information (static for a run)
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct EnvironmentInfo {
    pub os: String,
    pub os_version: String,
    pub ram_mb: u64,
    pub cpu_brand: String,
    pub cpu_count: usize,
    pub webview2_version: Option<String>,
    pub app_version: String,
    pub build_type: String,
}

// ─── MEASUREMENT DELTA ───────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct MeasurementDelta {
    /// What action was performed
    pub action: Action,

    /// Stable identities of processes that appeared
    pub processes_added: Vec<ProcessSnapshot>,
    /// Stable identities of processes that disappeared
    pub processes_removed: Vec<ProcessSnapshot>,

    /// Memory change (after.group_memory_mb - before.group_memory_mb)
    pub delta_memory_mb: f64,
    /// Process count change
    pub delta_process_count: i32,

    /// Time between snapshots
    pub stabilization_ms: u64,
}

/// Actions we measure
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Evict,
    Restore,
    Navigate,
    Stabilize, // Natural memory behavior without action
}

// ─── LIFECYCLE METRICS ───────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct LifecycleMetrics {
    /// Attempt count
    pub attempts: u32,
    /// Successful completions
    pub successes: u32,
    /// Failed completions
    pub failures: u32,
    /// Success rate (successes / attempts)
    pub success_rate: f64,

    /// Latency in ms (end_time - start_time)
    pub latencies_ms: Vec<f64>,
    /// Mean latency
    pub mean_latency_ms: Option<f64>,
    /// Median latency
    pub median_latency_ms: Option<f64>,
}

impl LifecycleMetrics {
    pub fn new() -> Self {
        Self {
            attempts: 0,
            successes: 0,
            failures: 0,
            success_rate: 0.0,
            latencies_ms: Vec::new(),
            mean_latency_ms: None,
            median_latency_ms: None,
        }
    }

    pub fn record(&mut self, success: bool, latency_ms: f64) {
        self.attempts += 1;
        if success {
            self.successes += 1;
        } else {
            self.failures += 1;
        }
        self.latencies_ms.push(latency_ms);
        self.success_rate = self.successes as f64 / self.attempts as f64;

        // Calculate statistics
        if !self.latencies_ms.is_empty() {
            let sum: f64 = self.latencies_ms.iter().sum();
            self.mean_latency_ms = Some(sum / self.latencies_ms.len() as f64);

            let mut sorted = self.latencies_ms.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let mid = sorted.len() / 2;
            self.median_latency_ms = if sorted.len() % 2 == 0 {
                Some((sorted[mid - 1] + sorted[mid]) / 2.0)
            } else {
                Some(sorted[mid])
            };
        }
    }
}

impl Default for LifecycleMetrics {
    fn default() -> Self {
        Self::new()
    }
}

// ─── HYSTERESIS TEST ────────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct HysteresisTestResult {
    /// Simulated pressure events
    pub pressure_events: u32,
    /// Actions that occurred
    pub actions_performed: u32,
    /// Actions blocked by cooldown
    pub blocked_by_cooldown: u32,
    /// Actions blocked by sustained requirement
    pub blocked_by_sustained: u32,

    /// Total actions that SHOULD have occurred if no hysteresis
    pub expected_actions: u32,

    /// How well hysteresis matched expected behavior
    pub cooldown_effectiveness: f64,  // blocked / expected_if_unrestricted
}

// ─── RACE CONDITION TEST ───────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct RaceConditionTestResult {
    /// Total rapid sequences executed
    pub sequences_executed: u32,
    /// Correct final states achieved
    pub correct_final_states: u32,
    /// Stale mutations detected (old operations affecting state)
    pub stale_mutations: u32,
    /// Generation mismatches
    pub generation_mismatches: u32,

    /// Success rate
    pub success_rate: f64,
}

// ─── PRESSURE REGIME ─────────────────────────────────────────────────────────

/// Characterizes the memory pressure level during benchmark run
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PressureRegime {
    /// Pressure level classification
    pub level: PressureLevel,
    /// Available memory ratio at start
    pub initial_available_ratio: f64,
    /// Average available ratio during run
    pub avg_available_ratio: f64,
    /// Was eviction ever triggered?
    pub eviction_triggered: bool,
    /// Description
    pub characterization: String,
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PressureLevel {
    Low,    // >50% available - eviction unlikely
    Medium, // 20-50% available - eviction possible
    High,   // 10-20% available - eviction likely
    Critical, // ≤10% available - eviction required
}

impl PressureLevel {
    pub fn from_ratio(ratio: f64) -> Self {
        if ratio > 0.50 {
            PressureLevel::Low
        } else if ratio > 0.20 {
            PressureLevel::Medium
        } else if ratio > 0.10 {
            PressureLevel::High
        } else {
            PressureLevel::Critical
        }
    }
}

impl std::fmt::Display for PressureLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PressureLevel::Low => write!(f, "low"),
            PressureLevel::Medium => write!(f, "medium"),
            PressureLevel::High => write!(f, "high"),
            PressureLevel::Critical => write!(f, "critical"),
        }
    }
}

// ─── EVICTION EVENT TRACE ───────────────────────────────────────────────────

/// Detailed trace of a single eviction action
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct EvictionEvent {
    /// Event sequence number
    pub event_id: u32,
    /// Wall clock timestamp (ms since epoch)
    pub timestamp_ms: u64,
    /// Tab that was evicted
    pub tab_id: Option<String>,
    /// Process group state BEFORE eviction
    pub before: ProcessGroupSnapshot,
    /// Action taken
    pub action: String,
    /// Process group state AFTER eviction
    pub after: ProcessGroupSnapshot,
    /// DELTA - what actually changed
    pub delta: EvictionDelta,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ProcessGroupSnapshot {
    /// Total group memory (MB)
    pub group_memory_mb: f64,
    /// Process count in group
    pub process_count: u32,
    /// Individual process identities
    pub process_identities: Vec<ProcessIdentity>,
    /// Memory per process kind
    pub browser_memory_mb: f64,
    pub renderer_memory_mb: f64,
    pub gpu_memory_mb: f64,
    pub helper_memory_mb: f64,
    /// Renderer process count
    pub renderer_count: u32,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct EvictionDelta {
    /// Memory change (after - before)
    pub memory_delta_mb: f64,
    /// Process count change
    pub process_count_delta: i32,
    /// Processes that appeared
    pub processes_added: Vec<ProcessIdentity>,
    /// Processes that disappeared
    pub processes_removed: Vec<ProcessIdentity>,
    /// Was there actual resource reclamation?
    pub effective_eviction: bool,
    /// Comment on delta
    pub interpretation: String,
}

impl EvictionDelta {
    /// Analyze if eviction actually worked
    pub fn analyze(before: &ProcessGroupSnapshot, after: &ProcessGroupSnapshot) -> Self {
        let memory_delta = after.group_memory_mb - before.group_memory_mb;
        let process_delta = after.process_count as i32 - before.process_count as i32;

        let processes_removed: Vec<ProcessIdentity> = before
            .process_identities
            .iter()
            .filter(|p| !after.process_identities.contains(p))
            .cloned()
            .collect();

        let processes_added: Vec<ProcessIdentity> = after
            .process_identities
            .iter()
            .filter(|p| !before.process_identities.contains(p))
            .cloned()
            .collect();

        // Eviction is "effective" if either:
        // 1. A renderer process disappeared, OR
        // 2. Memory decreased by >10MB (heuristic for actual reclamation)
        let renderer_removed = before.renderer_count > after.renderer_count;
        let memory_saved = memory_delta < -10.0;
        let effective = renderer_removed || memory_saved;

        let interpretation = if renderer_removed {
            format!("Renderer process(es) terminated: {} processes removed", processes_removed.len())
        } else if memory_delta < -5.0 {
            format!("Memory decreased by {:.1} MB (no process termination)", -memory_delta)
        } else if memory_delta > 5.0 {
            format!("Memory INCREASED by {:.1} MB - eviction may have triggered lazy reload", memory_delta)
        } else {
            "No significant memory change - eviction may not have triggered actual reclamation".to_string()
        };

        Self {
            memory_delta_mb: memory_delta,
            process_count_delta: process_delta,
            processes_added,
            processes_removed,
            effective_eviction: effective,
            interpretation,
        }
    }
}

// ─── EVICTION ATTEMPT TRACKER ──────────────────────────────────────────────

/// Tracks eviction attempts vs actual outcomes
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct EvictionAttemptTracker {
    /// Total eviction attempts by lifecycle engine
    pub attempts: u32,
    /// Attempts that resulted in effective resource reclamation
    pub effective: u32,
    /// Attempts where engine said "evict" but nothing changed
    pub ineffective: u32,
    /// Eviction events captured
    pub events: Vec<EvictionEvent>,
}

impl EvictionAttemptTracker {
    pub fn new() -> Self {
        Self {
            attempts: 0,
            effective: 0,
            ineffective: 0,
            events: Vec::new(),
        }
    }

    pub fn record_attempt(&mut self, event: EvictionEvent) {
        self.attempts += 1;
        if event.delta.effective_eviction {
            self.effective += 1;
        } else {
            self.ineffective += 1;
        }
        self.events.push(event);
    }

    /// Answer: "Did treatment actually perform the thing we're measuring?"
    pub fn effectiveness_ratio(&self) -> f64 {
        if self.attempts == 0 {
            0.0
        } else {
            self.effective as f64 / self.attempts as f64
        }
    }
}

impl Default for EvictionAttemptTracker {
    fn default() -> Self {
        Self::new()
    }
}

// ─── CORRECTNESS INVARIANTS ─────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct CorrectnessInvariants {
    /// After evict: tab metadata exists
    pub evict_metadata_preserved: bool,
    /// After evict: URL preserved
    pub evict_url_preserved: bool,
    /// After evict: WebView instance destroyed
    pub evict_webview_destroyed: bool,

    /// After restore: tab metadata exists
    pub restore_metadata_preserved: bool,
    /// After restore: URL matches original
    pub restore_url_matches: bool,
    /// After restore: WebView instance created
    pub restore_webview_created: bool,

    /// Scroll position NOT preserved (known limitation)
    pub scroll_position_preserved: bool,  // Should be false
    /// Form state NOT preserved (known limitation)
    pub form_state_preserved: bool,  // Should be false
}

// ─── COLLECTOR ─────────────────────────────────────────────────────────────

pub struct WebView2Collector {
    sys: System,
}

impl WebView2Collector {
    pub fn new() -> Self {
        Self {
            sys: System::new_all(),
        }
    }

    pub fn refresh(&mut self) {
        self.sys.refresh_all();
    }

    /// Take a snapshot of WebView2 process group
    pub fn snapshot(&mut self, environment: &EnvironmentInfo) -> WebView2Snapshot {
        self.refresh();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let mut all: Vec<ProcessSnapshot> = Vec::new();
        let mut browser: Option<ProcessSnapshot> = None;
        let mut renderers: Vec<ProcessSnapshot> = Vec::new();
        let mut gpu: Option<ProcessSnapshot> = None;
        let mut helpers: Vec<ProcessSnapshot> = Vec::new();

        for (pid, process) in self.sys.processes() {
            let name = process.name().to_string_lossy().to_string();
            let name_lower = name.to_lowercase();

            let kind = classify_process(&name_lower);
            if kind == ProcessKind::Unknown {
                continue;
            }

            let snapshot = ProcessSnapshot {
                identity: ProcessIdentity::new(pid.as_u32(), process.start_time()),
                name,
                kind: kind.clone(),
                memory_mb: process.memory() as f64 / 1024.0 / 1024.0,
                virtual_mb: process.virtual_memory() as f64 / 1024.0 / 1024.0,
                first_seen_ms: now,
                last_seen_ms: now,
            };

            match kind {
                ProcessKind::Browser => browser = Some(snapshot.clone()),
                ProcessKind::Renderer => renderers.push(snapshot.clone()),
                ProcessKind::Gpu => gpu = Some(snapshot.clone()),
                _ => helpers.push(snapshot.clone()),
            }

            all.push(snapshot);
        }

        let group_memory_mb: f64 = all.iter().map(|p| p.memory_mb).sum();
        let group_process_count = all.len() as u32;
        let system_total_mb = self.sys.total_memory() as f64 / 1024.0 / 1024.0;
        let system_available_mb = self.sys.available_memory() as f64 / 1024.0 / 1024.0;

        WebView2Snapshot {
            timestamp_ms: now,
            processes: all,
            browser,
            renderers,
            gpu,
            helpers,
            group_memory_mb,
            group_process_count,
            system_total_mb,
            system_available_mb,
            system_pressure_ratio: system_available_mb / system_total_mb,
            environment: environment.clone(),
        }
    }

    /// Calculate delta between two snapshots
    pub fn delta(
        &self,
        action: Action,
        before: &WebView2Snapshot,
        after: &WebView2Snapshot,
        stabilization_ms: u64,
    ) -> MeasurementDelta {
        let before_identities: std::collections::HashSet<ProcessIdentity> = before
            .processes
            .iter()
            .map(|p| p.identity.clone())
            .collect();

        let after_identities: std::collections::HashSet<ProcessIdentity> = after
            .processes
            .iter()
            .map(|p| p.identity.clone())
            .collect();

        let added: Vec<ProcessSnapshot> = after
            .processes
            .iter()
            .filter(|p| !before_identities.contains(&p.identity))
            .cloned()
            .collect();

        let removed: Vec<ProcessSnapshot> = before
            .processes
            .iter()
            .filter(|p| !after_identities.contains(&p.identity))
            .cloned()
            .collect();

        MeasurementDelta {
            action,
            processes_added: added,
            processes_removed: removed,
            delta_memory_mb: after.group_memory_mb - before.group_memory_mb,
            delta_process_count: after.group_process_count as i32 - before.group_process_count as i32,
            stabilization_ms,
        }
    }
}

impl Default for WebView2Collector {
    fn default() -> Self {
        Self::new()
    }
}

/// Classify process by name
fn classify_process(name: &str) -> ProcessKind {
    // Edge browser process
    if name.contains("msedge") || name.contains("microsoftedge") {
        return ProcessKind::Browser;
    }

    // Renderer processes
    if name.contains("renderer") || name.contains("render") {
        return ProcessKind::Renderer;
    }

    // GPU process
    if name.contains("gpu") || name.contains("video") {
        return ProcessKind::Gpu;
    }

    // Audio process
    if name.contains("audio") || name.contains("audiodg") {
        return ProcessKind::Audio;
    }

    // Network process
    if name.contains("network") {
        return ProcessKind::Network;
    }

    // Utility processes
    if name.contains("utility") || name.contains("crashpad") {
        return ProcessKind::Utility;
    }

    ProcessKind::Unknown
}

// ─── ENVIRONMENT ─────────────────────────────────────────────────────────────

pub fn get_environment_info() -> EnvironmentInfo {
    let sys = System::new_all();

    EnvironmentInfo {
        os: std::env::consts::OS.to_string(),
        os_version: "Windows".to_string(),
        ram_mb: sys.total_memory() as u64 / 1024 / 1024,
        cpu_brand: sys.cpus().first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown".to_string()),
        cpu_count: sys.cpus().len(),
        webview2_version: None,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        build_type: if cfg!(debug_assertions) {
            "debug".to_string()
        } else {
            "release".to_string()
        },
    }
}
