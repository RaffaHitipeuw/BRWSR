// Cache Service - Unified caching layer

import { createLRUCache } from '../utils/performance';

// ─── Favicon Cache ────────────────────────────────────────────────────────────
const faviconCache = createLRUCache(200);

// Cache favicon as data URL
const FAVICON_FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjZDNkM2QzIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0Ii8+PC9zdmc+';

/**
 * Get favicon from cache or fetch
 */
export async function getFavicon(url) {
  try {
    const domain = new URL(url).hostname;

    // Check cache first
    if (faviconCache.has(domain)) {
      return faviconCache.get(domain);
    }

    // Try to fetch favicon
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    // For now, return fallback (actual implementation would fetch)
    const cachedFavicon = FAVICON_FALLBACK;
    faviconCache.set(domain, cachedFavicon);

    return cachedFavicon;
  } catch {
    return FAVICON_FALLBACK;
  }
}

/**
 * Preload favicons for a list of URLs
 */
export async function preloadFavicons(urls) {
  const domains = new Set();

  urls.forEach(url => {
    try {
      domains.add(new URL(url).hostname);
    } catch {}
  });

  // Fire and forget - don't await
  domains.forEach(domain => {
    if (!faviconCache.has(domain)) {
      getFavicon(`https://${domain}`).catch(() => {});
    }
  });
}

/**
 * Clear favicon cache
 */
export function clearFaviconCache() {
  faviconCache.clear();
}

// ─── Suggestion Cache ─────────────────────────────────────────────────────────
const suggestionCache = createLRUCache(50);

/**
 * Get cached suggestions
 */
export function getCachedSuggestions(query) {
  return suggestionCache.get(query.toLowerCase());
}

/**
 * Cache suggestions
 */
export function cacheSuggestions(query, suggestions) {
  suggestionCache.set(query.toLowerCase(), suggestions);
}

/**
 * Clear suggestion cache
 */
export function clearSuggestionCache() {
  suggestionCache.clear();
}

// ─── Export all caches ─────────────────────────────────────────────────────────
export function clearAllCaches() {
  clearFaviconCache();
  clearSuggestionCache();
}

export { faviconCache, suggestionCache };
