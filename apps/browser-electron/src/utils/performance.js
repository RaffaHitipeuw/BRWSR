// Performance utilities - debounce, throttle, memoization

/**
 * Debounce function - delays execution until after wait milliseconds
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function - executes at most once per wait milliseconds
 */
export function throttle(func, wait = 300) {
  let lastTime = 0;
  let timeout = null;

  return function executedFunction(...args) {
    const now = Date.now();
    const remaining = wait - (now - lastTime);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastTime = now;
      func(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastTime = Date.now();
        timeout = null;
        func(...args);
      }, remaining);
    }
  };
}

/**
 * Create a simple LRU cache
 */
export function createLRUCache(maxSize = 100) {
  const cache = new Map();

  return {
    get(key) {
      if (!cache.has(key)) return undefined;
      const value = cache.get(key);
      // Move to end (most recently used)
      cache.delete(key);
      cache.set(key, value);
      return value;
    },

    set(key, value) {
      if (cache.has(key)) {
        cache.delete(key);
      } else if (cache.size >= maxSize) {
        // Delete oldest (first) entry
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set(key, value);
    },

    has(key) {
      return cache.has(key);
    },

    delete(key) {
      return cache.delete(key);
    },

    clear() {
      cache.clear();
    },

    get size() {
      return cache.size;
    },
  };
}

/**
 * Measure execution time
 */
export function measureTime(label, fn) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`⏱️ ${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}

/**
 * Memory-efficient array operations
 */
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJSONParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
