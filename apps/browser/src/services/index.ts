// Essential services only - minimal footprint
export { getStorageItem, setStorageItem, removeStorageItem } from './storage';
export { syncHistoryToGas, clearGasHistory, testGasConnection } from './gasSync';
export { getFavicon, preloadFavicons, clearFaviconCache } from './cache';
export { clearAllData, getStorageStats } from './memory';
