// URL utilities

// Default homepage - Google
export const DEFAULT_HOME = 'https://www.google.com';

// Search engine URLs
export const SEARCH_ENGINES: Record<string, string> = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
};

// Default search engine
export const DEFAULT_SEARCH = 'google';

/**
 * Parse and validate URL
 */
export function parseUrl(input: string, searchEngine: string = DEFAULT_SEARCH) {
  const trimmed = input.trim();

  if (!trimmed) {
    return { url: DEFAULT_HOME, type: 'home' };
  }

  // Already a valid URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { url: trimmed, type: 'url' };
  }

  // Has domain pattern (e.g., example.com)
  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    return { url: `https://${trimmed}`, type: 'url' };
  }

  // Search query - use Google
  const searchUrl = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.google;
  return {
    url: `${searchUrl}${encodeURIComponent(trimmed)}`,
    type: 'search'
  };
}

/**
 * Get search URL
 */
export function getSearchUrl(query: string, engine: string = DEFAULT_SEARCH) {
  const searchUrl = SEARCH_ENGINES[engine] || SEARCH_ENGINES.google;
  return `${searchUrl}${encodeURIComponent(query)}`;
}

/**
 * Extract domain from URL
 */
export function getDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Check if URL is valid
 */
export function isValidUrl(string: string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if URL is secure (https)
 */
export function isSecureUrl(url: string) {
  return url?.startsWith('https://');
}
