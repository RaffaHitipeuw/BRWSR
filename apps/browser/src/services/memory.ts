// Memory Management Service - lightweight only

/**
 * Get storage statistics
 */
export function getStorageStats() {
  const keys = [
    "eduos-browser-tabs",
    "eduos-browser-history",
    "eduos-browser-downloads",
    "eduos-browser-session",
    "eduos-browser-settings",
  ];

  let total = 0;
  const counts: Record<string, number> = {};

  for (const key of keys) {
    try {
      const data = localStorage.getItem(key);
      counts[key] = data ? JSON.parse(data).state?.items?.length || 0 : 0;
      total += counts[key];
    } catch {
      counts[key] = 0;
    }
  }

  return { counts, total };
}

/**
 * Clear all browser data
 */
export function clearAllData() {
  const keys = [
    "eduos-browser-tabs",
    "eduos-browser-history",
    "eduos-browser-downloads",
    "eduos-browser-session",
  ];
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

/**
 * Get single storage item
 */
export function getStorageItem<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Set single storage item
 */
export function setStorageItem(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Remove storage item
 */
export function removeStorageItem(key: string) {
  localStorage.removeItem(key);
}
