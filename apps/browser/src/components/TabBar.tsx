import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { useTabStore } from "../stores/tabs";
import { browserCommands } from "./browserCommands";

interface TabBarProps {
  onTabClick: (tabId: string) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
}

export function TabBar({ onTabClick, onNewTab, onCloseTab }: TabBarProps) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const pinTab = useTabStore((s) => s.pinTab);
  const unpinTab = useTabStore((s) => s.unpinTab);
  const duplicateTab = useTabStore((s) => s.duplicateTab);
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
  const closeAllTabs = useTabStore((s) => s.closeAllTabs);
  const reorderTabs = useTabStore((s) => s.reorderTabs);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Window controls
  const handleMinimize = () => browserCommands.minimize();
  const handleMaximize = () => browserCommands.toggleMaximize();
  const handleClose = () => browserCommands.close();

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    e.stopPropagation();
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (!draggedTabId || draggedTabId === targetTabId) return;

    const fromIndex = tabs.findIndex((t) => t.id === draggedTabId);
    const toIndex = tabs.findIndex((t) => t.id === targetTabId);

    if (fromIndex !== -1 && toIndex !== -1) {
      reorderTabs(fromIndex, toIndex);
    }
    setDraggedTabId(null);
  };

  const pinnedTabs = tabs.filter((t) => t.isPinned);
  const unpinnedTabs = tabs.filter((t) => !t.isPinned);

  return (
    <div className="flex items-center bg-[#2d2d2d] h-10 select-none" data-tauri-drag-region>
      {/* Window Controls - Left */}
      <div className="h-full flex items-center">
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3d3d3d] transition-colors"
          title="Minimize"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3d3d3d] transition-colors"
          title="Maximize"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5m5 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Draggable Area - tab scroll */}
      <div className="flex-1 flex items-center h-full overflow-x-auto min-w-0 scrollbar-none" data-tauri-drag-region>
        {/* Pinned tabs first */}
        {pinnedTabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              "flex-shrink-0 flex items-center h-full px-2 min-w-[80px] max-w-[140px] border-r border-[#1a1a1a] cursor-pointer transition-colors",
              activeTabId === tab.id ? "bg-[#1a1a1a] text-white" : "text-gray-300 hover:bg-[#383838]"
            )}
            onClick={() => onTabClick(tab.id)}
            draggable
            onDragStart={(e) => handleDragStart(e as any, tab.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e as any, tab.id)}
            onContextMenu={(e) => handleContextMenu(e as any, tab.id)}
          >
            {tab.isPinned && (
              <svg className="w-3 h-3 mr-1 text-gold flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
              </svg>
            )}
            {tab.favicon ? (
              <img src={tab.favicon} alt="" className="w-4 h-4 mr-2 flex-shrink-0" />
            ) : (
              <div className="w-4 h-4 mr-2 bg-gray-600 rounded flex-shrink-0" />
            )}
            <span className="flex-1 truncate text-xs">{tab.title || "New Tab"}</span>
            <button
              onClick={(e) => { e.stopPropagation(); tabs.length === 1 ? unpinTab(tab.id) : onCloseTab(tab.id); }}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {/* Unpinned tabs */}
        {unpinnedTabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              "group flex-shrink-0 flex items-center h-full px-2 min-w-[80px] max-w-[140px] border-r border-[#1a1a1a] cursor-pointer transition-colors",
              activeTabId === tab.id ? "bg-[#1a1a1a] text-white" : "text-gray-300 hover:bg-[#383838]"
            )}
            onClick={() => onTabClick(tab.id)}
            draggable
            onDragStart={(e) => handleDragStart(e as any, tab.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e as any, tab.id)}
            onContextMenu={(e) => handleContextMenu(e as any, tab.id)}
          >
            {tab.favicon ? (
              <img src={tab.favicon} alt="" className="w-4 h-4 mr-2 flex-shrink-0" />
            ) : (
              <div className="w-4 h-4 mr-2 bg-gray-600 rounded flex-shrink-0" />
            )}
            <span className="flex-1 truncate text-xs">{tab.title || "New Tab"}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {/* New Tab Button - always visible at the end */}
        <button
          onClick={onNewTab}
          className="flex-shrink-0 w-10 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3d3d3d] transition-colors ml-1"
          title="New Tab (Ctrl+T)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Tab Counter */}
      <div className="flex-shrink-0 px-3 text-xs text-gray-500">{tabs.length}</div>

      {/* Hamburger Menu */}
      <div className="relative h-full">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="h-full px-3 flex items-center text-gray-400 hover:text-white hover:bg-[#3d3d3d] transition-colors"
          title="Menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-56 bg-[#2d2d2d] border border-[#4d4d4d] rounded-lg shadow-xl py-1 z-50">
              <button
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0" />
                </svg>
                <span>History</span>
              </button>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Downloads</span>
              </button>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v14l-7-3.5L5 21V5z" />
                </svg>
                <span>Bookmarks</span>
              </button>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v-7m-4 4l4-4 4 4" />
                </svg>
                <span>Password Manager</span>
              </button>
              <div className="h-px bg-[#4d4d4d] my-1" />
              <button
                onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0" />
                </svg>
                <span>Settings</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-[#2d2d2d] border border-[#4d4d4d] rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
            onClick={() => { onNewTab(); setContextMenu(null); }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="flex-1 text-left">New Tab</span>
            <span className="text-gray-500 text-xs">Ctrl+T</span>
          </button>
          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
            onClick={() => { duplicateTab(contextMenu.tabId); setContextMenu(null); }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="flex-1 text-left">Duplicate Tab</span>
          </button>
          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
            onClick={() => {
              const tab = tabs.find(t => t.id === contextMenu.tabId);
              if (tab?.isPinned) unpinTab(contextMenu.tabId);
              else pinTab(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v14l-7-3.5L5 21V5z" />
            </svg>
            <span className="flex-1 text-left">
              {tabs.find(t => t.id === contextMenu.tabId)?.isPinned ? "Unpin Tab" : "Pin Tab"}
            </span>
          </button>
          <div className="h-px bg-[#4d4d4d] my-1" />
          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
            onClick={() => { closeOtherTabs(contextMenu.tabId); setContextMenu(null); }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span className="flex-1 text-left">Close Other Tabs</span>
          </button>
          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
            onClick={() => { closeAllTabs(); setContextMenu(null); }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="flex-1 text-left">Close All Tabs</span>
          </button>
        </div>
      )}
    </div>
  );
}
