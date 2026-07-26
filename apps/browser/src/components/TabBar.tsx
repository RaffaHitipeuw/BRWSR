import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import { useTabStore, Tab } from "../stores/tabs";
import { browserCommands } from "./browserCommands";

interface TabBarProps {
  onTabClick: (tabId: string) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
}

const TAB_COLORS = ["#B3492F", "#C8932B", "#3F7D58", "#4A6FA5", "#8B5CF6", "#EC4899"];

export function TabBar({ onTabClick, onNewTab, onCloseTab }: TabBarProps) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const pinTab = useTabStore((s) => s.pinTab);
  const unpinTab = useTabStore((s) => s.unpinTab);
  const duplicateTab = useTabStore((s) => s.duplicateTab);
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
  const closeAllTabs = useTabStore((s) => s.closeAllTabs);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(
    null,
  );
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

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
      useTabStore.getState().reorderTabs(fromIndex, toIndex);
    }
    setDraggedTabId(null);
  };

  const pinnedTabs = tabs.filter((t) => t.isPinned);
  const unpinnedTabs = tabs.filter((t) => !t.isPinned);

  return (
    <div className="flex items-center bg-[#2d2d2d] h-10 select-none">
      {/* Window Controls - bagian kiri, bisa di-drag */}
      <div className="flex items-center h-full px-1" data-tauri-drag-region>
        <button
          onClick={handleMinimize}
          className="w-10 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3d3d3d] transition-colors"
          title="Minimize"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-10 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3d3d3d] transition-colors"
          title="Maximize"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-10 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-[#1a1a1a] mx-1" />

      {/* Pinned Tabs */}
      {pinnedTabs.length > 0 && (
        <div className="flex items-center h-full">
          {pinnedTabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={activeTabId === tab.id}
              onClick={() => onTabClick(tab.id)}
              onClose={() => {
                if (tabs.length === 1) {
                  unpinTab(tab.id);
                } else {
                  onCloseTab(tab.id);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, tab.id)}
              isDragging={draggedTabId === tab.id}
            />
          ))}
          <div className="w-px h-5 bg-[#4d4d4d] mx-1" />
        </div>
      )}

      {/* Tabs - scrollable area */}
      <div className="flex-1 flex items-center h-full overflow-x-auto min-w-0">
        {unpinnedTabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={activeTabId === tab.id}
            onClick={() => onTabClick(tab.id)}
            onClose={() => onCloseTab(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, tab.id)}
            isDragging={draggedTabId === tab.id}
          />
        ))}

        {/* New Tab Button */}
        <button
          onClick={onNewTab}
          className="flex-shrink-0 w-9 h-9 mx-1 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3d3d3d] rounded transition-colors"
          title="New Tab (Ctrl+T)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Tab Counter */}
      <div className="flex-shrink-0 px-3 text-xs text-gray-500">{tabs.length}</div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-[#2d2d2d] border border-[#4d4d4d] rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] hover:text-white transition-colors text-sm"
            onClick={() => {
              onNewTab();
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="flex-1 text-left">New Tab</span>
            <span className="text-gray-500 text-xs">Ctrl+T</span>
          </button>

          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] hover:text-white transition-colors text-sm"
            onClick={() => {
              duplicateTab(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span className="flex-1 text-left">Duplicate Tab</span>
          </button>

          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] hover:text-white transition-colors text-sm"
            onClick={() => {
              const tab = tabs.find((t) => t.id === contextMenu.tabId);
              if (tab?.isPinned) {
                unpinTab(contextMenu.tabId);
              } else {
                pinTab(contextMenu.tabId);
              }
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
            <span className="flex-1 text-left">
              {tabs.find((t) => t.id === contextMenu.tabId)?.isPinned ? "Unpin Tab" : "Pin Tab"}
            </span>
          </button>

          <div className="h-px bg-[#4d4d4d] my-1" />

          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] hover:text-white transition-colors text-sm"
            onClick={() => {
              closeOtherTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
            <span className="flex-1 text-left">Close Other Tabs</span>
          </button>

          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] hover:text-white transition-colors text-sm"
            onClick={() => {
              closeAllTabs();
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span className="flex-1 text-left">Close All Tabs</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDragging: boolean;
}

function TabItem({
  tab,
  isActive,
  onClick,
  onClose,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: TabItemProps) {
  return (
    <div
      className={clsx(
        "group flex items-center h-full px-3 cursor-pointer min-w-[100px] max-w-[180px] border-r border-[#1a1a1a] transition-colors",
        isActive ? "bg-[#1a1a1a] text-white" : "bg-[#2d2d2d] text-gray-300 hover:bg-[#383838]",
        isDragging && "opacity-50",
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Pin indicator */}
      {tab.isPinned && (
        <svg
          className="w-3 h-3 text-gold flex-shrink-0 mr-1"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
        </svg>
      )}

      {/* Favicon */}
      <div className="flex-shrink-0 w-4 h-4 mr-2">
        {tab.favicon ? (
          <img src={tab.favicon} alt="" className="w-4 h-4" />
        ) : (
          <div className="w-4 h-4 bg-gray-600 rounded" />
        )}
      </div>

      {/* Title */}
      <span className="flex-1 truncate text-sm">{tab.title || "New Tab"}</span>

      {/* Loading */}
      {tab.isLoading && (
        <div className="w-3 h-3 mr-1">
          <div className="w-3 h-3 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Close Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-600 rounded transition-colors opacity-0 group-hover:opacity-100"
        title="Close Tab"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
