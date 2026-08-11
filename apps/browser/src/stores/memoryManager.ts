// Memory Management System - EduOS Browser
//
// P0 EMPIRICAL VALIDATION - Honest Architecture
//
// IMPORTANT REALITY NOTES (from benchmark attack):
// 1. WebView2 on Windows runs in SAME PROCESS as Rust core
//    - So "combined_rss_mb" = browser_core + webview combined
//    - There is NO separate "webview_rss_mb" on Tauri/Windows
//
// 2. WebView2 does NOT have a suspend API
//    - The only way to reduce memory is WebView.close()
//    - "Suspend" in our architecture means: close WebView, preserve tab metadata
//    - "Evict" means: fully release resources, tab needs full restore
//
// 3. Claim terminology:
//    - "Memory-pressure-aware tab lifecycle" = MECHANISM claim
//    - "Under X tabs, RSS decreased by Y%" = BENCHMARK claim (needs proof)

import { create } from "zustand";
import { browser } from "../components/browserCommands";
import type {
  ObservedMemory,
  EstimatedTabHint,
  MeasuredOverhead,
  MemoryPressureLevel,
  TabPriority,
  LifecycleSnapshot,
} from "./types";

// Re-export types
export type {
  ObservedMemory,
  EstimatedTabHint,
  MeasuredOverhead,
  MemoryPressureLevel,
  TabPriority,
  Tab,
  TabLifecycleState,
  LifecycleSnapshot,
} from "./types";

// ─── HYSTERESIS STATE (P0-3) ────────────────────────────────────────────────

interface HysteresisState {
  last_action: "evict" | "restore" | null;
  last_action_time: number;
  cooldown_ms: number;
  sustained_samples: number;
  required_sustained: number;
}

const HYSTERESIS = {
  cooldown_ms: 5000,
  required_sustained: 3,
};

// ─── RACE CONDITION PROTECTION ──────────────────────────────────────────────

interface LifecycleOperation {
  id: string;
  tab_id: string;
  action: "evict" | "restore";
  generation: number;
  cancelled: boolean;
}

let lifecycle_generation = 0;
const active_operations = new Map<string, LifecycleOperation>();

function start_operation(tab_id: string, action: "evict" | "restore"): LifecycleOperation {
  lifecycle_generation++;
  const op: LifecycleOperation = {
    id: `${tab_id}-${Date.now()}-${lifecycle_generation}`,
    tab_id,
    action,
    generation: lifecycle_generation,
    cancelled: false,
  };
  active_operations.set(tab_id, op);
  return op;
}

function cancel_operation(tab_id: string): void {
  const op = active_operations.get(tab_id);
  if (op) {
    op.cancelled = true;
    active_operations.delete(tab_id);
  }
}

function complete_operation(tab_id: string, expected_generation: number): boolean {
  const op = active_operations.get(tab_id);
  if (!op) return false;

  if (op.cancelled || op.generation !== expected_generation) {
    active_operations.delete(tab_id);
    return false;
  }

  active_operations.delete(tab_id);
  return true;
}

// ─── MEMORY MANAGER STORE ──────────────────────────────────────────────────

interface MemoryManagerState {
  // OBSERVED values (from sysinfo)
  observed: ObservedMemory | null;

  // ESTIMATED hints (per-tab)
  tab_hints: Map<string, EstimatedTabHint>;

  // MEASURED overhead (P0-6)
  measured_overhead: Map<string, MeasuredOverhead>;

  // EMPIRICAL PROOF: Lifecycle snapshots (P0-1)
  lifecycle_snapshots: LifecycleSnapshot[];

  // HYSTERESIS state (P0-3)
  hysteresis: HysteresisState;

  // Config
  max_tabs: number;
  estimated_per_tab_mb: number;

  // Pressure thresholds
  low_threshold: number;
  medium_threshold: number;
  high_threshold: number;
  critical_threshold: number;

  // Budget for restore
  restore_budget_mb: number;

  // Actions
  updateObserved: (observed: ObservedMemory) => void;
  updateTabHint: (tab_id: string, hint: Partial<EstimatedTabHint>) => void;
  removeTabHint: (tab_id: string) => void;
  setMaxTabs: (max: number) => void;

