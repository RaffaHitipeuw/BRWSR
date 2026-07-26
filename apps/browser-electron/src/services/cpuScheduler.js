// CPU Scheduler Service - Tier 7: Per-Tab CPU Priority & Throttling
// Backend only - no UI changes

import { useTabStore } from '../stores/tabs';

/**
 * CPU Scheduler
 *
 * Goals:
 * 1. Active tab = 100% CPU priority
 * 2. Sleeping tabs = 0% CPU (throttled)
 * 3. Background tabs = low priority
 * 4. requestIdleCallback for non-critical work
 */

/**
 * Tab priority levels
 */
export const PRIORITY = {
  CRITICAL: 0,    // Active tab
  HIGH: 1,        // Recently accessed (< 5 min)
  MEDIUM: 2,      // Background tabs
  LOW: 3,         // Sleeping tabs
  IDLE: 4,        // Never accessed
};

/**
 * Throttle settings per priority
 */
const THROTTLE_SETTINGS = {
  [PRIORITY.CRITICAL]: {
    fps: 60,
    updateInterval: 16,  // 60fps = 16ms
    allowTimers: true,
    allowFetch: true,
    networkPriority: 'high',
  },
  [PRIORITY.HIGH]: {
    fps: 30,
    updateInterval: 33,  // 30fps
    allowTimers: true,
    allowFetch: true,
    networkPriority: 'medium',
  },
  [PRIORITY.MEDIUM]: {
    fps: 15,
    updateInterval: 67,  // 15fps
    allowTimers: true,
    allowFetch: false,
    networkPriority: 'low',
  },
  [PRIORITY.LOW]: {
    fps: 0,              // Frozen
    updateInterval: 0,
    allowTimers: false,
    allowFetch: false,
    networkPriority: 'low',
  },
  [PRIORITY.IDLE]: {
    fps: 0,
    updateInterval: 0,
    allowTimers: false,
    allowFetch: false,
    networkPriority: 'low',
  },
};

/**
 * CPU Scheduler
 */
