// Session Restore Optimization Service
// Backend only - no UI changes

import { useTabStore } from '../stores/tabs';

/**
 * Session Restore Optimizer
 *
 * Problems with slow session restore:
 * 1. Too many tabs restored at once → memory spike
 * 2. All tabs load simultaneously → CPU spike, network congestion
 * 3. No prioritization → user waits longer for important tabs
 *
 * Solutions:
 * 1. Lazy restore - only restore active tabs immediately
 * 2. Priority-based restore - important tabs first
 * 3. Staggered loading - load tabs over time
 */

// ─── Session Snapshot ─────────────────────────────────────────────────────────

const SESSION_SNAPSHOT_KEY = 'eduos-session-snapshot';
const MAX_SNAPSHOT_TABS = 50;
const TAB_RESTORE_BATCH_SIZE = 3;
const TAB_RESTORE_DELAY_MS = 500;

/**
 * Create a session snapshot for fast restore
 */
export function createSessionSnapshot(tabs, activeTabId) {
  const snapshot = {
    version: 1,
    timestamp: Date.now(),
    activeTabId,
    tabs: tabs.slice(0, MAX_SNAPSHOT_TABS).map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      isPinned: tab.isPinned,
      groupId: tab.groupId,
      // Don't store navigation history for smaller snapshot
      scrollPosition: null,
    })),
    metadata: {
      tabCount: tabs.length,
      pinnedCount: tabs.filter(t => t.isPinned).length,
    },
  };

  try {
    localStorage.setItem(SESSION_SNAPSHOT_KEY, JSON.stringify(snapshot));
    console.log(`[Session] Snapshot created with ${snapshot.tabs.length} tabs`);
    return true;
  } catch (error) {
    console.error('[Session] Failed to create snapshot:', error);
    return false;
  }
}

/**
 * Load session snapshot
 */
export function loadSessionSnapshot() {
  try {
    const data = localStorage.getItem(SESSION_SNAPSHOT_KEY);
    if (!data) return null;

    const snapshot = JSON.parse(data);

    // Validate snapshot
    if (!snapshot.version || !snapshot.tabs || !Array.isArray(snapshot.tabs)) {
      console.warn('[Session] Invalid snapshot format');
      return null;
    }

    return snapshot;
  } catch (error) {
    console.error('[Session] Failed to load snapshot:', error);
    return null;
  }
}

/**
 * Clear session snapshot
 */
export function clearSessionSnapshot() {
  localStorage.removeItem(SESSION_SNAPSHOT_KEY);
}

// ─── Priority Restore ─────────────────────────────────────────────────────────

const TAB_PRIORITY = {
  // Highest priority - always restore first
  active: 1,
  // High priority - restore soon
  pinned: 2,
  recentlyUsed: 3,
  // Low priority - restore last
  background: 4,
  // Never restore
  abandoned: 5,
};

/**
 * Calculate tab priority for restore order
 */
function getTabPriority(tab, isActive, pinnedCount) {
  // Active tab always highest
  if (tab.id === isActive) return TAB_PRIORITY.active;

  // Pinned tabs high priority
  if (tab.isPinned) return TAB_PRIORITY.pinned;

  // Check last accessed time
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  if (tab.lastAccessedAt > fiveMinutesAgo) return TAB_PRIORITY.recentlyUsed;

  return TAB_PRIORITY.background;
}

/**
 * Sort tabs by restore priority
 */
export function sortTabsByPriority(tabs, activeTabId) {
  return [...tabs].sort((a, b) => {
    const priorityA = getTabPriority(a, activeTabId);
    const priorityB = getTabPriority(b, activeTabId);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Same priority - sort by last accessed (most recent first)
    return (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0);
  });
}

// ─── Lazy Restore ─────────────────────────────────────────────────────────

let restoreQueue = [];
let restoreInProgress = false;
let onRestoreProgress = null;

