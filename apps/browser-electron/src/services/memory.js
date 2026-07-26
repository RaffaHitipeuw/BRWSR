// Memory Management Service

// ─── Storage Limits ────────────────────────────────────────────────────────────
const STORAGE_LIMITS = {
  history: 500,       // Max 500 history items
  bookmarks: 200,     // Max 200 bookmarks
  downloads: 100,     // Max 100 downloads
  session: 10,        // Max 10 sessions
};

// ─── Auto Cleanup ──────────────────────────────────────────────────────────────
let cleanupInterval = null;

/**
 * Start automatic cleanup
 */
export function startAutoCleanup(getStores) {
  if (cleanupInterval) return;

  // Run cleanup every 5 minutes
  cleanupInterval = setInterval(() => {
    runCleanup(getStores);
  }, 5 * 60 * 1000);

  // Also run once on start
  setTimeout(() => runCleanup(getStores), 1000);
}

/**
 * Stop automatic cleanup
 */
export function stopAutoCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Run cleanup on all stores
 */
export function runCleanup(getStores) {
  const stores = getStores();

  // Cleanup history
  if (stores.history) {
    const historyItems = stores.history.items || [];
    if (historyItems.length > STORAGE_LIMITS.history) {
      const toRemove = historyItems.length - STORAGE_LIMITS.history;
      // Remove oldest items
      for (let i = 0; i < toRemove; i++) {
        stores.history.removeItem?.(historyItems[historyItems.length - 1 - i]?.id);
      }
      console.log(`🧹 Cleanup: Removed ${toRemove} old history items`);
    }
  }

  // Cleanup downloads (keep only last 100)
  if (stores.downloads) {
    const downloads = stores.downloads.items || [];
    if (downloads.length > STORAGE_LIMITS.downloads) {
      const completed = downloads.filter(d => d.status === 'completed');
      if (completed.length > STORAGE_LIMITS.downloads / 2) {
        stores.downloads.clearCompleted?.();
        console.log('🧹 Cleanup: Cleared completed downloads');
      }
    }
  }

  // Cleanup sessions (keep only last 10)
  if (stores.session) {
    const sessions = stores.session.savedSessions || [];
    if (sessions.length > STORAGE_LIMITS.session) {
      const toRemove = sessions.slice(STORAGE_LIMITS.session);
      toRemove.forEach(s => stores.session.deleteSession?.(s.id));
      console.log(`🧹 Cleanup: Removed ${toRemove.length} old sessions`);
    }
  }
}

/**
 * Get storage statistics
 */
export function getStorageStats() {
  const stats = {
    history: 0,
    bookmarks: 0,
    downloads: 0,
    session: 0,
    total: 0,
  };

  try {
    const history = localStorage.getItem('eduos-browser-history');
    const bookmarks = localStorage.getItem('eduos-browser-bookmarks');
    const downloads = localStorage.getItem('eduos-browser-downloads');
    const session = localStorage.getItem('eduos-browser-session');

    if (history) stats.history = JSON.parse(history)?.state?.items?.length || 0;
    if (bookmarks) stats.bookmarks = JSON.parse(bookmarks)?.state?.items?.length || 0;
    if (downloads) stats.downloads = JSON.parse(downloads)?.state?.items?.length || 0;
    if (session) stats.session = JSON.parse(session)?.state?.savedSessions?.length || 0;

    stats.total = stats.history + stats.bookmarks + stats.downloads;
  } catch (e) {
    console.error('Error getting storage stats:', e);
  }

  return stats;
}

/**
 * Clear all storage
 */
export function clearAllData() {
  const keys = [
    'eduos-browser-history',
    'eduos-browser-bookmarks',
    'eduos-browser-downloads',
    'eduos-browser-session',
    'eduos-browser-tabs',
  ];

  keys.forEach(key => localStorage.removeItem(key));
  console.log('🗑️ All browser data cleared');
}

/**
 * Force garbage collection hint (for memory profiling)
 */
export function hintGC() {
  // In browsers, we can't force GC, but we can hint
  if (typeof window !== 'undefined') {
    // Clear any image caches
    document.querySelectorAll('img[data-cached]').forEach(img => {
      img.src = '';
    });
  }
}

export { STORAGE_LIMITS };
