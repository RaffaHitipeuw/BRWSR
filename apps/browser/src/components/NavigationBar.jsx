import { clsx } from "clsx";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTabStore } from "../stores/tabs";
import { useBookmarksStore } from "../stores/bookmarks";

function NavButton({ onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
        disabled
          ? "text-gray-300 cursor-not-allowed"
          : "text-gray-600 hover:bg-gray-100 active:bg-gray-200"
      )}
    >
      {children}
    </button>
  );
}

// Menu dropdown component - rendered at document level
function MenuDropdown({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99998]"
      onClick={onClose}
    >
      <div
        className="absolute left-2 top-12 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-[99999]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function NavigationBar({
  onBack,
  onForward,
  onReload,
  onNavigate,
  onNewTab,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const inputRef = useRef(null);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Sync input with active tab URL
  useEffect(() => {
    if (activeTab?.url && !inputRef.current?.focused) {
      setUrlInput(activeTab.url);
    }
  }, [activeTab?.url]);

  const addBookmark = useBookmarksStore((s) => s.addBookmark);
  const isBookmarked = useBookmarksStore((s) => s.isBookmarked);
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const bookmarks = useBookmarksStore((s) => s.items);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  const handleBookmarkToggle = useCallback(() => {
    if (!activeTab?.url) return;
    if (isBookmarked(activeTab.url)) {
      const bookmark = bookmarks.find((b) => b.url === activeTab.url);
      if (bookmark) removeBookmark(bookmark.id);
    } else {
      addBookmark(activeTab.url, activeTab.title, activeTab.favicon);
    }
  }, [activeTab, bookmarks, isBookmarked, addBookmark, removeBookmark]);

  const currentUrl = activeTab?.url || "";
  const urlIsBookmarked = activeTab?.url ? isBookmarked(activeTab.url) : false;

  const handleMenuClick = (url) => {
    if (url) {
      onNavigate(activeTab?.id, url);
    }
    setShowMenu(false);
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    if (urlInput.trim() && activeTabId) {
      let url = urlInput.trim();
      // Auto-add https:// if no protocol
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }
      onNavigate(activeTabId, url);
    }
  };

  const handleInputFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  return (
    <>
      <div
        className="flex items-center h-12 px-2 bg-gray-50 border-b border-gray-200 gap-1"
        style={{ zIndex: 9999, position: "relative" }}
      >
        <NavButton onClick={onBack} disabled={!activeTab?.canGoBack} title="Back (Alt+←)">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </NavButton>

        <NavButton onClick={onForward} disabled={!activeTab?.canGoForward} title="Forward (Alt+→)">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </NavButton>

        <NavButton onClick={onReload} title="Refresh (Ctrl+R)">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </NavButton>

        {/* Menu Button */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={clsx(
            "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
            showMenu ? "bg-gray-200 text-gray-800" : "text-gray-600 hover:bg-gray-100"
          )}
          title="Menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Address Bar */}
        <div className="flex-1 mx-2">
          <form onSubmit={handleUrlSubmit}>
            <div
              className={clsx(
                "flex items-center h-9 px-3 rounded-full bg-white border transition-all",
                activeTab?.isLoading ? "border-blue-500" : "border-gray-200 hover:border-gray-300 focus-within:border-blue-500"
              )}
            >
              <div className="flex-shrink-0 mr-2">
                {currentUrl.startsWith("https://") ? (
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onFocus={handleInputFocus}
                placeholder="Search or enter URL"
                className="flex-1 text-sm text-gray-800 bg-transparent outline-none"
              />
              {activeTab?.isLoading && (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin ml-2" />
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Menu Dropdown - rendered at document level */}
      <MenuDropdown isOpen={showMenu} onClose={() => setShowMenu(false)}>
        <div className="p-2">
          {/* Bookmark Toggle */}
          <button
            onClick={() => {
              handleBookmarkToggle();
              setShowMenu(false);
            }}
            className={clsx(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
              urlIsBookmarked ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
            )}
          >
            <svg
              className="w-5 h-5"
              fill={urlIsBookmarked ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span className="font-medium">
              {urlIsBookmarked ? "Remove Bookmark" : "Add Bookmark"}
            </span>
          </button>
        </div>

        <div className="border-t border-gray-100" />

        {/* Quick Links */}
        <div className="p-2">
          <p className="px-2 py-1 text-xs text-gray-400 font-medium">Quick Links</p>
          <button
            onClick={() => handleMenuClick("https://www.google.com")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-gray-700">Google</span>
          </button>
          <button
            onClick={() => handleMenuClick("https://youtube.com")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span className="text-gray-700">YouTube</span>
          </button>
          <button
            onClick={() => handleMenuClick("https://github.com")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            <span className="text-gray-700">GitHub</span>
          </button>
        </div>
      </MenuDropdown>
    </>
  );
}
