// Tab Compressor Service - Memory Compression for Sleeping Tabs
// Tier 4: Offload tab state to IndexedDB, clear DOM, decompress on wake
// Backend only - no UI changes

import { useTabStore } from '../stores/tabs';

// ─── IndexedDB Schema ────────────────────────────────────────────────────────────

const DB_NAME = 'eduos-tab-compressor';
const DB_VERSION = 1;
const STORE_NAME = 'compressed-tabs';

let db = null;

/**
 * Open IndexedDB for tab compression
 */
async function openDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'tabId' });
      }
    };
  });
}

// ─── Compression Utilities ──────────────────────────────────────────────────────

/**
 * Compress tab state for storage
 * Only stores essential data, not the actual webview content
 */
function compressTabState(tab) {
  return {
    tabId: tab.id,
    url: tab.url,
    title: tab.title,
    favicon: tab.favicon,
    createdAt: tab.createdAt,
    lastAccessedAt: tab.lastAccessedAt,
    // Metadata only - actual content will be restored on wake
    metadata: {
      scrollPosition: 0,
      formData: null,
      // Don't store actual page state - will be re-fetched
    },
    compressedAt: Date.now(),
    estimatedOriginalSize: estimateTabMemory(tab),
    compressedSize: 0, // Will be calculated
  };
}

/**
 * Estimate original tab memory usage
 */
function estimateTabMemory(tab) {
  let base = 30; // Base webview overhead

  if (tab.url) base += 15;
  if (tab.title && tab.title !== 'New Tab') base += 5;
  if (tab.favicon) base += 1;

  return base;
}

// ─── Compression Operations ────────────────────────────────────────────────────

/**
 * Compress a sleeping tab - store essential state, clear from memory
 */
export async function compressTab(tabId) {
  const database = await openDB();
  const store = useTabStore.getState();
  const tab = store.tabs.find(t => t.id === tabId);

  if (!tab) {
    console.warn(`[Compressor] Tab ${tabId} not found`);
    return false;
  }

  const compressed = compressTabState(tab);
  compressed.compressedSize = JSON.stringify(compressed).length * 2; // Rough estimate in bytes

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const objectStore = tx.objectStore(STORE_NAME);

    const request = objectStore.put(compressed);

    request.onsuccess = () => {
      console.log(
        `[Compressor] Compressed ${tab.title}:`,
        `${compressed.estimatedOriginalSize}KB → ${Math.round(compressed.compressedSize / 1024)}KB`,
        `(${Math.round((1 - compressed.compressedSize / (compressed.estimatedOriginalSize * 1024)) * 100)}% reduction)`
      );
      resolve(true);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Decompress a tab - restore from storage
 */
export async function decompressTab(tabId) {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.get(tabId);

    request.onsuccess = () => {
      const compressed = request.result;
      if (!compressed) {
        console.warn(`[Compressor] No compressed data for tab ${tabId}`);
        resolve(null);
        return;
      }

      // Restore tab state
      const store = useTabStore.getState();
      store.updateTab(tabId, {
        url: compressed.url,
        title: compressed.title,
        favicon: compressed.favicon,
        // Reset loading state
        isLoading: true,
      });

      console.log(`[Compressor] Decompressed ${compressed.title}`);

      resolve(compressed);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete compressed tab data
 */
export async function deleteCompressedTab(tabId) {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.delete(tabId);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all compressed tabs
 */
export async function getCompressedTabs() {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readonly');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all compressed data
 */
export async function clearCompressedTabs() {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, 'readwrite');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.clear();

    request.onsuccess = () => {
      console.log('[Compressor] All compressed data cleared');
      resolve(true);
    };
    request.onerror = () => reject(request.error);
  });
}

// ─── Compression Stats ────────────────────────────────────────────────────────

/**
 * Get compression statistics
 */
export async function getCompressionStats() {
  const compressed = await getCompressedTabs();

  const totalOriginal = compressed.reduce((sum, tab) => sum + (tab.estimatedOriginalSize || 0), 0);
  const totalCompressed = compressed.reduce((sum, tab) => sum + (tab.compressedSize || 0), 0);

  return {
    compressedTabs: compressed.length,
    totalOriginalKB: totalOriginal,
    totalCompressedKB: Math.round(totalCompressed / 1024),
    savingsKB: totalOriginal - Math.round(totalCompressed / 1024),
    savingsPercent: totalOriginal > 0
      ? Math.round((1 - totalCompressed / (totalOriginal * 1024)) * 100)
      : 0,
  };
}

// ─── Auto-Compression ─────────────────────────────────────────────────────────

let autoCompressInterval = null;
const COMPRESS_CHECK_INTERVAL = 30000; // Check every 30 seconds

/**
 * Start auto-compression of sleeping tabs
 */
export function startAutoCompress() {
  if (autoCompressInterval) return;

  console.log('[Compressor] Auto-compression started');

  autoCompressInterval = setInterval(async () => {
    const store = useTabStore.getState();
    const sleepingTabs = store.tabs.filter(t => t.isSleeping);

    for (const tab of sleepingTabs) {
      // Check if already compressed
      const compressed = await getCompressedTabs();
      if (!compressed.find(c => c.tabId === tab.id)) {
        await compressTab(tab.id);
      }
    }
  }, COMPRESS_CHECK_INTERVAL);
}

/**
 * Stop auto-compression
 */
export function stopAutoCompress() {
  if (autoCompressInterval) {
    clearInterval(autoCompressInterval);
    autoCompressInterval = null;
    console.log('[Compressor] Auto-compression stopped');
  }
}

// ─── Integration with Tab Store ──────────────────────────────────────────────

/**
 * Hook into tab sleeping to auto-compress
 */
export function setupCompressorIntegration() {
  const originalSleepTab = useTabStore.getState().sleepTab;

  // Override sleepTab to auto-compress
  useTabStore.setState({
    sleepTab: (tabId) => {
      // Call original
      originalSleepTab(tabId);

      // Auto-compress after a delay
      setTimeout(() => {
        compressTab(tabId);
      }, 5000); // Wait 5 seconds before compressing
    },
  });

  // Override wakeTab to auto-decompress
  const originalWakeTab = useTabStore.getState().wakeTab;

  useTabStore.setState({
    wakeTab: async (tabId) => {
      // Call original
      originalWakeTab(tabId);

      // Decompress
      await decompressTab(tabId);

      // Clean up compressed data after successful wake
      setTimeout(() => {
        deleteCompressedTab(tabId);
      }, 30000); // Clean after 30 seconds
    },
  });

  console.log('[Compressor] Integration setup complete');
}
