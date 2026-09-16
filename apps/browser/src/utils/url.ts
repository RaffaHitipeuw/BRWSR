// ═══════════════════════════════════════════════════════════════════════════════
// URL Parsing and Navigation Classification
// Handles the distinction between URLs and search queries
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_HOME = "https://www.google.com";

export const SEARCH_ENGINES: Record<string, string> = {
  google: "https://www.google.com/search?q=",
  bing: "https://www.bing.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
};

export const DEFAULT_SEARCH = "google";

// ─────────────────────────────────────────────────────────────────────────────
// URL Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses user input and determines whether it should be treated as a URL or search query.
 * Correctly handles:
 *   - Explicit http:// and https:// URLs (never search)
 *   - localhost and variants (always navigate with http://)
 *   - IPv4 addresses including private ranges (always navigate with http://)
 *   - Standard domain names (navigate with https://)
 *   - Everything else (search query)
 */
export function parseUrl(input: string, searchEngine: string = DEFAULT_SEARCH) {
  const trimmed = input.trim();

  if (!trimmed) {
    return { url: DEFAULT_HOME, type: "home" };
  }

  // 1. Explicit protocol — always navigate directly
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { url: trimmed, type: "url" };
  }

  // 2. Localhost patterns — always navigate with http://
  //    Covers: localhost, localhost:port, any.localhost
  if (isLocalhostHost(trimmed)) {
    const url = `http://${trimmed}`;
    return { url, type: "url" };
  }

  // 3. IPv4 addresses — always navigate with http://
  //    Covers: 127.0.0.1, 127.0.0.1:port, 192.168.x.x, 10.x.x.x, etc.
  if (isIPv4Address(trimmed)) {
    const url = `http://${trimmed}`;
    return { url, type: "url" };
  }

  // 4. Standard domain name — has dot, no spaces, navigate with https://
  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return { url: `https://${trimmed}`, type: "url" };
  }

  // 5. Everything else — search query
  const searchUrl = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.google;
  return {
    url: `${searchUrl}${encodeURIComponent(trimmed)}`,
    type: "search",
  };
}

/**
 * Check if the input is a localhost variant.
 * Matches: localhost, localhost:port, any.subdomain.localhost
 */
function isLocalhostHost(input: string): boolean {
  // Extract hostname (before first : or /)
  const host = input.split(":")[0].split("/")[0].toLowerCase();
  return host === "localhost" || host.endsWith(".localhost");
}

/**
 * Check if the input is an IPv4 address (including with port).
 * Matches: 127.0.0.1, 127.0.0.1:5173, 192.168.1.1, 10.0.0.1, etc.
 */
function isIPv4Address(input: string): boolean {
  // Extract the host part (before first : or /)
  const host = input.split(":")[0].split("/")[0];

  // IPv4 regex: 4 octets separated by dots, each 0-255
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = host.match(ipv4Regex);

  if (!match) {
    return false;
  }

  // Validate each octet is in range 0-255
  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255);
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy parseUrl — kept for backwards compatibility
// ─────────────────────────────────────────────────────────────────────────────

export function parseUrlLegacy(input: string, searchEngine: string = DEFAULT_SEARCH) {
  const trimmed = input.trim();

  if (!trimmed) {
    return { url: DEFAULT_HOME, type: "home" };
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { url: trimmed, type: "url" };
  }

  if (trimmed.includes(".") && !trimmed.includes(" ")) {
    return { url: `https://${trimmed}`, type: "url" };
  }

  const searchUrl = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.google;
  return {
    url: `${searchUrl}${encodeURIComponent(trimmed)}`,
    type: "search",
  };
}

export function getSearchUrl(query: string, engine: string = DEFAULT_SEARCH) {
  const searchUrl = SEARCH_ENGINES[engine] || SEARCH_ENGINES.google;
  return `${searchUrl}${encodeURIComponent(query)}`;
}

export function getDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function isValidUrl(string: string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

export function isSecureUrl(url: string) {
  return url?.startsWith("https://");
}