  // Lifecycle with empirical proof
  recordLifecycleAction: (
    tab_id: string,
    action: "evict" | "restore",
    rss_before_mb: number,
    rss_after_mb: number,
  ) => void;
  getLifecycleProof: () => LifecycleSnapshot[];

  // Hysteresis-protected decisions
  canPerformAction: (action: "evict" | "restore") => boolean;
  recordAction: (action: "evict" | "restore") => void;

  // Budget-aware decisions
  canRestoreTab: (tab_id: string) => boolean;
  getTabsToEvict: () => string[];

  // Measured overhead
  recordMeasuredOverhead: (name: string, memory_mb: number, startup_ms: number) => void;
  getMeasuredOverhead: () => MeasuredOverhead[];
}

const PRESSURE_THRESHOLDS = {
  low: 0.5,
  medium: 0.2,
  high: 0.1,
  critical: 0.0,
};

const DEFAULT_ESTIMATED_PER_TAB_MB = 50;

export const useMemoryManager = create<MemoryManagerState>()((set, get) => ({
  observed: null,
  tab_hints: new Map(),
  measured_overhead: new Map(),
  lifecycle_snapshots: [],
  hysteresis: {
    last_action: null,
    last_action_time: 0,
    cooldown_ms: HYSTERESIS.cooldown_ms,
    sustained_samples: 0,
    required_sustained: HYSTERESIS.required_sustained,
  },
  max_tabs: 10,
  estimated_per_tab_mb: DEFAULT_ESTIMATED_PER_TAB_MB,
  low_threshold: PRESSURE_THRESHOLDS.low,
  medium_threshold: PRESSURE_THRESHOLDS.medium,
  high_threshold: PRESSURE_THRESHOLDS.high,
  critical_threshold: PRESSURE_THRESHOLDS.critical,
  restore_budget_mb: 100,

  updateObserved: (observed) => {
    set((state) => {
      const current_pressure = observed.pressure_level;
      const prev_hysteresis = state.hysteresis;

      let new_sustained = prev_hysteresis.sustained_samples;
      if (current_pressure === "low") {
        new_sustained = prev_hysteresis.sustained_samples + 1;
      } else {
        new_sustained = 0;
      }

      return {
        observed,
        hysteresis: {
          ...prev_hysteresis,
          sustained_samples: new_sustained,
        },
      };
    });
  },

  updateTabHint: (tab_id, hint) => {
    set((state) => {
      const new_hints = new Map(state.tab_hints);
      const existing = new_hints.get(tab_id) || {
        tab_id,
        estimated_memory_mb: DEFAULT_ESTIMATED_PER_TAB_MB,
        declared_cost_mb: DEFAULT_ESTIMATED_PER_TAB_MB,
        last_accessed: Date.now(),
        priority: "idle" as TabPriority,
      };
      new_hints.set(tab_id, { ...existing, ...hint });
      return { tab_hints: new_hints };
    });
  },

  removeTabHint: (tab_id) => {
    set((state) => {
      const new_hints = new Map(state.tab_hints);
      new_hints.delete(tab_id);
      return { tab_hints: new_hints };
    });
  },

  setMaxTabs: (max) => set({ max_tabs: max }),

  // P0-1: Record lifecycle action with RSS measurements
  recordLifecycleAction: (tab_id, action, rss_before_mb, rss_after_mb) => {
    const snapshot: LifecycleSnapshot = {
      tab_id,
      action,
      rss_before_mb,
      rss_after_mb,
      timestamp: Date.now(),
      delta_mb: rss_after_mb - rss_before_mb,
    };

    set((state) => ({
      lifecycle_snapshots: [...state.lifecycle_snapshots.slice(-100), snapshot],
    }));

    console.log(
      `[LIFECYCLE PROOF] ${action} ${tab_id}: RSS ${rss_before_mb.toFixed(1)}MB -> ${rss_after_mb.toFixed(1)}MB (delta=${snapshot.delta_mb >= 0 ? "+" : ""}${snapshot.delta_mb.toFixed(1)}MB)`,
    );
  },

  getLifecycleProof: () => get().lifecycle_snapshots,

  // P0-3: Hysteresis-protected action check
  canPerformAction: (action) => {
    const state = get();
    const { hysteresis, observed } = state;

    const now = Date.now();
    if (
      hysteresis.last_action_time > 0 &&
      now - hysteresis.last_action_time < hysteresis.cooldown_ms
    ) {
      console.log(
        `[HYSTERESIS] Action blocked: cooldown active (${hysteresis.cooldown_ms - (now - hysteresis.last_action_time)}ms remaining)`,
      );
      return false;
    }

    // Recovery requires sustained low pressure
    if (action === "restore") {
      if (hysteresis.sustained_samples < hysteresis.required_sustained) {
        console.log(
          `[HYSTERESIS] Restore blocked: need ${hysteresis.required_sustained} sustained low-pressure samples, have ${hysteresis.sustained_samples}`,
        );
        return false;
      }
    }

    // Aggressive actions during critical pressure always allowed
    if (observed?.pressure_level === "critical" && action === "evict") {
      return true;
    }

    return true;
  },

  recordAction: (action) => {
    set((state) => ({
      hysteresis: {
        ...state.hysteresis,
        last_action: action,
        last_action_time: Date.now(),
        sustained_samples: 0,
      },
    }));
  },

  canRestoreTab: (_tab_id) => {
    const state = get();
    const { observed, restore_budget_mb } = state;

    if (!observed) return true;

    const remaining_budget = restore_budget_mb - observed.combined_rss_mb;
    const tab_cost = state.estimated_per_tab_mb;

    return remaining_budget >= tab_cost;
  },

  getTabsToEvict: () => {
    const state = get();
    const { observed, tab_hints } = state;

    if (!observed) return [];
    if (observed.pressure_level !== "critical" && observed.pressure_level !== "high") return [];

    const tabs_to_evict: string[] = [];

    tab_hints.forEach((hint, tab_id) => {
      if (hint.priority === "pinned" || hint.priority === "active") return;

      if (
        observed.pressure_level === "critical" ||
        (observed.pressure_level === "high" && hint.priority === "stale")
      ) {
        tabs_to_evict.push(tab_id);
      }
    });

    return tabs_to_evict;
  },

  recordMeasuredOverhead: (name, memory_mb, startup_ms) => {
    set((state) => {
      const new_overhead = new Map(state.measured_overhead);
      const existing = new_overhead.get(name) || {
        name,
        measured_memory_mb: null,
        measured_startup_ms: null,
        declared_memory_mb: 0,
        declared_startup_ms: 0,
        timestamp: null,
      };

      new_overhead.set(name, {
        ...existing,
        measured_memory_mb: memory_mb,
        measured_startup_ms: startup_ms,
        timestamp: Date.now(),
      });

      return { measured_overhead: new_overhead };
    });
  },

  getMeasuredOverhead: () => Array.from(get().measured_overhead.values()),
}));

