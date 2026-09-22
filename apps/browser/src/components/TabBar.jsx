import { useState, useEffect, useCallback, useRef } from "react";
import { clsx } from "clsx";
import { useTabStore } from "../stores/tabs";
import { browserCommands } from "./browserCommands";

const handleTabStripClick = () => {
  browserCommands.raiseBrowserZorder();
};

export function TabBar({ onTabClick, onNewTab, onCloseTab }) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const pinTab = useTabStore((s) => s.pinTab);
  const unpinTab = useTabStore((s) => s.unpinTab);
  const duplicateTab = useTabStore((s) => s.duplicateTab);
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
  const closeAllTabs = useTabStore((s) => s.closeAllTabs);
  const reorderTabs = useTabStore((s) => s.reorderTabs);

  const [contextMenu, setContextMenu] = useState(
    null,
  );
  const [draggedTabId, setDraggedTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  // Use ref for drag tracking - updates synchronously, unlike state which is batched
  const draggingTabIdRef = useRef(null);

  const handleMinimize = () => browserCommands.minimize();
  const handleMaximize = () => browserCommands.toggleMaximize();
  const handleClose = () => browserCommands.close();

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);

    // Document-level drag diagnostics to catch ALL drag events
    const onDocDragEnter = (e) => {
      console.log(`[TAB-DRAG-DOC] document dragenter target=${e.target?.className || e.target?.tagName} relatedTarget=${e.relatedTarget?.className || e.relatedTarget?.tagName}`);
    };
    const onDocDragOver = (e) => {
      console.log(`[TAB-DRAG-DOC] document dragover target=${e.target?.className || e.target?.tagName}`);
    };
    const onDocDrop = (e) => {
      console.log(`[TAB-DRAG-DOC] document drop target=${e.target?.className || e.target?.tagName}`);
    };
    const onDocDragLeave = (e) => {
      console.log(`[TAB-DRAG-DOC] document dragleave target=${e.target?.className || e.target?.tagName} relatedTarget=${e.relatedTarget?.className || e.relatedTarget?.tagName}`);
    };

    document.addEventListener("dragenter", onDocDragEnter);
    document.addEventListener("dragover", onDocDragOver);
    document.addEventListener("drop", onDocDrop);
    document.addEventListener("dragleave", onDocDragLeave);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("dragenter", onDocDragEnter);
      document.removeEventListener("dragover", onDocDragOver);
      document.removeEventListener("drop", onDocDrop);
      document.removeEventListener("dragleave", onDocDragLeave);
    };
  }, []);

  const handleContextMenu = (e, tabId) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const handleDragStart = (e, tabId) => {
    // Don't call stopPropagation here - drag events need to bubble for the browser
    // to properly recognize drop targets and show the correct cursor
    console.log(`[TAB-DRAG] dragstart tabId=${tabId} target=${e.target?.className} currentTarget=${e.currentTarget?.className} effectAllowed=${e.dataTransfer.effectAllowed} dropEffect=${e.dataTransfer.dropEffect}`);
    setDraggedTabId(tabId);
    draggingTabIdRef.current = tabId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tabId);
    console.log(`[TAB-DRAG] dragstart AFTER SET tabId=${tabId} ref=${draggingTabIdRef.current}`);
  };

  const handleDragEnter = (e, tabId) => {
    console.log(`[TAB-DRAG] dragenter tabId=${tabId} target=${e.target?.className} currentTarget=${e.currentTarget?.className} ref=${draggingTabIdRef.current}`);
  };

  const handleDragEnd = () => {
    console.log(`[TAB-DRAG] dragend ref=${draggingTabIdRef.current}`);
    setDraggedTabId(null);
    setDragOverTabId(null);
    draggingTabIdRef.current = null;
  };

  const handleDragOver = (e, tabId) => {
    console.log(`[TAB-DRAG] dragover tabId=${tabId} target=${e.target?.className} currentTarget=${e.currentTarget?.className} ref=${draggingTabIdRef.current} effectAllowed=${e.dataTransfer.effectAllowed} dropEffect=${e.dataTransfer.dropEffect}`);
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (tabId !== draggingTabIdRef.current) {
      setDragOverTabId(tabId);
    }
  };

  const handleDragLeave = (e, tabId) => {
    console.log(`[TAB-DRAG] dragleave tabId=${tabId} target=${e.target?.className} currentTarget=${e.currentTarget?.className}`);
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverTabId(null);
    }
  };

  const handleDrop = (e, targetTabId) => {
    console.log(`[TAB-DRAG] drop targetTabId=${targetTabId} ref=${draggingTabIdRef.current} effectAllowed=${e.dataTransfer.effectAllowed} dropEffect=${e.dataTransfer.dropEffect}`);
    e.preventDefault();
    e.stopPropagation();
    const currentDraggedId = draggingTabIdRef.current;
    console.log(`[TAB-DRAG] drop AFTER READ ref=${currentDraggedId}`);
    if (!currentDraggedId || currentDraggedId === targetTabId) {
      console.log(`[TAB-DRAG] drop CANCELLED currentDraggedId=${currentDraggedId} targetTabId=${targetTabId}`);
      setDraggedTabId(null);
      setDragOverTabId(null);
      draggingTabIdRef.current = null;
      return;
    }

    const fromIndex = tabs.findIndex((t) => t.id === currentDraggedId);
    const toIndex = tabs.findIndex((t) => t.id === targetTabId);
    console.log(`[TAB-DRAG] drop REORDER fromIndex=${fromIndex} toIndex=${toIndex}`);

    if (fromIndex !== -1 && toIndex !== -1) {
      reorderTabs(fromIndex, toIndex);
    }
    setDraggedTabId(null);
    setDragOverTabId(null);
    draggingTabIdRef.current = null;
  };

  const pinnedTabs = tabs.filter((t) => t.isPinned);
  const unpinnedTabs = tabs.filter((t) => !t.isPinned);

  return (
    <div
      className="flex items-center bg-[#2d2d2d] h-10 select-none"
      onMouseDown={handleTabStripClick}
    >
      {/* Window Controls */}
      <div className="h-full flex items-center flex-shrink-0">
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5m5 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 transition-colors"
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

      {/* Tab Area - separate from window drag region */}
      <div
        className="flex items-center h-full overflow-x-auto min-w-0 scrollbar-none flex-shrink-0"
      >
        {pinnedTabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              "flex-shrink-0 flex items-center h-full px-2 min-w-[80px] max-w-[140px] border-r border-[#1a1a1a] cursor-pointer transition-colors",
              activeTabId === tab.id
                ? "bg-[#1a1a1a] text-white"
                : "text-gray-300 hover:bg-[#383838]",
              draggedTabId === tab.id && "opacity-50",
              dragOverTabId === tab.id && "border-l-2 border-blue-400",
            )}
            onClick={() => onTabClick(tab.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragEnter={(e) => handleDragEnter(e, tab.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDragLeave={(e) => handleDragLeave(e, tab.id)}
            onDrop={(e) => handleDrop(e, tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
          >
            {tab.isPinned && (
              <svg
                className="w-3 h-3 mr-1 text-gold flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
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
              onClick={(e) => {
                e.stopPropagation();
                tabs.length === 1 ? unpinTab(tab.id) : onCloseTab(tab.id);
              }}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100"
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
        ))}

        {unpinnedTabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              "group flex-shrink-0 flex items-center h-full px-2 min-w-[80px] max-w-[140px] border-r border-[#1a1a1a] cursor-pointer transition-colors",
              activeTabId === tab.id
                ? "bg-[#1a1a1a] text-white"
                : "text-gray-300 hover:bg-[#383838]",
              draggedTabId === tab.id && "opacity-50",
              dragOverTabId === tab.id && "border-l-2 border-blue-400",
            )}
            onClick={() => onTabClick(tab.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragEnter={(e) => handleDragEnter(e, tab.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDragLeave={(e) => handleDragLeave(e, tab.id)}
            onDrop={(e) => handleDrop(e, tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
          >
            {tab.favicon ? (
              <img src={tab.favicon} alt="" className="w-4 h-4 mr-2 flex-shrink-0" />
            ) : (
              <div className="w-4 h-4 mr-2 bg-gray-600 rounded flex-shrink-0" />
            )}
            <span className="flex-1 truncate text-xs">{tab.title || "New Tab"}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-600 rounded opacity-0 group-hover:opacity-100"
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
        ))}

        <button
          onClick={onNewTab}
          className="flex-shrink-0 w-10 h-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#3d3d3d] transition-colors"
          title="New Tab (Ctrl+T)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Window Drag Spacer - ONLY this element has data-tauri-drag-region */}
      {/* Tab area above is completely separate - no ancestor with drag-region */}
      <div className="flex-1 flex items-center" data-tauri-drag-region>
        <span className="px-3 text-xs text-gray-500">{tabs.length}</span>
      </div>

      {contextMenu && (
        <div
          className="fixed bg-[#2d2d2d] border border-[#4d4d4d] rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
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
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
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
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
            onClick={() => {
              const tab = tabs.find((t) => t.id === contextMenu.tabId);
              if (tab?.isPinned) unpinTab(contextMenu.tabId);
              else pinTab(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v14l-7-3.5L5 21V5z"
              />
            </svg>
            <span className="flex-1 text-left">
              {tabs.find((t) => t.id === contextMenu.tabId)?.isPinned ? "Unpin Tab" : "Pin Tab"}
            </span>
          </button>
          <div className="h-px bg-[#4d4d4d] my-1" />
          <button
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
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
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-300 hover:bg-[#3d3d3d] text-sm"
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
