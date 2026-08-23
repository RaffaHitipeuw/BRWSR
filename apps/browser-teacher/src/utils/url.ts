
export const DEFAULT_HOME = "https://www.google.com";

export const SEARCH_ENGINES: Record<string, string> = {
  google: "https://www.google.com/search?q=",
  bing: "https://www.bing.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
};

export const DEFAULT_SEARCH = "google";


export function parseUrl(input: string, searchEngine: string = DEFAULT_SEARCH) {
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
