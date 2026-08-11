// Cache Service - minimal favicon only

const cache = new Map<string, string>();
const MAX_CACHE = 50;

const FAVICON_FALLBACK =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjZDNkM2QzIiBzdHJva2U9Im5vbmUiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHJ4PSI0Ii8+PC9zdmc+";

export function getFavicon(url: string): string {
  try {
    const domain = new URL(url).hostname;
    if (cache.has(domain)) return cache.get(domain)!;
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(domain, FAVICON_FALLBACK);
    return FAVICON_FALLBACK;
  } catch {
    return FAVICON_FALLBACK;
  }
}

export function preloadFavicons(_urls: string[]) {}

export function clearFaviconCache() {
  cache.clear();
}
