// Search suggestion service - provides autocomplete from bookmarks and history

export interface Suggestion {
  type: string;
  title: string;
  url: string;
  icon: string;
  score?: number;
}

export function getSuggestions(query: string, _searchEngine: string = 'google'): Suggestion[] {
  // This would integrate with bookmarks and history stores
  // For now, return empty array - suggestions are disabled
  return [];
}

export function updateBookmarkSuggestions(bookmarks: Array<{ id: string; title: string; url: string; favicon?: string }>): void {
  // Update bookmark suggestions cache
}

export function updateHistorySuggestions(history: Array<{ id: string; url: string; title: string }>): void {
  // Update history suggestions cache
}