const cpuScheduler = {
  // Track CPU usage per tab
  usage: new Map(), // tabId -> { priority, lastUpdate, cpuPercent }

  // Scheduling state
  activeTabId: null,
  isRunning: false,
  scheduleInterval: null,
  SCHEDULE_INTERVAL_MS: 1000,

  // Stats
  stats: {
    totalCpuUsed: 0,
    scheduleCount: 0,
    lastUpdate: Date.now(),
  },

  /**
   * Set active tab (highest priority)
   */
  setActiveTab(tabId) {
    this.activeTabId = tabId;
    this.updatePriority(tabId, PRIORITY.CRITICAL);
    this.schedule();
  },

  /**
   * Update tab priority
   */
  updatePriority(tabId, priority) {
    const now = Date.now();
    const existing = this.usage.get(tabId) || { priority: PRIORITY.IDLE };

    this.usage.set(tabId, {
      ...existing,
      priority,
      lastUpdate: now,
    });

    // Apply throttle settings
    const settings = THROTTLE_SETTINGS[priority];
    this.applyThrottle(tabId, settings);
  },

  /**
   * Apply throttle settings to a tab
   */
  applyThrottle(tabId, settings) {
    // In Electron, we can't directly throttle webview CPU
    // But we can signal to the webview via postMessage
    const store = useTabStore.getState();
    const tab = store.getTab(tabId);

    if (!tab) return;

    // Update tab metadata for UI indication
    store.updateTab(tabId, {
      cpuPriority: settings.fps,
      isThrottled: settings.fps < 60,
    });

    // Note: Actual CPU throttling happens via:
    // 1. Tab sleeping (Tier 1) - stops webview
    // 2. Visibility API - reduces updates when hidden
    // 3. Future: Web Worker delegation
  },

  /**
   * Main scheduler loop
   */
  schedule() {
    if (!this.isRunning) return;

    const now = Date.now();
    const store = useTabStore.getState();
    const tabs = store.tabs;

    // Calculate idle time thresholds
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const thirtySecondsAgo = now - 30 * 1000;

    for (const tab of tabs) {
      if (tab.id === this.activeTabId) {
        this.updatePriority(tab.id, PRIORITY.CRITICAL);
        continue;
      }

      if (tab.isSleeping) {
        this.updatePriority(tab.id, PRIORITY.LOW);
        continue;
      }

      if (tab.lastAccessedAt > fiveMinutesAgo) {
        this.updatePriority(tab.id, PRIORITY.HIGH);
        continue;
      }

      if (tab.lastAccessedAt > thirtySecondsAgo) {
        this.updatePriority(tab.id, PRIORITY.MEDIUM);
        continue;
      }

      this.updatePriority(tab.id, PRIORITY.IDLE);
    }

    this.stats.scheduleCount++;
    this.stats.lastUpdate = now;

    // Calculate total CPU allocation
    this.calculateCpuAllocation(tabs);
  },

  /**
   * Calculate CPU allocation based on priorities
   */
  calculateCpuAllocation(tabs) {
    let totalAllocation = 0;

    for (const tab of tabs) {
      const usage = this.usage.get(tab.id);
      if (!usage) continue;

      // CPU percentage per priority
      const allocation = {
        [PRIORITY.CRITICAL]: 100,
        [PRIORITY.HIGH]: 50,
        [PRIORITY.MEDIUM]: 20,
        [PRIORITY.LOW]: 5,
        [PRIORITY.IDLE]: 0,
      }[usage.priority] || 0;

      totalAllocation += allocation;
    }

    this.stats.totalCpuUsed = Math.min(totalAllocation, 100);
  },

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.scheduleInterval = setInterval(
      () => this.schedule(),
      this.SCHEDULE_INTERVAL_MS
    );

    console.log('[CPU] Scheduler started');
  },

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.scheduleInterval) {
      clearInterval(this.scheduleInterval);
      this.scheduleInterval = null;
    }

    console.log('[CPU] Scheduler stopped');
  },

  /**
   * Get scheduler stats
   */
  getStats() {
    const tabs = useTabStore.getState().tabs;
    const priorityDistribution = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      idle: 0,
    };

    for (const tab of tabs) {
      const usage = this.usage.get(tab.id);
      if (!usage) continue;

      const names = ['critical', 'high', 'medium', 'low', 'idle'];
      priorityDistribution[names[usage.priority]]++;
    }

    return {
      ...this.stats,
      activeTabId: this.activeTabId,
      priorityDistribution,
      totalCpuUsed: this.stats.totalCpuUsed,
    };
  },

  /**
   * Reset scheduler
   */
  reset() {
    this.usage.clear();
    this.stats = {
      totalCpuUsed: 0,
      scheduleCount: 0,
      lastUpdate: Date.now(),
    };
  },
};

// ─── requestIdleCallback Polyfill ─────────────────────────────────────────

let idleCallbackId = 0;
const idleCallbacks = new Map();

/**
 * Polyfill for requestIdleCallback
 * Allows running non-critical tasks during idle time
 */
export function requestIdleCallback(callback, options = {}) {
  const timeout = options.timeout || 5000;

  const idleCallback = {
    id: ++idleCallbackId,
    deadline: Date.now() + timeout,
    callback,
    scheduled: Date.now(),
  };

  // Schedule the callback
  const schedule = () => {
    const now = Date.now();
    const deadline = idleCallback.deadline;

    if (now >= deadline) {
      // Deadline reached, run callback
      try {
        callback({
          didTimeout: true,
          timeRemaining: () => 0,
        });
      } finally {
        idleCallbacks.delete(idleCallback.id);
      }
    } else {
      // Schedule next check
      const delay = Math.min(deadline - now, 50);
      setTimeout(schedule, delay);
    }
  };

  idleCallbacks.set(idleCallback.id, idleCallback);

  // Start scheduling
  setTimeout(schedule, 1);

  return idleCallback.id;
}

/**
 * Cancel idle callback
 */
export function cancelIdleCallback(id) {
  idleCallbacks.delete(id);
}

// ─── Background Task Queue ─────────────────────────────────────────────────

