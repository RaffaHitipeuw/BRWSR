import { useState, useEffect } from 'react';
import { useHistoryStore } from '../stores/history';
import { useDownloadsStore } from '../stores/downloads';
import { useSettingsStore } from '../stores/settings';

export function HistoryPanel({ onNavigate }) {
  const items = useHistoryStore((s) => s.items);
  const clear = useHistoryStore((s) => s.clear);

  const formatDate = (ts) => {
    const d = new Date(ts);
    return d.toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">History</h2>
        <button onClick={clear} className="text-sm text-red-500 hover:underline">Clear all</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <p className="text-gray-500">No history yet</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.url)}
                  className="w-full text-left p-2 hover:bg-gray-100 rounded"
                >
                  <div className="text-sm text-blue-600 truncate">{item.url}</div>
                  <div className="text-xs text-gray-500">{formatDate(item.timestamp)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function DownloadsPanel() {
  const items = useDownloadsStore((s) => s.items);
  const remove = useDownloadsStore((s) => s.remove);

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="flex items-center p-4 border-b">
        <h2 className="text-lg font-semibold">Downloads</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <p className="text-gray-500">No downloads</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded">
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{item.fileName}</div>
                  <div className="text-xs text-gray-500">
                    {item.status === 'downloading'
                      ? `${Math.round(item.received / item.totalBytes * 100)}%`
                      : item.status}
                  </div>
                </div>
                <button onClick={() => remove(item.id)} className="text-gray-400 hover:text-red-500">X</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const { zoom, theme, homepage, setZoom, zoomIn, zoomOut, resetZoom } = useSettingsStore();

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      <div className="max-w-xl mx-auto p-6 space-y-6">
        <h2 className="text-xl font-semibold">Settings</h2>

        <section>
          <h3 className="font-medium mb-3">Zoom</h3>
          <div className="flex items-center gap-3">
            <button onClick={zoomOut} className="px-3 py-1 border rounded">-</button>
            <span className="w-16 text-center">{zoom}%</span>
            <button onClick={zoomIn} className="px-3 py-1 border rounded">+</button>
            <button onClick={resetZoom} className="text-sm text-blue-600 hover:underline">Reset</button>
          </div>
        </section>

        <section>
          <h3 className="font-medium mb-2">Appearance</h3>
          <select
            value={theme}
            onChange={(e) => useSettingsStore.getState().setTheme(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </section>

        <section>
          <h3 className="font-medium mb-2">Startup</h3>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useSettingsStore.getState().showHome}
              onChange={() => useSettingsStore.getState().toggleHome()}
            />
            Show home button
          </label>
        </section>
      </div>
    </div>
  );
}
