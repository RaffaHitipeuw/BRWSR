// useSearchSuggestions - Hook for search suggestions with debounce

import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from '../utils/performance';
import { getSuggestions, updateBookmarkSuggestions, updateHistorySuggestions } from '../services/searchSuggestion';
import { useBookmarksStore } from '../stores/bookmarks';
import { useHistoryStore } from '../stores/history';

export function useSearchSuggestions() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const bookmarks = useBookmarksStore((s) => s.items);
  const history = useHistoryStore((s) => s.items);

  // Update suggestion data when bookmarks/history change
  useEffect(() => {
    updateBookmarkSuggestions(bookmarks);
    updateHistorySuggestions(history);
  }, [bookmarks, history]);

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((q) => {
      if (!q.trim()) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      const results = getSuggestions(q, 'google');
      setSuggestions(results);
      setIsLoading(false);
    }, 300),
    []
  );

  const handleQueryChange = useCallback((newQuery) => {
    setQuery(newQuery);
    setIsLoading(newQuery.length > 0);
    debouncedSearch(newQuery);
  }, [debouncedSearch]);

  const clearSuggestions = useCallback(() => {
    setQuery('');
    setSuggestions([]);
    setIsLoading(false);
  }, []);

  return {
    query,
    setQuery: handleQueryChange,
    suggestions,
    isLoading,
    clearSuggestions,
  };
}
