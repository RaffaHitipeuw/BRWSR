async function invoke(command: string, args?: Record<string, unknown>) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    console.info(`[NEW_TAB_04] backend invoke about to happen: ${command}`, args);
    console.info(`[NEW_TAB_04] timestamp: ${Date.now()}`);
    const timeoutMs = command === "run_benchmark_workload" ? 180000 : 30000;
    const result = await Promise.race([
      invoke(command, args),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`TIMEOUT: ${command} exceeded ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
    console.info(`[NEW_TAB_05] backend invoke resolved: ${command}`, result);
    console.info(`[NEW_TAB_05] timestamp: ${Date.now()}`);
    return result;
  } catch (err) {
    const errObj = err as { message?: string; name?: string; toString?: () => string } | null;
    console.error(
      `[NEW_TAB_05] backend invoke rejected: ${command}`,
      errObj?.message || String(err),
    );
    console.error(`[NEW_TAB_05] error name:`, errObj?.name);
    console.error(`[NEW_TAB_05] timestamp: ${Date.now()}`);
    if (err && typeof err === "object") {
      console.error(`[NEW_TAB_05] Error keys:`, Object.keys(err));
      for (const key of Object.keys(err as object)) {
        console.error(`  ${key}:`, (err as Record<string, unknown>)[key]);
      }
    }
    return null;
  }
}

export const browser = {
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

  async minimize() {
    return await invoke("minimize_window");
  },

  async toggleMaximize() {
    return await invoke("toggle_maximize");
  },

  async raiseBrowserZorder() {
    return await invoke("raise_browser_zorder");
  },

  async close() {
    return await invoke("close_window");
  },

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

  async getMemorySnapshot() {
    return await invoke("get_memory_snapshot");
  },

  async getMemoryHistory() {
    return await invoke("get_memory_history");
  },

  async getWebview2ProcessSnapshot(): Promise<WebView2ProcessSnapshot | null> {
    return (await invoke("get_webview2_process_snapshot")) as WebView2ProcessSnapshot | null;
  },

  async getNavigationEvents(limit?: number) {
    return await invoke("get_navigation_events", { limit });
  },

  async getDomainSequence() {
    return await invoke("get_domain_sequence");
  },

  async analyzePatterns() {
    return await invoke("analyze_patterns");
  },

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

  async saveSessionData(key: string, data: unknown) {
    return await invoke("save_session_data", { key, data });
  },

  async loadSessionData(key: string) {
    return await invoke("load_session_data", { key });
  },

  async clearSessionData() {
    return await invoke("clear_session_data");
  },

  async getAppInfo() {
    return await invoke("get_app_info");
  },

  async measureT3(): Promise<{
    memory_mb: number;
    timestamp: number;
    note: string;
  }> {
    const destroyed = await this.destroyWebView();
    console.log("WebView destroyed, last URL:", destroyed);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const memory = await this.getMemorySnapshot();
    console.log("T3 Measurement (memory after destroy):", memory);

    return {
      memory_mb: memory?.combined_rss_mb ?? 0,
      timestamp: memory?.timestamp ?? Date.now(),
      note: "T3: WebView destroyed, application alive - measures memory reclamation effectiveness",
    };
  },

  async runMemoryExperiment(): Promise<{
    t1: number;
    t2: number;
    t3: number;
    difference: number;
    reclamation_ratio: number;
  }> {
    console.log("=== MEMORY EXPERIMENT ===");

    console.log("Measuring T1 (baseline - no WebView)...");
    const t1 = await this.getMemorySnapshot();
    console.log("T1:", t1.combined_rss_mb, "MB");

    console.log("Measuring T2 (active browsing)...");
    await this.navigate("https://www.google.com");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const t2 = await this.getMemorySnapshot();
    console.log("T2:", t2.combined_rss_mb, "MB");

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

  async saveBenchmarkResults(data: unknown) {
    await invoke("save_benchmark_results", { data });
  },

  async exitApp() {
    await invoke("exit_app");
  },

  async isBenchmarkMode() {
    return (await invoke("is_benchmark_mode")) as boolean;
  },

  async testCommand(message: string): Promise<string | null> {
    return (await invoke("test_command", { message })) as string | null;
  },

  async testLongCommand(seconds: number): Promise<string | null> {
    console.info("[browserCommands] testLongCommand called:", seconds);
    try {
      const result = await invoke("test_long_command", { seconds });
      console.info("[browserCommands] testLongCommand result:", result);
      return result as string | null;
    } catch (e) {
      console.error("[browserCommands] testLongCommand exception:", e);
      return null;
    }
  },

  async testBenchmarkQuick(tabCount: number, condition: string): Promise<unknown | null> {
    console.info("[browserCommands] testBenchmarkQuick called:", tabCount, condition);
    try {
      const result = await invoke("test_benchmark_quick", { tab_count: tabCount, condition });
      console.info("[browserCommands] testBenchmarkQuick result:", result);
      return result;
    } catch (e) {
      console.error("[browserCommands] testBenchmarkQuick exception:", e);
      return null;
    }
  },

  async getWebview2Snapshot() {
    const result = await invoke("get_webview2_process_snapshot");
    return result as WebView2ProcessSnapshot;
  },
};

export const browserCommands = browser;

export interface MemorySnapshot {
  timestamp: number;
  combined_rss_mb: number;
  combined_virt_mb: number;
  total_ram_mb: number;
  available_ram_mb: number;
  pressure_level: "low" | "medium" | "high" | "critical";
  pressure_ratio: number;
}

export interface NavigationEvent {
  timestamp: number;
  url: string;
  domain: string | null;
  action: string;
  tab_id: string;
  duration_ms: number | null;
  memory_rss_mb: number | null;
  memory_pressure: string | null;
}

export interface GapMarker {
  before_idx: number;
  after_idx: number;
  gap_ms: number;
  exceeds_threshold: boolean;
  proposed_reason: string | null;
}

export interface SequenceLabel {
  sequence_start: number;
  sequence_end: number;
  label: string;
  confidence: number;
  method: string;
  evidence: string[];
}

export interface SequenceAnalysis {
  total_navigations: number;
  unique_domains: number;
  domain_sequence: string[];
  temporal_gaps_ms: number[];
  gap_markers: GapMarker[];
  proposed_labels: SequenceLabel[];
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
  navigation_events: NavigationEvent[];
  memory_snapshots: MemorySnapshot[];
  literature_notes: string[];
  research_questions: string[];
}

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

export interface WebView2ProcessInfo {
  pid: number;
  kind: string;
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

export interface BenchmarkResult {
  run_id: string;
  workload_id: string;
  tab_count: number;
  peak_memory_mb: number;
  mean_memory_mb: number;
  samples: number[];
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
