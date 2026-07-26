// Cache Service - Service Worker Integration
// Backend only - no UI changes

// ─── Cache API ────────────────────────────────────────────────────────────────

/**
 * Cache data in IndexedDB (for larger data)
 */
export class IndexedDBCache {
  constructor(name, version = 1) {
    this.dbName = name;
    this.dbVersion = version;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        this.onUpgrade?.(event.target.result);
      };
    });
  }

  async get(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async set(storeName, key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(value, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async delete(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAll(storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}

// ─── Predefined Caches ──────────────────────────────────────────────────────

const historyCache = new IndexedDBCache('eduos-history', 1);
const bookmarksCache = new IndexedDBCache('eduos-bookmarks', 1);
const sessionCache = new IndexedDBCache('eduos-session', 1);

// Setup schema
historyCache.onUpgrade = (db) => {
  if (!db.objectStoreNames.contains('items')) {
    db.createObjectStore('items', { keyPath: 'id' });
  }
};

bookmarksCache.onUpgrade = (db) => {
  if (!db.objectStoreNames.contains('items')) {
    db.createObjectStore('items', { keyPath: 'id' });
  }
};

sessionCache.onUpgrade = (db) => {
  if (!db.objectStoreNames.contains('session')) {
    db.createObjectStore('session', { keyPath: 'id' });
  }
};

// ─── History Cache ──────────────────────────────────────────────────────────

export async function cacheHistoryItem(item) {
  await historyCache.open();
  await historyCache.set('items', item.id, {
    ...item,
    cachedAt: Date.now(),
  });
}

export async function getCachedHistory() {
  await historyCache.open();
  return historyCache.getAll('items');
}

export async function clearHistoryCache() {
  await historyCache.open();
  await historyCache.clear('items');
}

// ─── Bookmarks Cache ─────────────────────────────────────────────────────────

export async function cacheBookmark(bookmark) {
  await bookmarksCache.open();
  await bookmarksCache.set('items', bookmark.id, {
    ...bookmark,
    cachedAt: Date.now(),
  });
}

export async function getCachedBookmarks() {
  await bookmarksCache.open();
  return bookmarksCache.getAll('items');
}

// ─── Session Cache ────────────────────────────────────────────────────────────

export async function cacheSession(session) {
  await sessionCache.open();
  await sessionCache.set('session', 'current', {
    ...session,
    cachedAt: Date.now(),
  });

  // Also notify service worker
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_SESSION',
      data: session,
    });
  }
}

export async function getCachedSession() {
  await sessionCache.open();
  return sessionCache.get('session', 'current');
}

// ─── Service Worker Communication ────────────────────────────────────────────

let swMessageHandler = null;

/**
 * Listen for messages from service worker
 */
export function onServiceWorkerMessage(handler) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      handler(event.data);
    });
  }
  swMessageHandler = handler;
}

/**
 * Send message to service worker
 */
export function sendToServiceWorker(message) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  }
}

/**
 * Request cache update from service worker
 */
export function requestCacheUpdate(urls) {
  sendToServiceWorker({
    type: 'CACHE_URLS',
    urls,
  });
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  sendToServiceWorker({
    type: 'CLEAR_CACHE',
  });

  // Also clear IndexedDB caches
  Promise.all([
    clearHistoryCache(),
    bookmarksCache.clear('items'),
    sessionCache.clear('session'),
  ]);
}

// ─── Cache Statistics ────────────────────────────────────────────────────────

export async function getCacheStats() {
  const history = await getCachedHistory().catch(() => []);
  const bookmarks = await getCachedBookmarks().catch(() => []);
  const session = await getCachedSession().catch(() => null);

  return {
    historyCount: history.length,
    bookmarksCount: bookmarks.length,
    sessionCached: !!session,
    lastCacheUpdate: Math.max(
      ...history.map((h) => h.cachedAt || 0),
      0
    ),
  };
}

// Export cache instances for direct access
export { historyCache, bookmarksCache, sessionCache };
