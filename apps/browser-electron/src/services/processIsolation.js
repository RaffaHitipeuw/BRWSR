// Process Isolation Service - Tier 6: Crash Safety & Recovery
// Backend only - no UI changes

import { useTabStore } from '../stores/tabs';

/**
 * Process Isolation Manager
 *
 * Goals:
 * 1. Tab crash ≠ app crash
 * 2. Individual tab restart without restart all
 * 3. Error boundary per tab
 * 4. Graceful degradation
 */

/**
 * Error types for categorization
 */
const ERROR_TYPES = {
  RENDER_FAILED: 'render_failed',
  LOAD_TIMEOUT: 'load_timeout',
  MEMORY_EXCEEDED: 'memory_exceeded',
  NETWORK_FAILED: 'network_failed',
  UNKNOWN: 'unknown',
};

/**
 * Crash tracker
 */
const crashTracker = {
  crashes: new Map(), // tabId -> { count, lastCrash, reason }
  maxCrashes: 3,
  cooldownMs: 60000, // 1 minute cooldown after crashes
};

/**
 * Classify error type
 */
function classifyError(error, url) {
  if (!error) return ERROR_TYPES.UNKNOWN;

  const message = String(error).toLowerCase();

  if (message.includes('memory') || message.includes('oom')) {
    return ERROR_TYPES.MEMORY_EXCEEDED;
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return ERROR_TYPES.LOAD_TIMEOUT;
  }
  if (message.includes('net::') || message.includes('network')) {
    return ERROR_TYPES.NETWORK_FAILED;
  }
  if (message.includes('render') || message.includes('webview')) {
    return ERROR_TYPES.RENDER_FAILED;
  }

  return ERROR_TYPES.UNKNOWN;
}

/**
 * Error Boundary for tab
 * Catches and handles errors per-tab
 */
export class TabErrorBoundary {
  constructor(tabId, onError, onRecovery) {
    this.tabId = tabId;
    this.onError = onError;
    this.onRecovery = onRecovery;
    this.isolated = false;
    this.errorCount = 0;
    this.lastError = null;
  }

  /**
   * Handle error from webview
   */
  handleError(error, webview) {
    this.lastError = error;
    this.errorCount++;

    const errorType = classifyError(error);

    // Track crash
    const crash = crashTracker.crashes.get(this.tabId) || {
      count: 0,
      lastCrash: 0,
      reason: null,
    };
    crash.count++;
    crash.lastCrash = Date.now();
    crash.reason = errorType;
    crashTracker.crashes.set(this.tabId, crash);

    console.error(`[Isolation] Tab ${this.tabId} error (${errorType}):`, error);

    // Check if too many crashes
    if (crash.count >= crashTracker.maxCrashes) {
      const cooldownRemaining = crashTracker.cooldownMs - (Date.now() - crash.lastCrash);
      if (cooldownRemaining > 0) {
        console.warn(`[Isolation] Tab ${this.tabId} in crash cooldown (${Math.round(cooldownRemaining / 1000)}s)`);
        this.isolate();
        return;
      }
      // Reset after cooldown
      crash.count = 0;
    }

    // Notify error handler
    if (this.onError) {
      this.onError({
        tabId: this.tabId,
        error,
        errorType,
        crashCount: crash.count,
        isIsolated: this.isolated,
      });
    }
  }

  /**
   * Isolate tab (stop crashing the app)
   */
  isolate() {
    if (this.isolated) return;
    this.isolated = true;

    console.warn(`[Isolation] Tab ${this.tabId} isolated`);

    // Mark tab as crashed in store
    const store = useTabStore.getState();
    store.updateTab(this.tabId, {
      isCrashed: true,
      crashReason: this.lastError,
      crashedAt: Date.now(),
    });

    // Try recovery after delay
    setTimeout(() => this.attemptRecovery(), 5000);
  }

  /**
   * Attempt to recover the tab
   */
  async attemptRecovery() {
    if (!this.isolated) return;

    console.log(`[Isolation] Attempting recovery for tab ${this.tabId}`);

    try {
      // Reset crash state
      crashTracker.crashes.delete(this.tabId);
      this.errorCount = 0;
      this.isolated = false;

      // Mark tab as recovering
      const store = useTabStore.getState();
      store.updateTab(this.tabId, {
        isCrashed: false,
        crashReason: null,
        crashedAt: null,
        isRecovering: true,
      });

      // Notify recovery handler
      if (this.onRecovery) {
        this.onRecovery(this.tabId);
      }

      console.log(`[Isolation] Tab ${this.tabId} recovered`);
    } catch (error) {
      console.error(`[Isolation] Recovery failed for tab ${this.tabId}:`, error);
      // Re-isolate
      this.isolate();
    }
  }

  /**
   * Reset error count
   */
  reset() {
    this.errorCount = 0;
    this.lastError = null;
    crashTracker.crashes.delete(this.tabId);
  }
}

/**
 * Process Isolation Manager
 * Manages error boundaries for all tabs
 */
