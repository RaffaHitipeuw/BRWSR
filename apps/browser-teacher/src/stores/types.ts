
export type MemoryPressureLevel = "low" | "medium" | "high" | "critical";

export type TabPriority = "active" | "pinned" | "recent" | "idle" | "stale";

export type TabLifecycleState =
  | "active"
  | "visible"
  | "hidden"
  | "evicting"
  | "evicted"
  | "restoring"
  | "dead";

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

  estimated_memory_mb: number;

  lifecycle_state: TabLifecycleState;

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

export interface ObservedMemory {
  combined_rss_mb: number;
  combined_virt_mb: number;

  system_total_mb: number;
  system_available_mb: number;
  pressure_ratio: number;
  pressure_level: MemoryPressureLevel;
  timestamp: number;
}

export interface EstimatedTabHint {
  tab_id: string;
  estimated_memory_mb: number;
  declared_cost_mb: number;
  last_accessed: number;
  priority: TabPriority;
}

export interface MeasuredOverhead {
  name: string;
  measured_memory_mb: number | null;
  measured_startup_ms: number | null;
  declared_memory_mb: number;
  declared_startup_ms: number;
  timestamp: number | null;
}

export interface LifecycleSnapshot {
  tab_id: string;
  action: "evict" | "restore";
  rss_before_mb: number;
  rss_after_mb: number;
  timestamp: number;
  delta_mb: number;
}


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


export interface LifecycleEvent {
  event_id: string;
  sequence: number;
  timestamp_ms: number;

  benchmark_run_id: string | null;
  workload_id: string | null;
  condition: string | null;

  event_type: LifecycleEventType;
  tab_id: string;

  previous_state: string;
  new_state: string;

  pressure_level: string;
  reason: string;

  process_before: ProcessStateSnapshot;
  process_after: ProcessStateSnapshot;

  memory_delta_mb: number;
  processes_added: ProcessIdentity[];
  processes_removed: ProcessIdentity[];

  action_succeeded: boolean;
  
  state_transition_effective: boolean;
  
  memory_reclaimed: boolean;
  
  process_group_changed: boolean;

  summary: string;
}


export interface LifecycleEventTrace {
  run_id: string;
  events: LifecycleEvent[];

  total_events: number;
  evict_requested: number;
  evict_completed: number;
  evict_failed: number;
  restore_requested: number;
  restore_completed: number;
  restore_failed: number;

  action_success_rate: number;
  state_transition_rate: number;
  memory_reclamation_rate: number;
  process_change_rate: number;
}
