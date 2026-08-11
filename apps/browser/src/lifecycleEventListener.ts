// Lifecycle Event Listener - Captures causal observability data
//
// This module integrates with the Rust backend's LifecycleEventStore
// via Tauri commands for benchmark correlation.
//
// CRITICAL SEPARATIONS:
// 1. Did the lifecycle action execute? → action_succeeded
// 2. Did the WebView actually transition state? → state_transition_effective
// 3. Did the WebView2 process group change? → process_group_changed
// 4. Did memory actually change? → memory_reclaimed
//
// These are SEPARATE concerns and must NOT be conflated.

import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { LifecycleEvent, LifecycleEventTrace, LifecycleEventType } from "./stores/types";

/**
 * Event listener state
 */
let unlistenEvict: UnlistenFn | null = null;
let unlistenRestore: UnlistenFn | null = null;
let events: LifecycleEvent[] = [];
let currentRunId: string = "";

/**
 * Start a benchmark run - clears previous events and sets correlation ID
 */
export async function startBenchmarkRun(
  runId: string,
  workloadId: string,
  runIndex: number,
  condition: "control" | "treatment",
): Promise<void> {
  currentRunId = runId;
  events = [];

  // Start the benchmark run in Rust backend with full metadata
  await invoke("start_benchmark_run", {
    runId,
    workloadId,
    runIndex,
    condition,
  });

  // Start listening for lifecycle events
  await startLifecycleEventListener();

  console.log(
    `[Lifecycle Listener] Benchmark run started: ${runId} / ${workloadId} / ${condition}`,
  );
}

/**
 * End the current benchmark run and get statistics with metadata
 */
export async function endBenchmarkRun(): Promise<{
  metadata: BenchmarkMetadata;
  stats: LifecycleEventStats;
  eventCount: number;
  endTimeMs: number;
  durationMs: number;
  trace: LifecycleEventTrace;
}> {
  // Stop listening
  stopLifecycleEventListener();

  // Get result from backend (includes metadata)
  const result = await invoke<BenchmarkRunResult>("end_benchmark_run");

  // Get full event trace
  const trace = buildEventTrace();

  console.log(
    `[Lifecycle Listener] Benchmark run ended: ${result.stats.total_events} events in ${result.duration_ms}ms`,
  );

  return {
    metadata: result.metadata,
    stats: result.stats,
    eventCount: result.event_count,
    endTimeMs: result.end_time_ms,
    durationMs: result.duration_ms,
    trace,
  };
}

/**
 * Benchmark metadata from backend
 */
interface BenchmarkMetadata {
  run_id: string;
  workload_id: string;
  run_index: number;
  condition: string;

  os: string;
  os_version: string;
  cpu_brand: string;
  cpu_count: number;
  ram_mb: number;
  webview2_version: string | null;

  app_version: string;
  build_type: string;

  idle_threshold_secs: number;
  memory_pressure_thresholds: PressureThresholds;

  start_time_ms: number;
  end_time_ms: number | null;
  duration_ms: number | null;
}

