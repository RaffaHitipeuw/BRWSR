// Downloads Modal - refactored

import { useState } from 'react';
import { useDownloadsStore } from '../stores/downloads';
import { formatBytes } from '../utils/format';

const STATE_CONFIG = {
  completed: { icon: '✓', color: 'text-green-500' },
  downloading: { icon: '↻', color: 'text-blue-500' },
  cancelled: { icon: '✗', color: 'text-gray-400' },
  interrupted: { icon: '!', color: 'text-red-500' },
};

export function DownloadsModal({ onClose }) {
  const [filter, setFilter] = useState('all');

  const items = useDownloadsStore((s) => s.items);
  const removeDownload = useDownloadsStore((s) => s.removeDownload);
  const clearCompleted = useDownloadsStore((s) => s.clearCompleted);

  const filteredItems = items.filter((d) => filter === 'all' || d.status === filter);

  const getProgress = (item) => {
    if (item.totalBytes === 0) return '...';
    return `${Math.round((item.received / item.totalBytes) * 100)}%`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Downloads</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
          <div className="flex gap-2">
            {['all', 'downloading', 'completed'].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  filter === f ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={clearCompleted} className="text-sm text-gray-500 hover:text-red-500">
            Clear completed
          </button>
        </div>

        {/* Downloads list */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <p>No downloads</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="text-left text-sm text-gray-500 bg-gray-50 sticky top-0">
                <tr className="border-b">
                  <th className="p-3 font-medium">File</th>
                  <th className="p-3 w-28 font-medium">Status</th>
                  <th className="p-3 w-24 font-medium">Size</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const config = STATE_CONFIG[item.status] || STATE_CONFIG.cancelled;
                  return (
                    <tr key={item.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <p className="font-medium truncate max-w-[400px]">{item.fileName}</p>
                        <p className="text-xs text-gray-500 truncate">{item.url}</p>
                      </td>
                      <td className={`p-3 ${config.color}`}>
                        <div className="flex items-center gap-2">
                          {item.status === 'downloading' && (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          )}
                          <span className="text-sm capitalize">{item.status}</span>
                          {item.status === 'downloading' && (
                            <span className="text-xs">{getProgress(item)}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {formatBytes(item.totalBytes || item.received)}
                      </td>
                      <td className="p-3">
                        <button onClick={() => removeDownload(item.id)}
                          className="text-gray-400 hover:text-red-500 p-1" title="Remove">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3 border-t text-xs text-gray-400 text-center">
          {items.length} total download{items.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
