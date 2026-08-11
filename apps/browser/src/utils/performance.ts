// Performance utilities - debounce, throttle, memoization

/**
 * Debounce function - delays execution until after wait milliseconds
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 300,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      if (timeout) clearTimeout(timeout);
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function - executes at most once per wait milliseconds
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 300,
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLRUCache<T = any>(maxSize: number = 100) {
  const cache = new Map<string, T>();

  return {
    get(key: string): T | undefined {
      if (!cache.has(key)) return undefined;
      const value = cache.get(key);
      // Move to end (most recently used)
      cache.delete(key);
      cache.set(key, value!);
      return value;
    },

    set(key: string, value: T) {
      if (cache.has(key)) {
        cache.delete(key);
      } else if (cache.size >= maxSize) {
        // Delete oldest (first) entry
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set(key, value);
    },

    has(key: string): boolean {
      return cache.has(key);
    },

    delete(key: string): boolean {
      return cache.delete(key);
    },

    clear() {
      cache.clear();
    },

    get size(): number {
      return cache.size;
    },
  };
}

/**
 * Measure execution time
 */
export function measureTime<T>(label: string, fn: () => T): T {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  console.log(`⏱️ ${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}

/**
 * Memory-efficient array operations
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Safe JSON parse with fallback
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeJSONParse<T = any>(str: string, fallback: T | null = null): T | null {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
