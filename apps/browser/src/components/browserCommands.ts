// Browser commands for Tauri - Research Edition
// Backend: Observable behavior tracking for knowledge work analysis
//
// STORAGE LAYER (Raw Observations Only):
// - Navigation events: timestamp, url, domain, action, tab_id, duration
// - Memory snapshots: RSS, working_set, commit, virtual_size (Windows metrics)
//
// ANALYSIS LAYER (Inference - NOT stored):
// - "Context" labels are derived, not stored
// - Domain sequences are patterns, not entities
// - Research questions are hypotheses to test, not conclusions
//
// MEMORY EXPERIMENT PROTOCOL:
//   T1: Baseline WebView2 infrastructure (no content loaded)
//   T2: Active browsing state (App + WebView + Content)
//   T3: WebView destroyed, application alive (MEASURES destroy-on-idle effectiveness)

async function invoke(command: string, args?: Record<string, unknown>) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke(command, args);
  } catch (err) {
    console.error(`Command ${command} failed:`, err);
    return null;
  }
}

export const browser = {
  // Navigation
  async navigate(url: string, tabId: string = "default", navigationType: string = "navigate") {
    return await invoke("navigate_browser", {
      url,
      tabId,
      navigationType,
    });
  },

  async reload() {
    return await invoke("reload_browser");
  },

  async back() {
    return await invoke("back_browser");
  },

  async forward() {
    return await invoke("forward_browser");
  },

  // Window control
  async minimize() {
    return await invoke("minimize_window");
  },

  async toggleMaximize() {
    return await invoke("toggle_maximize");
  },

  async close() {
    return await invoke("close_window");
  },

  // WebView Lifecycle (Lazy creation, destroy-on-idle)
  async getWebViewState() {
    return await invoke("get_webview_state");
  },

  async ensureWebViewActive() {
    return await invoke("ensure_webview_active");
  },

  async destroyWebView() {
    return await invoke("destroy_webview");
  },

  async setIdleThreshold(seconds: number) {
    return await invoke("set_idle_threshold", { seconds });
  },

  async recordActivity() {
    return await invoke("record_activity");
  },

  // Tab management
  async createTab(tabId: string) {
    return await invoke("create_tab", { tabId });
  },

  async switchTab(tabId: string) {
    return await invoke("switch_tab", { tabId });
  },

  async closeTab(tabId: string) {
    return await invoke("close_tab", { tabId });
  },

  async getTabSnapshots() {
    return await invoke("get_tab_snapshots");
  },

  // Tab Lifecycle Management (P0-3)
  // These implement REAL resource lifecycle changes, not just state flags
  async suspendTab(tabId: string): Promise<TabLifecycleInfo | null> {
    return (await invoke("suspend_tab", { tabId })) as TabLifecycleInfo | null;
  },

  async evictTab(tabId: string): Promise<TabLifecycleInfo | null> {
    return (await invoke("evict_tab", { tabId })) as TabLifecycleInfo | null;
  },

  async restoreTab(tabId: string): Promise<TabLifecycleInfo | null> {
    return (await invoke("restore_tab", { tabId })) as TabLifecycleInfo | null;
  },

  async getTabLifecycle(tabId: string): Promise<TabLifecycleInfo | null> {
    return (await invoke("get_tab_lifecycle", { tabId })) as TabLifecycleInfo | null;
  },

  // Memory tracking (REAL measurements via sysinfo)
  async getMemorySnapshot() {
    return await invoke("get_memory_snapshot");
  },

  async getMemoryHistory() {
    return await invoke("get_memory_history");
  },

  // P0: Authoritative WebView2 process telemetry
  async getWebview2ProcessSnapshot(): Promise<WebView2ProcessSnapshot | null> {
    return (await invoke("get_webview2_process_snapshot")) as WebView2ProcessSnapshot | null;
  },

  // Navigation patterns (RAW observations for analysis)
  async getNavigationEvents(limit?: number) {
    return await invoke("get_navigation_events", { limit });
  },

  async getDomainSequence() {
    return await invoke("get_domain_sequence");
  },

  async analyzePatterns() {
    return await invoke("analyze_patterns");
  },

  // Research session
  async startResearchSession() {
    return await invoke("start_research_session");
  },

  async getCurrentSession() {
    return await invoke("get_current_session");
  },

  async exportResearchData() {
    return await invoke("export_research_data");
  },

  async getLiteratureNotes() {
    return await invoke("get_literature_notes");
  },

  async getResearchQuestions() {
    return await invoke("get_research_questions");
  },

  // Session data
  async saveSessionData(key: string, data: unknown) {
    return await invoke("save_session_data", { key, data });
  },

  async loadSessionData(key: string) {
    return await invoke("load_session_data", { key });
  },

  async clearSessionData() {
    return await invoke("clear_session_data");
  },

  // App info
  async getAppInfo() {
    return await invoke("get_app_info");
  },

  // T3 Measurement: Memory after destroy, app alive
  // This is THE critical measurement for destroy-on-idle effectiveness
  async measureT3(): Promise<{
    memory_mb: number;
    timestamp: number;
    note: string;
  }> {
    // Destroy WebView while keeping app alive
    const destroyed = await this.destroyWebView();
    console.log("WebView destroyed, last URL:", destroyed);

    // Small delay to ensure cleanup
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Measure memory - this is T3
    const memory = await this.getMemorySnapshot();
    console.log("T3 Measurement (memory after destroy):", memory);

    return {
      memory_mb: memory?.combined_rss_mb ?? 0,
      timestamp: memory?.timestamp ?? Date.now(),
      note: "T3: WebView destroyed, application alive - measures memory reclamation effectiveness",
    };
  },

  // Full memory experiment (T1 -> T2 -> T3)
  async runMemoryExperiment(): Promise<{
    t1: number;
    t2: number;
    t3: number;
    difference: number;
    reclamation_ratio: number;
  }> {
    console.log("=== MEMORY EXPERIMENT ===");

    // T1: Baseline (before any navigation, app starts without WebView)
    console.log("Measuring T1 (baseline - no WebView)...");
    const t1 = await this.getMemorySnapshot();
    console.log("T1:", t1.combined_rss_mb, "MB");

    // Navigate to create WebView (T2)
    console.log("Measuring T2 (active browsing)...");
    await this.navigate("https://www.google.com");
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for content load
    const t2 = await this.getMemorySnapshot();
    console.log("T2:", t2.combined_rss_mb, "MB");

    // T3: Destroy WebView while app alive
    console.log("Measuring T3 (WebView destroyed, app alive)...");
    const t3 = await this.measureT3();
    console.log("T3:", t3.memory_mb, "MB");

    const difference = t2.combined_rss_mb - t3.memory_mb;
    const reclamation_ratio = difference / (t2.combined_rss_mb - t1.combined_rss_mb);

    console.log("=== RESULTS ===");
    console.log("Memory freed:", difference.toFixed(1), "MB");
    console.log("Reclamation ratio:", (reclamation_ratio * 100).toFixed(1), "%");

    return {
      t1: t1.combined_rss_mb,
      t2: t2.combined_rss_mb,
      t3: t3.memory_mb,
      difference,
      reclamation_ratio,
    };
  },

  // ── Benchmark: RUN 1 ──────────────────────────────────────────────────────
  // Research question: What is the memory overhead of the lifecycle manager
  // when no eviction is required?
  //
  // Design:
  //   - control:  lifecycle OFF, no eviction attempts
  //   - treatment: lifecycle ON, no eviction attempts
  //   - Multiple independent runs per condition
  //   - Fresh GetProcessInfos() at every sample (no PID caching)
  //   - Metric: RSS (selected as operational definition)
  //
  // See: RUN 0 validation confirms P0 API chain is authoritative.

  async runBenchmarkWorkload(params: {
    tabCount: number;
    urls: string[];
    measurementSeconds: number;
    samplingIntervalMs: number;
    condition: "control" | "treatment";
  }): Promise<BenchmarkResult> {
    const result = (await invoke("run_benchmark_workload", {
      tab_count: params.tabCount,
      urls: params.urls,
      measurement_seconds: params.measurementSeconds,
      sampling_interval_ms: params.samplingIntervalMs,
      condition: params.condition,
    })) as BenchmarkResult;
    return result;
  },

  async getWebview2Snapshot() {
    const result = await invoke("get_webview2_process_snapshot");
    return result as WebView2ProcessSnapshot;
  },
};

