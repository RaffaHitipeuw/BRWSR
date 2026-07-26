// FindInPage Component - Search within current page

import { useState, useEffect, useRef } from 'react';

export function FindInPage({ activeWebview, onClose }) {
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState({ current: 0, total: 0 });
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (!query || !activeWebview) {
      setMatchCount({ current: 0, total: 0 });
      return;
    }

    // Find text in webview
    activeWebview.findInPage(query);
  }, [query, activeWebview]);

  useEffect(() => {
    if (!activeWebview) return;

    const handleFindResult = (e) => {
      setMatchCount({
        current: e.finalUpdate ? 0 : e.matchContextIndex + 1,
        total: e.numberOfMatches,
      });
    };

    activeWebview.addEventListener('found-in-page', handleFindResult);

    return () => {
      activeWebview.removeEventListener('found-in-page', handleFindResult);
      activeWebview.stopFinding();
    };
  }, [activeWebview]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Find previous
        activeWebview?.findInPage(query, { forward: false });
      } else {
        // Find next
        activeWebview?.findInPage(query, { forward: true });
      }
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleNext = () => {
    activeWebview?.findInPage(query, { forward: true });
  };

  const handlePrev = () => {
    activeWebview?.findInPage(query, { forward: false });
  };

  return (
    <div className="absolute top-full left-0 right-0 bg-white border-b shadow-md z-50">
      <div className="flex items-center gap-2 p-2">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find in page..."
          className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <span className="text-xs text-gray-500 min-w-[60px] text-center">
          {matchCount.total > 0
            ? `${matchCount.current} / ${matchCount.total}`
            : 'No results'}
        </span>

        <button
          onClick={handlePrev}
          disabled={!query}
          className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
          title="Previous match"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>

        <button
          onClick={handleNext}
          disabled={!query}
          className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
          title="Next match"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
          title="Close (Esc)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
