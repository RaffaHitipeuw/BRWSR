// Predictive Loader - Tier 9: AI-ish Tab Preloading
// Backend only - no UI changes

import { useTabStore } from '../stores/tabs';

/**
 * Predictive Loader
 *
 * Goals:
 * 1. Learn tab usage patterns
 * 2. Preload links on hover
 * 3. Time-based tab pre-warming
 * 4. Click prediction
 */

/**
 * Storage keys
 */
const PATTERNS_KEY = 'eduos-prediction-patterns';
const HOVER_CACHE_KEY = 'eduos-hover-cache';

/**
 * Prediction patterns storage
 */
const patterns = {
  // URL patterns
  urlPatterns: new Map(),
  // Time-based patterns (hour -> frequent URLs)
  timePatterns: new Map(),
  // Sequence patterns (URL A -> URL B)
  sequencePatterns: new Map(),
  // Hover patterns (URL -> URLs user hovered)
  hoverPatterns: new Map(),
};

/**
 * Initialize patterns from storage
 */
function loadPatterns() {
  const stored = localStorage.getItem(PATTERNS_KEY);
  if (stored) {
    try {
      const data = JSON.parse(stored);
      patterns.urlPatterns = new Map(data.urlPatterns || []);
      patterns.timePatterns = new Map(data.timePatterns || []);
      patterns.sequencePatterns = new Map(data.sequencePatterns || []);
      patterns.hoverPatterns = new Map(data.hoverPatterns || []);
      console.log('[Predict] Patterns loaded');
    } catch (e) {
      console.warn('[Predict] Failed to load patterns:', e);
    }
  }
}

/**
 * Save patterns to storage
 */
function savePatterns() {
  try {
    localStorage.setItem(PATTERNS_KEY, JSON.stringify({
      urlPatterns: Array.from(patterns.urlPatterns.entries()),
      timePatterns: Array.from(patterns.timePatterns.entries()),
      sequencePatterns: Array.from(patterns.sequencePatterns.entries()),
      hoverPatterns: Array.from(patterns.hoverPatterns.entries()),
    }));
  } catch (e) {
    console.warn('[Predict] Failed to save patterns:', e);
  }
}

// ─── Pattern Learning ─────────────────────────────────────────────────

/**
 * Record tab visit
 */
export function recordTabVisit(tabId, url, title) {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // URL frequency
  const count = patterns.urlPatterns.get(url) || 0;
  patterns.urlPatterns.set(url, count + 1);

  // Time patterns
  if (!patterns.timePatterns.has(hour)) {
    patterns.timePatterns.set(hour, new Map());
  }
  const hourMap = patterns.timePatterns.get(hour);
  hourMap.set(url, (hourMap.get(url) || 0) + 1);

  savePatterns();
  console.log(`[Predict] Recorded visit: ${url}`);
}

/**
 * Record navigation sequence
 */
export function recordSequence(fromUrl, toUrl) {
  if (!fromUrl || !toUrl || fromUrl === toUrl) return;

  const count = patterns.sequencePatterns.get(fromUrl) || new Map();
  count.set(toUrl, (count.get(toUrl) || 0) + 1);
  patterns.sequencePatterns.set(fromUrl, count);

  savePatterns();
}

/**
 * Record hover on link
 */
export function recordHover(sourceUrl, targetUrl) {
  if (!sourceUrl || !targetUrl) return;

  const targets = patterns.hoverPatterns.get(sourceUrl) || new Set();
  targets.add(targetUrl);
  patterns.hoverPatterns.set(sourceUrl, targets);

  savePatterns();
}

// ─── Predictions ──────────────────────────────────────────────────

/**
 * Get predicted next tabs based on current URL
 */