const isolationManager = {
  boundaries: new Map(), // tabId -> TabErrorBoundary
  globalHandler: null,

  /**
   * Create error boundary for a tab
   */
  createBoundary(tabId, onError, onRecovery) {
    const boundary = new TabErrorBoundary(tabId, onError, onRecovery);
    this.boundaries.set(tabId, boundary);
    return boundary;
  },

  /**
   * Get boundary for a tab
   */
  getBoundary(tabId) {
    return this.boundaries.get(tabId);
  },

  /**
   * Remove boundary for a tab
   */
  removeBoundary(tabId) {
    const boundary = this.boundaries.get(tabId);
    if (boundary) {
      boundary.reset();
      this.boundaries.delete(tabId);
    }
  },

  /**
   * Set global error handler
   */
  setGlobalHandler(handler) {
    this.globalHandler = handler;
  },

  /**
   * Handle error for a tab
   */
  handleTabError(tabId, error) {
    const boundary = this.boundaries.get(tabId);
    if (boundary) {
      boundary.handleError(error);
    }

    // Also call global handler
    if (this.globalHandler) {
      this.globalHandler(tabId, error);
    }
  },

  /**
   * Check if tab is isolated
   */
  isIsolated(tabId) {
    const boundary = this.boundaries.get(tabId);
    return boundary?.isolated || false;
  },

  /**
   * Get crash stats
   */
  getCrashStats() {
    const stats = {
      totalCrashes: 0,
      isolatedTabs: 0,
      recoveringTabs: 0,
      byType: {},
    };

    for (const [tabId, crash] of crashTracker.crashes) {
      stats.totalCrashes += crash.count;
      if (crashTracker.crashes.get(tabId)?.lastCrash > Date.now() - crashTracker.cooldownMs) {
        stats.isolatedTabs++;
      }
      stats.byType[crash.reason] = (stats.byType[crash.reason] || 0) + 1;
    }

    return stats;
  },

  /**
   * Reset all boundaries
   */
  reset() {
    for (const boundary of this.boundaries.values()) {
      boundary.reset();
    }
    this.boundaries.clear();
    crashTracker.crashes.clear();
  },
};

// ─── Crash Recovery Strategies ──────────────────────────────────────────────

const RECOVERY_STRATEGIES = {
  [ERROR_TYPES.RENDER_FAILED]: {
    delay: 3000,
    action: 'reload',
    maxRetries: 3,
  },
  [ERROR_TYPES.LOAD_TIMEOUT]: {
    delay: 5000,
    action: 'retry',
    maxRetries: 2,
  },
  [ERROR_TYPES.MEMORY_EXCEEDED]: {
    delay: 10000,
    action: 'compress_and_reload',
    maxRetries: 1,
  },
  [ERROR_TYPES.NETWORK_FAILED]: {
    delay: 5000,
    action: 'wait_and_retry',
    maxRetries: 3,
  },
  [ERROR_TYPES.UNKNOWN]: {
    delay: 5000,
    action: 'reload',
    maxRetries: 2,
  },
};

/**
 * Get recovery strategy for error type
 */
export function getRecoveryStrategy(errorType) {
  return RECOVERY_STRATEGIES[errorType] || RECOVERY_STRATEGIES[ERROR_TYPES.UNKNOWN];
}

/**
 * Execute recovery action
 */
export async function executeRecovery(tabId, strategy, onAction) {
  console.log(`[Isolation] Executing recovery for tab ${tabId}:`, strategy.action);

  if (onAction) {
    onAction(strategy.action);
  }

  // Wait before recovery
  await new Promise(resolve => setTimeout(resolve, strategy.delay));

  // Execute action based on strategy
  switch (strategy.action) {
    case 'reload':
      // Trigger reload in App.jsx via event
      window.dispatchEvent(new CustomEvent('tab-reload', { detail: { tabId } }));
      break;

    case 'retry':
    case 'wait_and_retry':
      window.dispatchEvent(new CustomEvent('tab-retry', { detail: { tabId } }));
      break;

    case 'compress_and_reload':
      // First compress, then reload
      window.dispatchEvent(new CustomEvent('tab-compress-and-reload', { detail: { tabId } }));
      break;

    default:
      window.dispatchEvent(new CustomEvent('tab-reload', { detail: { tabId } }));
  }
}

// ─── Tab Lifecycle Integration ──────────────────────────────────────────────

/**
 * Setup tab lifecycle hooks for crash tracking
 */
export function setupTabLifecycleHooks() {
  const store = useTabStore.getState();

  // Override addTab to create error boundary
  const originalAddTab = store.addTab.bind(store);
  store.addTab = (url, options) => {
    const tabId = originalAddTab(url, options);
    isolationManager.createBoundary(tabId);
    return tabId;
  };

  // Override removeTab to cleanup boundary
  const originalRemoveTab = store.removeTab.bind(store);
  store.removeTab = (tabId) => {
    isolationManager.removeBoundary(tabId);
    originalRemoveTab(tabId);
  };

  console.log('[Isolation] Tab lifecycle hooks setup');
}

/**
 * Initialize process isolation
 */
export function initProcessIsolation(globalHandler) {
  // Setup hooks
  setupTabLifecycleHooks();

  // Set global handler
  if (globalHandler) {
    isolationManager.setGlobalHandler(globalHandler);
  }

  console.log('[Isolation] Process isolation initialized');
  console.log('[Isolation] Crash stats:', isolationManager.getCrashStats());
}

// Export manager
export { isolationManager };