// ─── LIFECYCLE OPERATIONS WITH RACE CONDITION PROTECTION ────────────────────

export async function evictTabWithProof(tab_id: string): Promise<boolean> {
  const memory_manager = useMemoryManager.getState();
  const rss_before = memory_manager.observed?.combined_rss_mb ?? 0;

  const op = start_operation(tab_id, "evict");

  try {
    if (!memory_manager.canPerformAction("evict")) {
      cancel_operation(tab_id);
      return false;
    }

    await browser.evictTab(tab_id);

    // Wait for OS to release memory
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Measure RSS after
    const snapshot = (await browser.getMemorySnapshot()) as { combined_rss_mb?: number } | null;
    const rss_after = snapshot?.combined_rss_mb ?? 0;

    if (complete_operation(tab_id, op.generation)) {
      memory_manager.recordLifecycleAction(tab_id, "evict", rss_before, rss_after);
      memory_manager.recordAction("evict");
    } else {
      console.log(`[RACE CONDITION] Evict operation for ${tab_id} was superseded`);
    }

    return true;
  } catch (error) {
    cancel_operation(tab_id);
    throw error;
  }
}

export async function restoreTabWithProof(tab_id: string): Promise<boolean> {
  const memory_manager = useMemoryManager.getState();
  const rss_before = memory_manager.observed?.combined_rss_mb ?? 0;

  if (!memory_manager.canRestoreTab(tab_id)) {
    console.log(`[BUDGET] Cannot restore ${tab_id}: memory budget exceeded`);
    return false;
  }

  const op = start_operation(tab_id, "restore");

  try {
    if (!memory_manager.canPerformAction("restore")) {
      cancel_operation(tab_id);
      return false;
    }

    await browser.restoreTab(tab_id);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const snapshot = (await browser.getMemorySnapshot()) as { combined_rss_mb?: number } | null;
    const rss_after = snapshot?.combined_rss_mb ?? 0;

    if (complete_operation(tab_id, op.generation)) {
      memory_manager.recordLifecycleAction(tab_id, "restore", rss_before, rss_after);
      memory_manager.recordAction("restore");
    } else {
      console.log(`[RACE CONDITION] Restore operation for ${tab_id} was superseded`);
    }

    return true;
  } catch (error) {
    cancel_operation(tab_id);
    throw error;
  }
}

