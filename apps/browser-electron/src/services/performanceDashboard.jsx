// Performance Dashboard - Tier 10: Real-time Monitoring & Scoring
// Backend only - no UI changes

import { useTabStore } from '../stores/tabs';

// Metrics storage
const metrics = {
  memory: { total: 0, tabs: new Map(), limit: 2 * 1024 * 1024 * 1024, alertThreshold: 0.8 },
  cpu: { usage: 0, distribution: {}, history: [] },
  network: { requests: 0, cached: 0, failed: 0 },
  startup: { fcp: null, tti: null, load: null },
};

const SCORE_WEIGHTS = {
  memory: 0.3,
  cpu: 0.2,
  startup: 0.25,
  network: 0.15,
  stability: 0.1,
};

function calculateMemoryScore() {
  const usagePercent = metrics.memory.total / metrics.memory.limit;
  if (usagePercent <= 0.3) return 100;
  if (usagePercent <= 0.5) return 90;
  if (usagePercent <= 0.7) return 70;
  if (usagePercent <= metrics.memory.alertThreshold) return 50;
  return Math.max(0, 30 - (usagePercent - metrics.memory.alertThreshold) * 100);
}

function calculateCpuScore() {
  if (metrics.cpu.usage <= 10) return 100;
  if (metrics.cpu.usage <= 30) return 90;
  if (metrics.cpu.usage <= 50) return 70;
  if (metrics.cpu.usage <= 70) return 50;
  return Math.max(0, 30 - (metrics.cpu.usage - 70) * 2);
}

function calculateStartupScore() {
  if (!metrics.startup.fcp || !metrics.startup.tti || !metrics.startup.load) return 50;
  const fcpScore = Math.max(0, 100 - (metrics.startup.fcp - 500) / 15);
  const ttiScore = Math.max(0, 100 - (metrics.startup.tti - 1500) / 15);
  const loadScore = Math.max(0, 100 - (metrics.startup.load - 2000) / 20);
  return (fcpScore * 0.3 + ttiScore * 0.4 + loadScore * 0.3);
}

function calculateNetworkScore() {
  if (metrics.network.requests === 0) return 100;
  const cacheHitRate = metrics.network.cached / metrics.network.requests;
  const failRate = metrics.network.failed / metrics.network.requests;
  const cacheScore = cacheHitRate * 60;
  const failScore = failRate === 0 ? 40 : Math.max(0, 40 - failRate * 200);
  return Math.max(0, Math.round(cacheScore + failScore));
}

function calculateStabilityScore() {
  return 100;
}

export function getPerformanceScore() {
  const scores = {
    memory: calculateMemoryScore(),
    cpu: calculateCpuScore(),
    startup: calculateStartupScore(),
    network: calculateNetworkScore(),
    stability: calculateStabilityScore(),
  };

  const weighted = Object.entries(scores).reduce((sum, [key, score]) => {
    return sum + score * SCORE_WEIGHTS[key];
  }, 0);

  const overall = Math.round(weighted);
  let grade = 'F';
  if (overall >= 90) grade = 'A+';
  else if (overall >= 80) grade = 'A';
  else if (overall >= 70) grade = 'B';
  else if (overall >= 60) grade = 'C';
  else if (overall >= 50) grade = 'D';

  return { overall, grade, breakdown: scores, weights: SCORE_WEIGHTS, timestamp: Date.now() };
}

export function updateMemoryMetrics(tabMemory) {
  let total = 0;
  for (const [tabId, memory] of Object.entries(tabMemory)) {
    total += memory;
    metrics.memory.tabs.set(tabId, { estimated: memory, trend: [] });
  }
  metrics.memory.total = total;
}

export function updateCpuMetrics(distribution) {
  metrics.cpu.distribution = distribution;
  metrics.cpu.usage = Object.values(distribution).reduce((a, b) => a + b, 0);
  metrics.cpu.history.push({ time: Date.now(), usage: metrics.cpu.usage });
  if (metrics.cpu.history.length > 60) metrics.cpu.history.shift();
}

export function updateNetworkMetrics(requests, cached, failed) {
  metrics.network.requests = requests;
  metrics.network.cached = cached;
  metrics.network.failed = failed;
}

export function updateStartupMetrics(fcp, tti, load) {
  metrics.startup.fcp = fcp;
  metrics.startup.tti = tti;
  metrics.startup.load = load;
}

const AUTO_OPT = { memoryThreshold: 0.75, cpuThreshold: 80, memoryCheckInterval: 5000 };
let autoOptimizeInterval = null;

function runAutoOptimization() {
  const memoryUsage = metrics.memory.total / metrics.memory.limit;
  if (memoryUsage > AUTO_OPT.memoryThreshold) {
    const store = useTabStore.getState();
    const awakeTabs = store.getAwakeTabs() || [];
    const activeTabId = store.activeTabId;
    for (const tab of awakeTabs) {
      if (tab.id !== activeTabId) store.sleepTab(tab.id);
    }
  }
}

export function startAutoOptimization() {
  if (autoOptimizeInterval) return;
  autoOptimizeInterval = setInterval(runAutoOptimization, AUTO_OPT.memoryCheckInterval);
}

export function stopAutoOptimization() {
  if (autoOptimizeInterval) {
    clearInterval(autoOptimizeInterval);
    autoOptimizeInterval = null;
  }
}

export function getDashboardData() {
  const store = useTabStore.getState();
  const tabs = store.tabs || [];
  const awakeTabs = tabs.filter(t => !t.isSleeping) || [];
  const sleepingTabs = tabs.filter(t => t.isSleeping) || [];

  return {
    score: getPerformanceScore(),
    memory: {
      totalMB: Math.round(metrics.memory.total / 1024 / 1024),
      limitMB: Math.round(metrics.memory.limit / 1024 / 1024),
      usagePercent: Math.round((metrics.memory.total / metrics.memory.limit) * 100),
    },
    cpu: { usage: Math.round(metrics.cpu.usage), distribution: metrics.cpu.distribution, history: metrics.cpu.history.slice(-30) },
    network: {
      requests: metrics.network.requests,
      cached: metrics.network.cached,
      failed: metrics.network.failed,
      cacheHitRate: metrics.network.requests > 0 ? Math.round((metrics.network.cached / metrics.network.requests) * 100) : 0,
    },
    tabs: { total: tabs.length, awake: awakeTabs.length, sleeping: sleepingTabs.length },
    startup: { fcp: metrics.startup.fcp, tti: metrics.startup.tti, load: metrics.startup.load },
    timestamp: Date.now(),
  };
}

export function exportDashboardData() {
  return JSON.stringify(getDashboardData(), null, 2);
}

export function resetMetrics() {
  metrics.memory.total = 0;
  metrics.memory.tabs.clear();
  metrics.cpu.usage = 0;
  metrics.cpu.distribution = {};
  metrics.cpu.history = [];
  metrics.network.requests = 0;
  metrics.network.cached = 0;
  metrics.network.failed = 0;
  metrics.startup = { fcp: null, tti: null, load: null };
}

export function initPerformanceDashboard() {
  metrics.startup.fcp = Date.now();
  startAutoOptimization();
  setInterval(() => {
    if (metrics.cpu.history.length > 120) metrics.cpu.history = metrics.cpu.history.slice(-60);
  }, 60000);
  setTimeout(() => {
    console.log('[Dashboard] Initial score:', getPerformanceScore().overall + '/100');
  }, 2000);
}

export function stopPerformanceDashboard() {
  stopAutoOptimization();
}
