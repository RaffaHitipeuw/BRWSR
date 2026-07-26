// Context Menu Component - High Performance

import React, { memo, useEffect, useCallback } from 'react';
import { useTabStore } from '../stores/tabs';

export const ContextMenu = memo(function ContextMenu({
  visible,
  x,
  y,
  linkUrl,
  onClose,
}) {
  const addTab = useTabStore((s) => s.addTab);

  // Close on escape
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  if (!visible) return null;

  // Calculate position
  const menuX = Math.min(x, window.innerWidth - 200);
  const menuY = Math.min(y, window.innerHeight - 320);

  const menuStyle = {
    position: 'fixed',
    left: `${menuX}px`,
    top: `${menuY}px`,
    zIndex: 99999,
  };

  return (
    <>
      {/* Invisible backdrop to catch clicks */}
      <div
        className="fixed inset-0 z-[99998]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Menu */}
      <div
        style={menuStyle}
        className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 py-1 w-52 z-[99999] animate-fade-in"
      >
        {linkUrl && (
          <>
            <button
              onClick={() => { addTab(linkUrl); onClose(); }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3"
            >
              <span className="w-4">↗️</span>
              Open in new tab
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(linkUrl); onClose(); }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3"
            >
              <span className="w-4">📋</span>
              Copy link address
            </button>
            <div className="h-px bg-gray-100 my-1" />
          </>
        )}

        <button
          onClick={() => { addTab('https://www.google.com'); onClose(); }}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3"
        >
          <span className="w-4">🔍</span>
          Google Search
        </button>
        <button
          onClick={() => { addTab('https://www.wikipedia.org'); onClose(); }}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3"
        >
          <span className="w-4">📖</span>
          Wikipedia
        </button>
        <button
          onClick={() => { addTab('https://www.youtube.com'); onClose(); }}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3"
        >
          <span className="w-4">▶️</span>
          YouTube
        </button>
        <button
          onClick={() => { addTab('https://github.com'); onClose(); }}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-3"
        >
          <span className="w-4">💻</span>
          GitHub
        </button>

        <div className="h-px bg-gray-100 my-1" />

        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-100 flex items-center gap-3"
        >
          <span className="w-4">✕</span>
          Close
        </button>
      </div>
    </>
  );
});
