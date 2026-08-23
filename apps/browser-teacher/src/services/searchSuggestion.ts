
export interface Suggestion {
  type: string;
  title: string;
  url: string;
  icon: string;
  score?: number;
}

export function getSuggestions(query: string, _searchEngine: string = "google"): Suggestion[] {
  return [];
}

export function updateBookmarkSuggestions(
  bookmarks: Array<{ id: string; title: string; url: string; favicon?: string }>,
): void {
}

export function updateHistorySuggestions(
  history: Array<{ id: string; url: string; title: string }>,
): void {
}
