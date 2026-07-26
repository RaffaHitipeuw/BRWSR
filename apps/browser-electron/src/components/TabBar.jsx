import { clsx } from 'clsx';
import { useTabStore } from '../stores/tabs';

export function TabBar({ onTabClick, onNewTab, onCloseTab }) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  return (
    <div className="flex items-center bg-gray-800 border-b border-gray-700 h-10 px-2 gap-1 flex-shrink-0">
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              'group flex items-center gap-2 h-8 px-3 rounded cursor-pointer min-w-[120px] max-w-[200px] transition-colors flex-shrink-0',
              activeTabId === tab.id
                ? 'bg-gray-900 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            )}
            onClick={() => onTabClick(tab.id)}
          >
            <div className="flex-shrink-0 w-4 h-4">
              {tab.favicon ? (
                <img src={tab.favicon} alt="" className="w-4 h-4" />
              ) : (
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 019-9" />
                </svg>
              )}
            </div>
            <span className="flex-1 truncate text-sm">{tab.title}</span>
            {tab.isLoading && (
              <div className="flex-shrink-0 w-3 h-3">
                <div className="w-3 h-3 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-600 rounded transition-colors opacity-0 group-hover:opacity-100"
              title="Close Tab"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          onClick={onNewTab}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="New Tab (Ctrl+T)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="Minimize"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 12 12">
            <rect y="5" width="12" height="2" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="Maximize"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 12 12">
            <rect x="1" y="1" width="10" height="10" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 rounded transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 12 12">
            <path strokeWidth="1.5" d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
