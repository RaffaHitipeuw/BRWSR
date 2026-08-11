// Shared Types - EduOS Browser
// This file contains types used by both tabStore and memoryManager
// to avoid circular dependencies

export type MemoryPressureLevel = "low" | "medium" | "high" | "critical";

export type TabPriority = "active" | "pinned" | "recent" | "idle" | "stale";

export type TabLifecycleState =
  | "active" // User interacting, WebView visible
  | "visible" // WebView alive
  | "hidden" // WebView hidden (marginal savings)
  | "evicting" // WebView being destroyed
  | "evicted" // WebView destroyed, tab metadata preserved
  | "restoring" // WebView being recreated
  | "dead"; // Tab closed

export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  history: string[];
  historyIndex: number;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isPinned: boolean;
  isMuted: boolean;
  createdAt: number;
  lastAccessedAt: number;

  // Estimated memory hint (NOT measured)
  estimated_memory_mb: number;

  // LIFECYCLE STATE (separate from renderer)
  lifecycle_state: TabLifecycleState;

  // Restoration metadata (P0-4)
  scroll_position?: number;
  form_data?: Record<string, string>;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
  isCollapsed: boolean;
}

// OBSERVED: What we MEASURE from sysinfo
// NOTE: On Tauri/Windows, WebView2 is in-process, so this is COMBINED RSS
export interface ObservedMemory {
  // Combined RSS (Rust core + WebView2 - same process on Windows)
  combined_rss_mb: number;
  combined_virt_mb: number;

  // System memory
  system_total_mb: number;
  system_available_mb: number;
  pressure_ratio: number; // available / total
  pressure_level: MemoryPressureLevel;
  timestamp: number;
}

// ESTIMATED: Heuristic hints for decisions (NOT measurements)
export interface EstimatedTabHint {
  tab_id: string;
  estimated_memory_mb: number; // HEURISTIC, not measured
  declared_cost_mb: number; // What we CLAIM the cost is
  last_accessed: number;
  priority: TabPriority;
}

// MEASURED: Actual benchmark results (P0-6)
export interface MeasuredOverhead {
  name: string;
  measured_memory_mb: number | null; // null if not yet measured
  measured_startup_ms: number | null; // null if not yet measured
  declared_memory_mb: number; // What we claimed
  declared_startup_ms: number; // What we claimed
  timestamp: number | null;
}

// LIFECYCLE PROOF TYPES (P0 Validation)
export interface LifecycleSnapshot {
  tab_id: string;
  action: "evict" | "restore";
  rss_before_mb: number;
  rss_after_mb: number;
  timestamp: number;
  delta_mb: number; // rss_after - rss_before
}

// ─── LIFECYCLE EVENT TYPES (P0: Causal Observability) ──────────────────────

export type LifecycleEventType =
  | "evict_requested"
  | "evict_completed"
  | "evict_failed"
  | "restore_requested"
  | "restore_completed"
  | "restore_failed"
  | "suspend_requested"
  | "suspend_completed"
  | "suspend_failed";

export interface ProcessIdentity {
  pid: number;
  start_time: number;
  name: string;
}

export interface ProcessStateSnapshot {
  timestamp_ms: number;
  group_memory_mb: number;
  process_count: number;
  processes: ProcessIdentity[];
}

/**
 * Lifecycle Event - captures FULL causal chain for eviction/restore actions.
 *
 * IMPORTANT SEPARATIONS:
 * - action_succeeded: command completed without error
 * - state_transition_effective: state actually changed
 * - memory_reclaimed: significant memory decrease (>5MB)
 * - process_group_changed: processes were added/removed
 *
 * These are SEPARATE concerns. A lifecycle action can succeed but:
 * - State transition may not be effective (e.g., already in target state)
 * - Memory may not be reclaimed (WebView2 process sharing)
 * - Process group may not change (process reuse)
 */
export interface LifecycleEvent {
  // Identity
  event_id: string;
  sequence: number; // For ordering (events may arrive out-of-order via async)
  timestamp_ms: number;

  // Benchmark correlation
  benchmark_run_id: string | null;
  workload_id: string | null;
  condition: string | null; // "control" or "treatment"

  // Classification
  event_type: LifecycleEventType;
  tab_id: string;

  // State transition
  previous_state: string;
  new_state: string;

  // Context
  pressure_level: string;
  reason: string;

  // Process group state BEFORE action
  process_before: ProcessStateSnapshot;
  // Process group state AFTER action
  process_after: ProcessStateSnapshot;

  // DELTA - what changed
  memory_delta_mb: number;
  processes_added: ProcessIdentity[];
  processes_removed: ProcessIdentity[];

  // Outcome assessments (SEPARATE concerns)
  action_succeeded: boolean;
  /** State transition occurred AND webview was affected */
  state_transition_effective: boolean;
  /** Memory decreased by >5MB after action */
  memory_reclaimed: boolean;
  /** Process group changed (processes added/removed) */
  process_group_changed: boolean;

  // Human-readable summary
  summary: string;
}

/**
 * Event trace for a benchmark run
 * Captures all lifecycle events for causal analysis
 */
export interface LifecycleEventTrace {
  run_id: string;
  events: LifecycleEvent[];

  // Aggregate stats
  total_events: number;
  evict_requested: number;
  evict_completed: number;
  evict_failed: number;
  restore_requested: number;
  restore_completed: number;
  restore_failed: number;

  // Effectiveness analysis
  action_success_rate: number;
  state_transition_rate: number;
  memory_reclamation_rate: number;
  process_change_rate: number;
}