export function predictNextTabs(currentUrl, limit = 3) {
  const predictions = [];

  // 1. Sequence prediction: what tabs usually follow this URL?
  const sequenceMap = patterns.sequencePatterns.get(currentUrl);
  if (sequenceMap) {
    const sorted = Array.from(sequenceMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    predictions.push(...sorted.map(([url, count]) => ({
      url,
      confidence: Math.min(1, count / 10),
      reason: 'sequence',
    })));
  }

  // 2. Time-based prediction: what tabs at this hour?
  const hour = new Date().getHours();
  const timeMap = patterns.timePatterns.get(hour);
  if (timeMap) {
    const sorted = Array.from(timeMap.entries())
      .filter(([url]) => url !== currentUrl)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    predictions.push(...sorted.map(([url, count]) => ({
      url,
      confidence: Math.min(1, count / 5),
      reason: 'time',
    })));
  }

  // Deduplicate and sort by confidence
  const seen = new Set();
  const unique = predictions.filter(p => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });

  return unique.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get pre-warming predictions for current time
 */
export function getWarmUpPredictions(limit = 5) {
  const hour = new Date().getHours();
  const timeMap = patterns.timePatterns.get(hour);

  if (!timeMap || timeMap.size === 0) {
    // Fallback to most frequent overall
    const sorted = Array.from(patterns.urlPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return sorted.map(([url, count]) => ({
      url,
      confidence: Math.min(1, count / 20),
      reason: 'frequency',
    }));
  }

  return Array.from(timeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([url, count]) => ({
      url,
      confidence: Math.min(1, count / 5),
      reason: 'time',
    }));
}

// ─── Hover Prediction ──────────────────────────────────────────────

/**
 * Preload URL on hover (debounced)
 */
const hoverPreloads = new Map();
const HOVER_PRELOAD_DELAY = 200; // ms before preload
const MAX_PRELOADED = 5;

let preloadTimeout = null;

/**
 * Start hover preload timer
 */
export function startHoverPreload(url) {
  if (!url || hoverPreloads.has(url)) return;

  // Clear existing timeout
  if (preloadTimeout) {
    clearTimeout(preloadTimeout);
  }

  // Limit concurrent preloads
  if (hoverPreloads.size >= MAX_PRELOADED) {
    // Cancel oldest preload
    const oldest = hoverPreloads.keys().next().value;
    cancelHoverPreload(oldest);
  }

  preloadTimeout = setTimeout(() => {
    preloadUrl(url);
  }, HOVER_PRELOAD_DELAY);
}

/**
 * Preload a URL
 */
export function preloadUrl(url) {
  if (!url || hoverPreloads.has(url)) return;

  const entry = {
    startTime: Date.now(),
    status: 'loading',
  };

  hoverPreloads.set(url, entry);
  console.log(`[Predict] Preloading: ${url}`);

  // Create invisible link for preload
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'document';
  link.href = url;
  link.crossOrigin = 'anonymous';
  link.id = `preload-${Date.now()}`;
  document.head.appendChild(link);

  // Mark as preloaded after a delay (we can't actually know when it's cached)
  setTimeout(() => {
    entry.status = 'ready';
    entry.readyTime = Date.now();
  }, 1000);

  return entry;
}

/**
 * Cancel hover preload
 */
export function cancelHoverPreload(url) {
  if (!url) return;

  const entry = hoverPreloads.get(url);
  if (entry) {
    // Remove the link element
    const link = document.getElementById(`preload-${url}`);
    if (link) {
      link.remove();
    }

    hoverPreloads.delete(url);
    console.log(`[Predict] Cancelled preload: ${url}`);
  }
}

/**
 * Check if URL is preloaded
 */
export function isPreloaded(url) {
  const entry = hoverPreloads.get(url);
  return entry?.status === 'ready';
}

/**
 * Get hover cache stats
 */
export function getHoverCacheStats() {
  return {
    size: hoverPreloads.size,
    max: MAX_PRELOADED,
    entries: Array.from(hoverPreloads.entries()).map(([url, entry]) => ({
      url,
      status: entry.status,
      duration: entry.status === 'ready'
        ? entry.readyTime - entry.startTime
        : Date.now() - entry.startTime,
    })),
  };
}

/**
 * Clear hover cache
 */
export function clearHoverCache() {
  for (const url of hoverPreloads.keys()) {
    cancelHoverPreload(url);
  }
  hoverPreloads.clear();
}

// ─── Tab Pre-warming ───────────────────────────────────────────────

const warmTabs = new Map(); // url -> { tabId, warmed, status }

let warmupInterval = null;

/**
 * Start periodic tab warming
 */
export function startTabWarming(intervalMs = 60000) {
  if (warmupInterval) return;

  console.log('[Predict] Tab warming started');

  warmupInterval = setInterval(() => {
    warmPredictedTabs();
  }, intervalMs);

  // Initial warm-up
  warmPredictedTabs();
}

/**
 * Stop tab warming
 */
export function stopTabWarming() {
  if (warmupInterval) {
    clearInterval(warmupInterval);
    warmupInterval = null;
    console.log('[Predict] Tab warming stopped');
  }
}

/**
 * Warm predicted tabs
 */
async function warmPredictedTabs() {
  const predictions = getWarmUpPredictions(3);
  const store = useTabStore.getState();

  // Check if we have capacity
  const sleepingCount = store.tabs.filter(t => t.isSleeping).length;
  if (sleepingCount < 2) return; // Only warm if we have sleeping tabs

  for (const prediction of predictions) {
    // Check if already warmed
    if (warmTabs.has(prediction.url)) continue;

    // Check if tab already exists
    const existingTab = store.tabs.find(t => t.url === prediction.url);
    if (existingTab) continue;

    // Preload the URL
    preloadUrl(prediction.url);

    // Warm the tab in background (just create and immediately sleep)
    const tabId = store.addTab(prediction.url);

    // Immediately sleep it back
    setTimeout(() => {
      store.sleepTab(tabId);
    }, 1000);

    warmTabs.set(prediction.url, {
      tabId,
      confidence: prediction.confidence,
      warmedAt: Date.now(),
    });

    console.log(`[Predict] Warmed tab: ${prediction.url} (confidence: ${Math.round(prediction.confidence * 100)}%)`);
  }
}

// ─── Analytics ────────────────────────────────────────────────────

/**
 * Get prediction stats
 */
export function getPredictionStats() {
  return {
    urlPatterns: patterns.urlPatterns.size,
    timePatterns: patterns.timePatterns.size,
    sequencePatterns: patterns.sequencePatterns.size,
    hoverPatterns: patterns.hoverPatterns.size,
    hoverCache: hoverPreloads.size,
    warmedTabs: warmTabs.size,
  };
}

/**
 * Clear all patterns
 */
export function clearPatterns() {
  patterns.urlPatterns.clear();
  patterns.timePatterns.clear();
  patterns.sequencePatterns.clear();
  patterns.hoverPatterns.clear();
  savePatterns();
  console.log('[Predict] All patterns cleared');
}

// ─── Initialize ──────────────────────────────────────────────────

/**
 * Initialize prediction engine
 */
export function initPredictiveLoader() {
  loadPatterns();

  console.log('[Predict] Predictive loader initialized');
  console.log('[Predict] Stats:', getPredictionStats());

  // Start tab warming
  startTabWarming();

  // Periodic pattern cleanup
  setInterval(() => {
    // Remove low-confidence patterns
    for (const [url, count] of patterns.urlPatterns) {
      if (count < 2) {
        patterns.urlPatterns.delete(url);
      }
    }
    savePatterns();
  }, 5 * 60 * 1000); // Every 5 minutes
}
