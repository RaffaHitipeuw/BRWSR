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

  // Memory tracking (REAL measurements via sysinfo)
  async getMemorySnapshot() {
    return await invoke("get_memory_snapshot");
  },

  async getMemoryHistory() {
    return await invoke("get_memory_history");
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
};

// Alias for backwards compatibility
export const browserCommands = browser;

// Research types for TypeScript
// NOTE: All interfaces represent RAW OBSERVATIONS stored in backend
// Analysis labels (like "Programming Context") are derived, not stored

export interface MemorySnapshot {
  timestamp: number;              // Unix timestamp in milliseconds
  process_rss_mb: number;        // Resident Set Size - actual physical memory
  process_virt_mb: number;       // Virtual memory size
  total_ram_mb: number;          // Total system RAM
  used_ram_mb: number;           // Used system RAM
  available_ram_mb: number;       // Available system RAM
  pressure_level: "low" | "medium" | "high" | "critical";
  pressure_ratio: number;         // available / total (0.0 - 1.0)
}

export interface NavigationEvent {
  timestamp: number;              // Unix timestamp in milliseconds
  url: string;                   // Full URL
  domain: string | null;         // Extracted domain (null for invalid URLs)
  action: string;                // "navigate" | "reload" | "back" | "forward"
  tab_id: string;                // Tab identifier
  duration_ms: number | null;    // Time on page (null if still on page)
  memory_rss_mb: number | null;  // Process RSS at time of navigation
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
  label: string;              // e.g., "Programming" - DERIVED, not observed
  confidence: number;         // How confident is the label?
  method: string;             // "domain_clustering" | "timeout_boundary" | etc
  evidence: string[];         // URLs supporting this label
}

export interface SequenceAnalysis {
  total_navigations: number;
  unique_domains: number;
  domain_sequence: string[];      // Raw sequence for analysis
  temporal_gaps_ms: number[];      // Gaps between navigations
  gap_markers: GapMarker[];        // Potential boundary markers
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
  navigation_events: NavigationEvent[];  // Raw observations
  memory_snapshots: MemorySnapshot[];   // Raw observations
  literature_notes: string[];           // Theoretical grounding
  research_questions: string[];         // Hypotheses being tested
}

// WebView Lifecycle Types
export type WebViewState = "Uninitialized" | "Creating" | "Active" | "Idle" | "Destroyed" | "Restoring";

export interface WebViewStateInfo {
  state: WebViewState;
  idle_seconds: number;
  idle_threshold_seconds: number;
  can_destroy: boolean;
  last_url: string | null;
  last_tab_id: string | null;
}
