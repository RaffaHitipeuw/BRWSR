
import { useTabStore } from "./tabStore";
import type { Tab, TabGroup, TabLifecycleState, TabPriority } from "./types";

export {
  useMemoryManager,
  pollMemoryMetrics,
  evictTabWithProof,
  restoreTabWithProof,
  runLifecycleBenchmark,
} from "./memoryManager";

export { useTabStore } from "./tabStore";

export type { Tab, TabGroup, TabLifecycleState, TabPriority };

export const useBrowserTabs = useTabStore;

export const useTabs = () => {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const groups = useTabStore((s) => s.groups);

  return {
    tabs,
    activeTabId,
    groups,
    activeTab: tabs.find((t) => t.id === activeTabId),
  };
};


interface OptimizerMetrics {
  name: string;

  declared_memory_mb: number;
  declared_startup_ms: number;

  measured_memory_mb: number | null;
  measured_startup_ms: number | null;

  active: boolean;
  timestamp: number | null;
}

const optimizerMetrics: Map<string, OptimizerMetrics> = new Map();

export function registerOptimizer(config: {
  name: string;
  declared_memory_mb: number;
  declared_startup_ms: number;
}) {
  optimizerMetrics.set(config.name, {
    name: config.name,
    declared_memory_mb: config.declared_memory_mb,
    declared_startup_ms: config.declared_startup_ms,
    measured_memory_mb: null,
    measured_startup_ms: null,
    active: true,
    timestamp: null,
  });
}

export function recordMeasuredOverhead(
  name: string,
  measured_memory_mb: number,
  measured_startup_ms: number,
) {
  const optimizer = optimizerMetrics.get(name);
  if (optimizer) {
    optimizer.measured_memory_mb = measured_memory_mb;
    optimizer.measured_startup_ms = measured_startup_ms;
    optimizer.timestamp = Date.now();
  }
}

export function getOptimizerMetrics(): OptimizerMetrics[] {
  return Array.from(optimizerMetrics.values());
}

export function getTotalOptimizerOverhead(): {
  declared_memory_mb: number;
  declared_startup_ms: number;
  measured_memory_mb: number | null;
  measured_startup_ms: number | null;
} {
  let declared_memory_mb = 0;
  let declared_startup_ms = 0;

  optimizerMetrics.forEach((m) => {
    declared_memory_mb += m.declared_memory_mb;
    declared_startup_ms += m.declared_startup_ms;
  });

  const all_measured = Array.from(optimizerMetrics.values()).every(
    (m) => m.measured_memory_mb !== null && m.measured_startup_ms !== null,
  );

  let measured_memory_mb: number | null = null;
  let measured_startup_ms: number | null = null;

  if (all_measured) {
    measured_memory_mb = Array.from(optimizerMetrics.values()).reduce(
      (sum, m) => sum + (m.measured_memory_mb ?? 0),
      0,
    );
    measured_startup_ms = Array.from(optimizerMetrics.values()).reduce(
      (sum, m) => sum + (m.measured_startup_ms ?? 0),
      0,
    );
  }

  return {
    declared_memory_mb,
    declared_startup_ms,
    measured_memory_mb,
    measured_startup_ms,
  };
}

registerOptimizer({
  name: "Memory Pressure Monitor",
  declared_memory_mb: 0.5,
  declared_startup_ms: 10,
});

registerOptimizer({
  name: "Tab Lifecycle Manager",
  declared_memory_mb: 0.1,
  declared_startup_ms: 5,
});

registerOptimizer({
  name: "Restore Queue Manager",
  declared_memory_mb: 0.2,
  declared_startup_ms: 3,
});

const declaredMetrics = getTotalOptimizerOverhead();
console.log("[P0-6] Optimizer DECLARED Overhead (estimates, not measured):", {
  declared_memory_mb: declaredMetrics.declared_memory_mb,
  declared_startup_ms: declaredMetrics.declared_startup_ms,
});
console.log(
  "[P0-6] NOTE: These are declared estimates. Use runLifecycleBenchmark() to get MEASURED values.",
);