/**
 * Register callback for restore progress
 */
export function onRestoreUpdate(callback) {
  onRestoreProgress = callback;
}

/**
 * Restore session with lazy loading
 * Only loads immediate tabs, rest are queued
 */
export async function lazyRestoreSession(snapshot) {
  if (!snapshot || !snapshot.tabs || snapshot.tabs.length === 0) {
    console.log('[Session] No snapshot to restore');
    return;
  }

  const tabs = sortTabsByPriority(snapshot.tabs, snapshot.activeTabId);

  // Always restore active tab first
  const activeTab = tabs.find(t => t.id === snapshot.activeTabId);
  const pinnedTabs = tabs.filter(t => t.isPinned && t.id !== snapshot.activeTabId);
  const otherTabs = tabs.filter(t => !t.isPinned && t.id !== snapshot.activeTabId);

  // Phase 1: Restore active + pinned tabs immediately
  console.log(`[Session] Phase 1: Restoring active + pinned (${1 + pinnedTabs.length} tabs)`);

  // Restore active tab
  if (activeTab) {
    await restoreTab(activeTab, true);
  }

  // Restore pinned tabs
  for (const tab of pinnedTabs.slice(0, 5)) { // Max 5 pinned
    await restoreTab(tab, false);
  }

  // Phase 2: Queue remaining tabs for lazy restore
  const queuedTabs = otherTabs.slice(5); // Skip first 5
  restoreQueue = queuedTabs;
  restoreInProgress = true;

  // Start lazy restore in background
  if (queuedTabs.length > 0) {
    console.log(`[Session] Phase 2: Queuing ${queuedTabs.length} tabs for lazy restore`);
    startLazyRestore();
  }

  return {
    immediate: 1 + Math.min(pinnedTabs.length, 5),
    queued: queuedTabs.length,
  };
}

/**
 * Restore a single tab
 */
async function restoreTab(tabData, isActive) {
  const store = useTabStore.getState();

  // Create new tab with saved data
  const newTabId = store.addTab(tabData.url || 'https://www.google.com');

  // Update tab with saved metadata
  if (tabData.title) {
    store.updateTab(newTabId, {
      title: tabData.title,
      favicon: tabData.favicon,
    });
  }

  // Set as active if it was the active tab
  if (isActive) {
    store.setActiveTab(newTabId);
  }

  return newTabId;
}

/**
 * Start lazy restore of queued tabs
 * Loads tabs in batches with delays to prevent memory/CPU spikes
 */
async function startLazyRestore() {
  if (!restoreInProgress || restoreQueue.length === 0) {
    return;
  }

  // Process tabs in batches
  const batch = restoreQueue.splice(0, TAB_RESTORE_BATCH_SIZE);

  console.log(`[Session] Restoring batch of ${batch.length} tabs`);

  for (const tab of batch) {
    await restoreTab(tab, false);
  }

  // Notify progress
  if (onRestoreProgress) {
    onRestoreProgress({
      restored: batch.length,
      remaining: restoreQueue.length,
      total: batch.length + restoreQueue.length,
    });
  }

  // Schedule next batch
  if (restoreQueue.length > 0) {
    setTimeout(startLazyRestore, TAB_RESTORE_DELAY_MS);
  } else {
    restoreInProgress = false;
    console.log('[Session] Lazy restore complete');
  }
}

/**
 * Cancel lazy restore
 */
export function cancelLazyRestore() {
  restoreInProgress = false;
  restoreQueue = [];
}

/**
 * Get restore progress
 */
export function getRestoreProgress() {
  return {
    inProgress: restoreInProgress,
    remaining: restoreQueue.length,
  };
}

// ─── Session Analytics ──────────────────────────────────────────────────────

/**
 * Track session metrics for optimization
 */
const SESSION_METRICS_KEY = 'eduos-session-metrics';