// ─── EMPIRICAL BENCHMARK ────────────────────────────────────────────────────

export async function runLifecycleBenchmark(): Promise<{
  evict_delta_mb: number;
  restore_delta_mb: number;
  evict_proof: LifecycleSnapshot[];
}> {
  const memory_manager = useMemoryManager.getState();

  console.log("=== LIFECYCLE BENCHMARK ===");

  const initial_rss = memory_manager.observed?.combined_rss_mb ?? 0;
  console.log(`Initial RSS: ${initial_rss.toFixed(1)}MB`);

  console.log("Benchmarking evict...");
  await evictTabWithProof("benchmark-tab");

  const tabs_to_evict = memory_manager.getTabsToEvict();
  console.log(`Tabs to evict: ${tabs_to_evict.length}`);

  console.log("Benchmarking restore...");
  await restoreTabWithProof("benchmark-tab");

  const proof = memory_manager.getLifecycleProof();
  const evict_proof = proof.filter((p) => p.action === "evict");
  const restore_proof = proof.filter((p) => p.action === "restore");

  const avg_evict_delta =
    evict_proof.length > 0
      ? evict_proof.reduce((sum, p) => sum + p.delta_mb, 0) / evict_proof.length
      : 0;

  const avg_restore_delta =
    restore_proof.length > 0
      ? restore_proof.reduce((sum, p) => sum + p.delta_mb, 0) / restore_proof.length
      : 0;

  console.log("=== BENCHMARK RESULTS ===");
  console.log(`Avg evict RSS delta: ${avg_evict_delta.toFixed(1)}MB`);
  console.log(`Avg restore RSS delta: ${avg_restore_delta.toFixed(1)}MB`);

  return {
    evict_delta_mb: avg_evict_delta,
    restore_delta_mb: avg_restore_delta,
    evict_proof,
  };
}

// ─── POLL MEMORY METRICS ───────────────────────────────────────────────────

export async function pollMemoryMetrics() {
  try {
    const snapshot = (await browser.getMemorySnapshot()) as {
      combined_rss_mb: number;
      combined_virt_mb: number;
      total_ram_mb: number;
      available_ram_mb: number;
      pressure_ratio: number;
      pressure_level: string;
      timestamp: number;
    } | null;

    if (snapshot) {
      useMemoryManager.getState().updateObserved({
        combined_rss_mb: snapshot.combined_rss_mb,
        combined_virt_mb: snapshot.combined_virt_mb,
        system_total_mb: snapshot.total_ram_mb,
        system_available_mb: snapshot.available_ram_mb,
        pressure_ratio: snapshot.pressure_ratio,
        pressure_level: snapshot.pressure_level as MemoryPressureLevel,
        timestamp: snapshot.timestamp,
      });
    }
  } catch (error) {
    console.error("Failed to poll memory metrics:", error);
  }
}

// ─── RE-EXPORTS ─────────────────────────────────────────────────────────────
// Note: UseTabStore is exported from tabStore.ts
// Import it via: import { useTabStore } from "./tabStore";
// Or via memoryManager: import { useTabStore } from "./memoryManager";