// Alias for backwards compatibility
export const browserCommands = browser;

// Research types for TypeScript
// NOTE: All interfaces represent RAW OBSERVATIONS stored in backend
// Analysis labels (like "Programming Context") are derived, not stored
//
// IMPORTANT: On Windows/Tauri, WebView2 runs in the SAME PROCESS as Rust core
// So combined_rss_mb = Rust core + WebView2 (not separate processes)

export interface MemorySnapshot {
  timestamp: number; // Unix timestamp in milliseconds
  // Combined RSS (Rust core + WebView2 - same process on Windows)
  combined_rss_mb: number;
  combined_virt_mb: number;
  // System memory
  total_ram_mb: number; // Total system RAM
  available_ram_mb: number; // Available system RAM
  pressure_level: "low" | "medium" | "high" | "critical";
  pressure_ratio: number; // available / total (0.0 - 1.0)
}

export interface NavigationEvent {
  timestamp: number; // Unix timestamp in milliseconds
  url: string; // Full URL
  domain: string | null; // Extracted domain (null for invalid URLs)
  action: string; // "navigate" | "reload" | "back" | "forward"
  tab_id: string; // Tab identifier
  duration_ms: number | null; // Time on page (null if still on page)
  memory_rss_mb: number | null; // Process RSS at time of navigation
  memory_pressure: string | null; // System pressure at navigation time
}