interface PressureThresholds {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

/**
 * Benchmark run result from backend
 */
interface BenchmarkRunResult {
  metadata: BenchmarkMetadata;
  stats: LifecycleEventStats;
  event_count: number;
  end_time_ms: number;
  duration_ms: number;
}

/**
 * Get all recorded lifecycle events from backend
 */
export async function getLifecycleEvents(): Promise<LifecycleEvent[]> {
  return await invoke<LifecycleEvent[]>("get_lifecycle_events");
}

/**
 * Start listening for lifecycle events from Tauri
 */
async function startLifecycleEventListener(): Promise<void> {
  // Listen for eviction events
  unlistenEvict = await listen<LifecycleEvent>("lifecycle:evict_requested", (event) => {
    console.log("[Lifecycle Event]", event.payload.event_type, event.payload.summary);
    events.push(event.payload);
  });

  await listen<LifecycleEvent>("lifecycle:evict_completed", (event) => {
    console.log("[Lifecycle Event]", event.payload.event_type, event.payload.summary);
    events.push(event.payload);
  });

  await listen<LifecycleEvent>("lifecycle:evict_failed", (event) => {
    console.log("[Lifecycle Event]", event.payload.event_type, event.payload.summary);
    events.push(event.payload);
  });

  // Listen for restore events
  await listen<LifecycleEvent>("lifecycle:restore_requested", (event) => {
    console.log("[Lifecycle Event]", event.payload.event_type, event.payload.summary);
    events.push(event.payload);
  });

  await listen<LifecycleEvent>("lifecycle:restore_completed", (event) => {
    console.log("[Lifecycle Event]", event.payload.event_type, event.payload.summary);
    events.push(event.payload);
  });

  await listen<LifecycleEvent>("lifecycle:restore_failed", (event) => {
    console.log("[Lifecycle Event]", event.payload.event_type, event.payload.summary);
    events.push(event.payload);
  });

  console.log("[Lifecycle Listener] Started for run:", currentRunId);
}

/**
 * Stop listening for lifecycle events
 */
export function stopLifecycleEventListener(): void {
  if (unlistenEvict) {
    unlistenEvict();
    unlistenEvict = null;
  }
  if (unlistenRestore) {
    unlistenRestore();
    unlistenRestore = null;
  }
  console.log("[Lifecycle Listener] Stopped");
}

/**
 * Get current event trace (local cache)
 */
export function getEventTrace(): LifecycleEvent[] {
  return [...events];
}

/**
 * Build a summary trace for benchmark output
 */
export function buildEventTrace(): LifecycleEventTrace {
  const counts: Record<LifecycleEventType, number> = {
    evict_requested: 0,
    evict_completed: 0,
    evict_failed: 0,
    restore_requested: 0,
    restore_completed: 0,
    restore_failed: 0,
    suspend_requested: 0,
    suspend_completed: 0,
    suspend_failed: 0,
  };

  let actionSuccessCount = 0;
  let stateTransitionCount = 0;
  let memoryReclaimedCount = 0;
  let processChangeCount = 0;

  for (const event of events) {
    // Count by type
    if (event.event_type in counts) {
      counts[event.event_type as LifecycleEventType]++;
    }

    // Count effectiveness
    if (event.action_succeeded) actionSuccessCount++;
    if (event.state_transition_effective) stateTransitionCount++;
    if (event.memory_reclaimed) memoryReclaimedCount++;
    if (event.process_group_changed) processChangeCount++;
  }

  const total = events.length || 1;

  return {
    run_id: currentRunId,
    events: [...events],
    total_events: events.length,
    evict_requested: counts.evict_requested,
    evict_completed: counts.evict_completed,
    evict_failed: counts.evict_failed,
    restore_requested: counts.restore_requested,
    restore_completed: counts.restore_completed,
    restore_failed: counts.restore_failed,
    action_success_rate: actionSuccessCount / total,
    state_transition_rate: stateTransitionCount / total,
    memory_reclamation_rate: memoryReclaimedCount / total,
    process_change_rate: processChangeCount / total,
  };
}

/**
 * Lifecycle event statistics from backend
 */
interface LifecycleEventStats {
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

/**
 * Analyze a single event for benchmark reporting
 */
export function analyzeEvent(event: LifecycleEvent): {
  actionExecuted: boolean;
  stateTransitionOccurred: boolean;
  processGroupChanged: boolean;
  memoryChanged: boolean;
  interpretation: string;
} {
  const interpretationParts: string[] = [];

  // 1. Did the action execute?
  const actionExecuted = event.action_succeeded;
  interpretationParts.push(actionExecuted ? "Action succeeded" : "Action failed");

  // 2. Did state transition?
  const stateTransitionOccurred = event.state_transition_effective;
  if (stateTransitionOccurred) {
    interpretationParts.push(`State: ${event.previous_state} → ${event.new_state}`);
  } else {
    interpretationParts.push(`No state change (${event.previous_state} → ${event.new_state})`);
  }

  // 3. Process group
  const processGroupChanged = event.process_group_changed;
  if (event.processes_removed.length > 0) {
    interpretationParts.push(`${event.processes_removed.length} processes terminated`);
  }
  if (event.processes_added.length > 0) {
    interpretationParts.push(`${event.processes_added.length} processes added`);
  }
  if (!processGroupChanged) {
    interpretationParts.push("Process group unchanged");
  }

  // 4. Memory
  const memoryChanged = event.memory_reclaimed;
  interpretationParts.push(
    `Memory: ${event.memory_delta_mb > 0 ? "+" : ""}${event.memory_delta_mb.toFixed(1)} MB`,
  );

  return {
    actionExecuted,
    stateTransitionOccurred,
    processGroupChanged,
    memoryChanged,
    interpretation: interpretationParts.join(" | "),
  };
}

/**
 * Prove causal chain for a single eviction event
 */
export function proveCausalChain(events: LifecycleEvent[]): {
  hasRequested: boolean;
  hasCompleted: boolean;
  chainValid: boolean;
  evidence: CausalChainEvidence;
} {
  const evictRequested = events.filter((e) => e.event_type === "evict_requested");
  const evictCompleted = events.filter((e) => e.event_type === "evict_completed");

  const hasRequested = evictRequested.length > 0;
  const hasCompleted = evictCompleted.length > 0;

  // Chain is valid if we have a request followed by completion
  const chainValid =
    hasRequested && hasCompleted && evictCompleted[0].timestamp_ms > evictRequested[0].timestamp_ms;

  // Build evidence
  const evidence: CausalChainEvidence = {
    requestTimestamp: evictRequested[0]?.timestamp_ms ?? null,
    completedTimestamp: evictCompleted[0]?.timestamp_ms ?? null,
    tabId: evictRequested[0]?.tab_id ?? evictCompleted[0]?.tab_id ?? null,
    previousState: evictRequested[0]?.previous_state ?? null,
    newState: evictCompleted[0]?.new_state ?? null,
    memoryDelta: evictCompleted[0]?.memory_delta_mb ?? null,
    processesRemoved: evictCompleted[0]?.processes_removed.length ?? 0,
    stateTransitionEffective: evictCompleted[0]?.state_transition_effective ?? false,
    memoryReclaimed: evictCompleted[0]?.memory_reclaimed ?? false,
    processGroupChanged: evictCompleted[0]?.process_group_changed ?? false,
  };

  return { hasRequested, hasCompleted, chainValid, evidence };
}

interface CausalChainEvidence {
  requestTimestamp: number | null;
  completedTimestamp: number | null;
  tabId: string | null;
  previousState: string | null;
  newState: string | null;
  memoryDelta: number | null;
  processesRemoved: number;
  stateTransitionEffective: boolean;
  memoryReclaimed: boolean;
  processGroupChanged: boolean;
}
