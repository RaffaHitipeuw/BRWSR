
import { useState, useEffect, useCallback } from "react";
import { debounce } from "../utils/performance";
import {
  getSuggestions,
  updateBookmarkSuggestions,
  updateHistorySuggestions,
} from "../services/searchSuggestion";
import { useBookmarksStore } from "../stores/bookmarks";
import { useHistoryStore } from "../stores/history";

interface Suggestion {
  type: string;
  title: string;
  url: string;
  icon: string;
  score?: number;
}

export function useSearchSuggestions() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const bookmarks = useBookmarksStore((s) => s.items);
  const history = useHistoryStore((s) => s.items);

  useEffect(() => {
    updateBookmarkSuggestions(bookmarks);
    updateHistorySuggestions(history);
  }, [bookmarks, history]);

  const debouncedSearchRef = useCallback(
    debounce((q: string) => {
      if (!q.trim()) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      const results = getSuggestions(q, "google");
      setSuggestions(results);
      setIsLoading(false);
    }, 300),
    [],
  );

  useEffect(() => {
    return () => {
      debouncedSearchRef.cancel();
    };
  }, [debouncedSearchRef]);

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);
      setIsLoading(newQuery.length > 0);
      debouncedSearchRef(newQuery);
    },
    [debouncedSearchRef],
  );

  const clearSuggestions = useCallback(() => {
    setQuery("");
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
