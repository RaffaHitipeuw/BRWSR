// Storage service - unified storage utilities

const STORAGE_KEYS = {
  TABS: 'eduos-browser-tabs',
  HISTORY: 'eduos-browser-history',
  DOWNLOADS: 'eduos-browser-downloads',
  BOOKMARKS: 'eduos-browser-bookmarks',
  SESSION: 'eduos-browser-session',
  SETTINGS: 'eduos-browser-settings',
};

/**
 * Get item from localStorage
 */
export function getStorageItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Set item to localStorage
 */
export function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('Storage error:', e);
    return false;
  }
}

/**
 * Remove item from localStorage
 */
export function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear all browser-related storage
 */
export function clearAllStorage() {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}

/**
 * Get storage size in bytes (approximate)
 */
export function getStorageSize() {
  let size = 0;
  Object.values(STORAGE_KEYS).forEach(key => {
    const item = localStorage.getItem(key);
    if (item) {
      size += item.length * 2; // UTF-16
    }
  });
  return size;
}

export { STORAGE_KEYS };
