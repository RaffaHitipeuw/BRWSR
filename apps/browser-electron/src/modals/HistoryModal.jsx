// History Modal - refactored

import { useState, useMemo } from 'react';
import { useHistoryStore } from '../stores/history';
import { formatHistoryTime } from '../utils/format';

export function HistoryModal({ onClose, onNavigate }) {
  const [searchQuery, setSearchQuery] = useState('');

  const items = useHistoryStore((s) => s.items);
  const removeItem = useHistoryStore((s) => s.removeItem);
  const clear = useHistoryStore((s) => s.clear);
  const isEnabled = useHistoryStore((s) => s.isEnabled);
  const toggleEnabled = useHistoryStore((s) => s.toggleEnabled);
  const exportAsCSV = useHistoryStore((s) => s.exportAsCSV);
  const exportAsJSON = useHistoryStore((s) => s.exportAsJSON);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.url.toLowerCase().includes(query) ||
        item.title?.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  const groupedItems = useMemo(() => {
    return filteredItems.reduce((acc, item) => {
      const date = new Date(item.timestamp).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(item);
      return acc;
    }, {});
  }, [filteredItems]);

  const handleNavigate = (url) => {
    onNavigate?.(url);
    onClose?.();
  };

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[650px] max-h-[550px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">History</h2>
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={toggleEnabled}
                className="w-4 h-4"
              />
              Track history
            </label>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search and Actions */}
        <div className="flex items-center gap-2 p-4 border-b">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button onClick={() => downloadFile(exportAsCSV(), 'history.csv', 'text/csv')}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">CSV</button>
          <button onClick={() => downloadFile(exportAsJSON(), 'history.json', 'application/json')}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">JSON</button>
          <button onClick={clear}
            className="px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg">Clear</button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4">
          {!isEnabled ? (
            <div className="text-center py-8 text-gray-500">
              <p>History tracking is disabled</p>
            </div>
          ) : Object.keys(groupedItems).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchQuery ? 'No history found' : 'No history yet'}
            </div>
          ) : (
            Object.entries(groupedItems).map(([date, dateItems]) => (
              <div key={date} className="mb-4">
                <h3 className="text-sm font-semibold text-gray-500 mb-2">{date}</h3>
                <div className="space-y-1">
                  {dateItems.map((item) => (
                    <div key={item.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-lg group">
                      <img src={item.favicon || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}
                        className="w-5 h-5 flex-shrink-0" alt="" />
                      <button onClick={() => handleNavigate(item.url)}
                        className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-medium truncate">{item.title || item.url}</p>
                        <p className="text-xs text-gray-500 truncate">{item.url}</p>
                      </button>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatHistoryTime(item.timestamp)}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 transition-opacity">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t text-xs text-gray-400 text-center">
          {items.length} items
        </div>
      </div>
    </div>
  );
}
