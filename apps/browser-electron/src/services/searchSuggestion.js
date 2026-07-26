// Search Suggestion Service - Optimized with caching

import { debounce } from '../utils/performance';
import { getCachedSuggestions, cacheSuggestions } from './cache';

// Browser bookmarks for suggestions
let bookmarkSuggestions = [];

// Browser history for suggestions
let historySuggestions = [];

/**
 * Update bookmark suggestions
 */
export function updateBookmarkSuggestions(bookmarks) {
  bookmarkSuggestions = (bookmarks || [])
    .slice(0, 20)
    .map((b) => ({
      type: 'bookmark',
      title: b.title,
      url: b.url,
      icon: '📌',
    }));
}

/**
 * Update history suggestions
 */
export function updateHistorySuggestions(history) {
  historySuggestions = (history || [])
    .slice(0, 50)
    .map((h) => ({
      type: 'history',
      title: h.title || h.url,
      url: h.url,
      icon: '📜',
    }));
}

/**
 * Get search suggestions based on query
 */
export function getSuggestions(query, searchEngine = 'google') {
  if (!query || query.length < 1) {
    return [];
  }

  // Check cache first
  const cached = getCachedSuggestions(query);
  if (cached) {
    return cached;
  }

  const q = query.toLowerCase();
  const suggestions = [];

  // Check if it's a URL
  const isLikelyUrl = /^[a-zA-Z0-9]+\.[a-zA-Z]/i.test(query) ||
                      query.includes('://');

  if (isLikelyUrl) {
    // Search history for matching URLs
    const urlMatches = historySuggestions
      .filter((h) => h.url.toLowerCase().includes(q))
      .slice(0, 5)
      .map((h) => ({ ...h, score: 100 }));

    suggestions.push(...urlMatches);
  } else {
    // Search in bookmarks (higher priority)
    const bookmarkMatches = bookmarkSuggestions
      .filter((b) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q)
      )
      .slice(0, 3)
      .map((b) => ({ ...b, score: 80 }));

    suggestions.push(...bookmarkMatches);

    // Search in history
    const historyMatches = historySuggestions
      .filter((h) =>
        h.title.toLowerCase().includes(q) ||
        h.url.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((h) => ({ ...h, score: 60 }));

    suggestions.push(...historyMatches);

    // Add search engine suggestion
    suggestions.push({
      type: 'search',
      title: `Search "${query}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      icon: '🔍',
      score: 50,
    });
  }

  // Sort and deduplicate
  const seen = new Set();
  const unique = suggestions.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  const result = unique.sort((a, b) => b.score - a.score).slice(0, 8);

  // Cache the result
  cacheSuggestions(query, result);

  return result;
}

// ─── Debounced suggestion getter ─────────────────────────────────────────────
let debouncedGetSuggestions = null;

/**
 * Get debounced suggestions (300ms delay)
 */
export function getDebouncedSuggestions(query, searchEngine, callback) {
  if (!debouncedGetSuggestions) {
    debouncedGetSuggestions = debounce((q, engine) => {
      const results = getSuggestions(q, engine);
      callback(results);
    }, 300);
  }

  debouncedGetSuggestions(query, searchEngine);
}
