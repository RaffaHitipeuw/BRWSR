// Memory Manager Service - Tab Sleeping & Memory Optimization
// Backend only - no UI changes

import { useTabStore } from '../stores/tabs';
import {
  compressTab,
  decompressTab,
  getCompressionStats,
} from './tabCompressor';

// ─── Constants ────────────────────────────────────────────────────────────────
const MEMORY_CHECK_INTERVAL = 10000; // Check every 10 seconds
const ACTIVITY_DEBOUNCE = 5000; // Debounce activity checks
const MEMORY_SAMPLE_INTERVAL = 30000; // Sample memory every 30 seconds
const COMPRESS_AFTER_MS = 10000; // Compress after 10 seconds of sleep

// ─── State ─────────────────────────────────────────────────────────────────
let checkInterval = null;
let memorySampleInterval = null;
let lastActivity = Date.now();

// ─── WebView Control ──────────────────────────────────────────────────────
const webviewControl = {
  // Store webview refs and their states
  webviews: new Map(), // tabId -> { webview, element, isActive }

  // Register a webview for a tab
  register(tabId, webviewElement) {
    this.webviews.set(tabId, {
      element: webviewElement,
      isActive: false,
    });
  },

  // Unregister a webview (tab closed)
  unregister(tabId) {
    this.webviews.delete(tabId);
  },

  // Get webview for a tab
  get(tabId) {
    return this.webviews.get(tabId);
  },

  // Sleep a webview (suspend)
  sleep(tabId) {
    const wv = this.webviews.get(tabId);
    if (!wv || !wv.element) return;

    try {
      // Stop loading if any
      if (wv.element.stop) {
        wv.element.stop();
      }
      // Note: We can't fully pause a webview in Electron
      // But we can reduce its priority and clear some memory
      wv.isActive = false;
    } catch (e) {
      console.warn(`Failed to sleep webview ${tabId}:`, e);
    }
  },

  // Wake a webview (resume)
  wake(tabId) {
    const wv = this.webviews.get(tabId);
    if (!wv || !wv.element) return;

    try {
      wv.isActive = true;
      // WebView will auto-reload when made visible
    } catch (e) {
      console.warn(`Failed to wake webview ${tabId}:`, e);
    }
  },

  // Get all registered webviews
  getAll() {
    return Array.from(this.webviews.entries()).map(([id, data]) => ({
      tabId: id,
      ...data,
    }));
  },

  // Clear all
  clear() {
    this.webviews.clear();
  },
};

// ─── Memory Estimation ─────────────────────────────────────────────────────
function estimateTabMemory(tab) {
  // Rough estimation based on tab state
  let base = 15; // Base memory for empty tab

  if (tab.url && !tab.url.includes('about:')) {
    base += 10; // Content loaded
  }

  if (tab.title && tab.title !== 'New Tab') {
    base += 5; // Title updated = page likely loaded
  }

  // Add random variance for simulation
  base += Math.random() * 10;

  return Math.round(base);
}

// ─── Sleep Manager ─────────────────────────────────────────────────────────
function checkAndSleepTabs() {
  const state = useTabStore.getState();
  const { tabs, activeTabId, sleepTimeout, enableTabSleeping } = state;

  if (!enableTabSleeping) return;

  const now = Date.now();

  for (const tab of tabs) {
    // Skip if already sleeping
    if (tab.isSleeping) continue;

    // Skip active tab
    if (tab.id === activeTabId) continue;

    // Check if inactive long enough
    const inactiveTime = now - tab.lastAccessedAt;
    if (inactiveTime >= sleepTimeout) {
      // Sleep this tab
      useTabStore.getState().sleepTab(tab.id);
      webviewControl.sleep(tab.id);
    }
  }
}

function sampleMemory() {
  const state = useTabStore.getState();

  // Update memory estimates for all tabs
  for (const tab of state.tabs) {
    const estimated = estimateTabMemory(tab);
    state.updateTabMemory(tab.id, estimated);
  }

  // Check memory limits
  state.enforceMemoryLimits();
}

// ─── Activity Tracking ────────────────────────────────────────────────────
function recordActivity(tabId) {
  lastActivity = Date.now();

  // If a sleeping tab becomes active, wake it
  const tab = useTabStore.getState().getTab(tabId);
  if (tab?.isSleeping) {
    useTabStore.getState().wakeTab(tabId);
    webviewControl.wake(tabId);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Start the memory manager
 */
export function startMemoryManager() {
  if (checkInterval) return; // Already running

  console.log('🧠 Memory Manager started');

  // Start periodic checks
  checkInterval = setInterval(checkAndSleepTabs, MEMORY_CHECK_INTERVAL);
  memorySampleInterval = setInterval(sampleMemory, MEMORY_SAMPLE_INTERVAL);

  // Initial check
  sampleMemory();
  checkAndSleepTabs();
}

/**
 * Stop the memory manager
 */
export function stopMemoryManager() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  if (memorySampleInterval) {
    clearInterval(memorySampleInterval);
    memorySampleInterval = null;
  }

  webviewControl.clear();
  console.log('🧠 Memory Manager stopped');
}

/**
 * Register a webview for tab sleeping management
 */
export function registerWebview(tabId, webviewElement) {
  webviewControl.register(tabId, webviewElement);
}

/**
 * Unregister a webview
 */
export function unregisterWebview(tabId) {
  webviewControl.unregister(tabId);
}

/**
 * Record activity on a tab (used to prevent sleeping)
 */
export function recordTabActivity(tabId) {
  recordActivity(tabId);
}

/**
 * Force sleep a specific tab
 */
export function sleepTab(tabId) {
  useTabStore.getState().sleepTab(tabId);
  webviewControl.sleep(tabId);
}

/**
 * Force wake a specific tab
 */
export function wakeTab(tabId) {
  useTabStore.getState().wakeTab(tabId);
  webviewControl.wake(tabId);
}

/**
 * Get memory stats
 */
export async function getMemoryStats() {
  const state = useTabStore.getState();
  const awake = state.getAwakeTabs();
  const sleeping = state.getSleepingTabs();
  const totalMB = state.getTotalMemoryUsage();

  // Get compression stats
  let compression = null;
  try {
    compression = await getCompressionStats();
  } catch (e) {
    // IndexedDB might not be available
  }

  return {
    totalTabs: state.tabs.length,
    awakeCount: awake.length,
    sleepingCount: sleeping.length,
    totalMemoryMB: totalMB,
    memoryLimitMB: state.maxTabs * 100,
    lastActivity: new Date(lastActivity).toISOString(),
    compression,
  };
}

// Export webview control for direct access if needed
export { webviewControl };