const backgroundQueue = {
  tasks: [],
  isProcessing: false,
  maxConcurrent: 2,
  currentConcurrent: 0,

  /**
   * Add task to background queue
   */
  add(task, options = {}) {
    const {
      priority = 'low',
      timeout = 30000,
      onProgress = null,
      onComplete = null,
      onError = null,
    } = options;

    this.tasks.push({
      id: Date.now() + Math.random(),
      task,
      priority,
      timeout,
      onProgress,
      onComplete,
      onError,
      status: 'pending',
      addedAt: Date.now(),
    });

    // Sort by priority
    this.tasks.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] || 0) - (order[b.priority] || 0);
    });

    // Process queue
    this.process();
  },

  /**
   * Process tasks in queue
   */
  async process() {
    if (this.isProcessing) return;
    if (this.currentConcurrent >= this.maxConcurrent) return;

    const task = this.tasks.find(t => t.status === 'pending');
    if (!task) return;

    this.isProcessing = true;
    this.currentConcurrent++;
    task.status = 'running';

    try {
      // Use requestIdleCallback if available
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        await new Promise(resolve => {
          requestIdleCallback(() => resolve(), { timeout: task.timeout });
        });
      } else {
        // Fallback: wait for idle
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Execute task
      await task.task();

      task.status = 'completed';
      if (task.onComplete) task.onComplete();

    } catch (error) {
      task.status = 'error';
      if (task.onError) task.onError(error);
    } finally {
      this.currentConcurrent--;
      this.isProcessing = false;

      // Remove completed tasks
      this.tasks = this.tasks.filter(t => t.status === 'pending' || t.status === 'running');

      // Continue processing
      if (this.tasks.length > 0) {
        this.process();
      }
    }
  },

  /**
   * Get queue stats
   */
  getStats() {
    return {
      total: this.tasks.length,
      pending: this.tasks.filter(t => t.status === 'pending').length,
      running: this.currentConcurrent,
      completed: this.tasks.filter(t => t.status === 'completed').length,
    };
  },

  /**
   * Clear queue
   */
  clear() {
    this.tasks = [];
    this.currentConcurrent = 0;
  },
};

// ─── Tab Update Throttling ──────────────────────────────────────────────

const updateThrottlers = new Map();

/**
 * Throttle tab updates based on priority
 */
export function throttleTabUpdate(tabId, updateFn, priority = PRIORITY.MEDIUM) {
  const settings = THROTTLE_SETTINGS[priority];
  if (!settings.updateInterval) {
    // No updates allowed for this priority
    return;
  }

  // Check if we should skip this update
  const lastUpdate = updateThrottlers.get(tabId);
  const now = Date.now();

  if (lastUpdate && now - lastUpdate < settings.updateInterval) {
    // Skip update
    return false;
  }

  // Record update time
  updateThrottlers.set(tabId, now);

  // Execute update
  updateFn();
  return true;
}

/**
 * Get throttler stats
 */
export function getThrottlerStats() {
  const now = Date.now();
  const stats = {};

  for (const [tabId, lastUpdate] of updateThrottlers) {
    const store = useTabStore.getState();
    const tab = store.getTab(tabId);
    const usage = cpuScheduler.usage.get(tabId);

    stats[tabId] = {
      lastUpdateMs: now - lastUpdate,
      priority: usage?.priority ?? 'unknown',
    };
  }

  return stats;
}

// ─── Initialize ─────────────────────────────────────────────────────────

let isInitialized = false;

/**
 * Initialize CPU scheduler
 */
export function initCpuScheduler() {
  if (isInitialized) return;

  // Start scheduler
  cpuScheduler.start();

  isInitialized = true;
  console.log('[CPU] Scheduler initialized');
  console.log('[CPU] Stats:', cpuScheduler.getStats());
}

/**
 * Stop CPU scheduler
 */
export function stopCpuScheduler() {
  cpuScheduler.stop();
  backgroundQueue.clear();
  isInitialized = false;
}

// Export scheduler
export { cpuScheduler, backgroundQueue };