export interface GapMarker {
  before_idx: number;
  after_idx: number;
  gap_ms: number;
  exceeds_threshold: boolean;
  proposed_reason: string | null; // "temporal_gap" - PROPOSED, not confirmed
}

export interface SequenceLabel {
  sequence_start: number;
  sequence_end: number;
  label: string; // e.g., "Programming" - DERIVED, not observed
  confidence: number; // How confident is the label?
  method: string; // "domain_clustering" | "timeout_boundary" | etc
  evidence: string[]; // URLs supporting this label
}

export interface SequenceAnalysis {
  total_navigations: number;
  unique_domains: number;
  domain_sequence: string[]; // Raw sequence for analysis
  temporal_gaps_ms: number[]; // Gaps between navigations
  gap_markers: GapMarker[]; // Potential boundary markers
  proposed_labels: SequenceLabel[]; // Hypothetical labels (NOT facts)
}

export interface ResearchSession {
  id: string;
  started_at: number;
  ended_at: number | null;
  total_navigations: number;
  gap_markers_count: number;
  analysis_count: number;
}

export interface ResearchExport {
  session: ResearchSession;
  navigation_events: NavigationEvent[]; // Raw observations
  memory_snapshots: MemorySnapshot[]; // Raw observations
  literature_notes: string[]; // Theoretical grounding
  research_questions: string[]; // Hypotheses being tested
}

// WebView Lifecycle Types
export type WebViewState =
  | "Uninitialized"
  | "Creating"
  | "Active"
  | "Idle"
  | "Destroyed"
  | "Restoring";

export interface WebViewStateInfo {
  state: WebViewState;
  idle_seconds: number;
  idle_threshold_seconds: number;
  can_destroy: boolean;
  last_url: string | null;
  last_tab_id: string | null;
}

// Tab Lifecycle Types (P0-3)
// These represent REAL resource lifecycle states, not just boolean flags
export interface TabLifecycleInfo {
  tab_id: string;
  lifecycle_state: TabLifecycleState;
  estimated_memory_mb: number;
  can_suspend: boolean;
  can_evict: boolean;
}

export type TabLifecycleState =
  | "restoring"
  | "active"
  | "visible"
  | "hidden"
  | "suspending"
  | "suspended"
  | "evicting"
  | "evicted"
  | "dead";

// P0: WebView2 Authoritative Process Types
export interface WebView2ProcessInfo {
  pid: number;
  kind: string; // "Browser" | "Renderer" | "GPU" | "Helper"
  memory_mb: number;
}

export interface WebView2ProcessSnapshot {
  timestamp_ms: number;
  environment_found: boolean;
  process_count: number;
  browser_count: number;
  renderer_count: number;
  gpu_count: number;
  helper_count: number;
  total_memory_mb: number;
  processes: WebView2ProcessInfo[];
}

// Benchmark types (RUN 1+)
export interface BenchmarkResult {
  run_id: string;
  workload_id: string;
  tab_count: number;
  peak_memory_mb: number;
  mean_memory_mb: number;
  samples: number[]; // RSS per sample (MB)
  lifecycle_stats: {
    evict_requested: number;
    evict_completed: number;
    evict_failed: number;
    evict_total: number;
  };
  lifecycle_events: unknown[];
  end_time_ms: number;
  duration_ms: number;
}