export function trackSessionMetric(metric) {
  try {
    const data = localStorage.getItem(SESSION_METRICS_KEY);
    const metrics = data ? JSON.parse(data) : [];

    metrics.push({
      ...metric,
      timestamp: Date.now(),
    });

    // Keep only last 100 metrics
    if (metrics.length > 100) {
      metrics.splice(0, metrics.length - 100);
    }

    localStorage.setItem(SESSION_METRICS_KEY, JSON.stringify(metrics));
  } catch (error) {
    console.error('[Session] Failed to track metric:', error);
  }
}

/**
 * Get session analytics
 */
export function getSessionAnalytics() {
  try {
    const data = localStorage.getItem(SESSION_METRICS_KEY);
    const metrics = data ? JSON.parse(data) : [];

    if (metrics.length === 0) {
      return null;
    }

    // Calculate averages
    const avgTabCount = metrics.reduce((sum, m) => sum + (m.tabCount || 0), 0) / metrics.length;
    const avgRestoreTime = metrics.reduce((sum, m) => sum + (m.restoreTime || 0), 0) / metrics.length;

    return {
      sessionCount: metrics.length,
      avgTabCount: Math.round(avgTabCount),
      avgRestoreTime: Math.round(avgRestoreTime),
      lastSession: metrics[metrics.length - 1],
    };
  } catch (error) {
    return null;
  }
}

// ─── Auto-snapshot ─────────────────────────────────────────────────────────

let autoSnapshotInterval = null;

export function startAutoSnapshot(intervalMs = 30000) {
  if (autoSnapshotInterval) return;

  console.log(`[Session] Auto-snapshot every ${intervalMs / 1000}s`);

  autoSnapshotInterval = setInterval(() => {
    const { tabs, activeTabId } = useTabStore.getState();

    if (tabs.length > 0) {
      createSessionSnapshot(tabs, activeTabId);
    }
  }, intervalMs);
}

export function stopAutoSnapshot() {
  if (autoSnapshotInterval) {
    clearInterval(autoSnapshotInterval);
    autoSnapshotInterval = null;
    console.log('[Session] Auto-snapshot stopped');
  }
}

// ─── Crash Recovery ────────────────────────────────────────────────────────

const CRASH_RECOVERY_KEY = 'eduos-crash-recovery';
const CRASH_THRESHOLD_MS = 10000; // 10 seconds

/**
 * Mark session as clean shutdown
 */
export function markCleanShutdown() {
  localStorage.removeItem(CRASH_RECOVERY_KEY);
}

/**
 * Check if previous session crashed
 */
export function checkForCrash() {
  try {
    const data = localStorage.getItem(CRASH_RECOVERY_KEY);
    if (!data) return false;

    const recovery = JSON.parse(data);
    const now = Date.now();
    const timeSinceLastSnapshot = now - recovery.lastSnapshot;

    // If last snapshot was very recent and we didn't get clean shutdown,
    // likely a crash
    if (timeSinceLastSnapshot < CRASH_THRESHOLD_MS) {
      console.log('[Session] Possible crash detected');
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Update crash recovery marker
 */
function updateCrashMarker() {
  try {
    localStorage.setItem(CRASH_RECOVERY_KEY, JSON.stringify({
      lastSnapshot: Date.now(),
    }));
  } catch {}
}

// ─── Initialize ────────────────────────────────────────────────────────────

export function initSessionRestore() {
  // Set up crash recovery marker
  updateCrashMarker();

  // Check for crash on startup
  if (checkForCrash()) {
    const snapshot = loadSessionSnapshot();
    if (snapshot) {
      console.log('[Session] Offering crash recovery...');
      // Return snapshot for UI to handle recovery prompt
      return { crashed: true, snapshot };
    }
  }

  // Start auto-snapshot
  startAutoSnapshot();

  // Mark clean shutdown on unload
  window.addEventListener('beforeunload', markCleanShutdown);

  console.log('[Session] Session restore initialized');
}
