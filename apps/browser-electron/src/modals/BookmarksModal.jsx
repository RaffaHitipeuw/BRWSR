// Bookmarks Modal - refactored

import { useState } from 'react';
import { useBookmarksStore } from '../stores/bookmarks';
import { getDomain } from '../utils/url';

export function BookmarksModal({ onClose, onNavigate, currentUrl }) {
  const [searchQuery, setSearchQuery] = useState('');

  const items = useBookmarksStore((s) => s.items);
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const isBookmarked = useBookmarksStore((s) => s.isBookmarked);
  const toggleBookmark = useBookmarksStore((s) => s.toggleBookmark);

  const filteredItems = searchQuery
    ? useBookmarksStore.getState().search(searchQuery)
    : items;

  const handleOpen = (url) => {
    onNavigate?.(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <h2 className="text-lg font-semibold">Bookmarks</h2>
            <span className="text-sm text-gray-500">({items.length})</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bookmarks..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Current page bookmark status */}
        {currentUrl && (
          <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Current page: <span className="font-medium truncate max-w-[300px]">{getDomain(currentUrl)}</span>
            </span>
            <button
              onClick={() => toggleBookmark(currentUrl, document.title)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                isBookmarked(currentUrl)
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {isBookmarked(currentUrl) ? '★ Bookmarked' : '☆ Add Bookmark'}
            </button>
          </div>
        )}

        {/* Bookmarks list */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <p>{searchQuery ? 'No bookmarks found' : 'No bookmarks yet'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="text-left text-sm text-gray-500 bg-gray-50 sticky top-0">
                <tr className="border-b">
                  <th className="p-3 font-medium">Page</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleOpen(item.url)}>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {item.favicon ? (
                          <img src={item.favicon} alt="" className="w-4 h-4" />
                        ) : (
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                          </svg>
                        )}
                        <div>
                          <p className="font-medium truncate max-w-[450px]">{item.title}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[450px]">{getDomain(item.url)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); removeBookmark(item.id); }}
                        className="text-gray-400 hover:text-red-500 p-1" title="Remove bookmark">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t text-xs text-gray-400 text-center">
          Click a bookmark to open it
        </div>
      </div>
    </div>
  );
}
