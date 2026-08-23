import { clsx } from "clsx";
import { useState, useRef, useEffect } from "react";
import { useTabStore } from "../stores/tabs";
import { useBookmarksStore } from "../stores/bookmarks";
import { useHistoryStore } from "../stores/history";

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
          : "text-gray-600 hover:bg-gray-100 active:bg-gray-200",
      )}
    >
      {children}
    </button>
  );
}

function BookmarkIcon({ filled }) {
  return filled ? (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
    </svg>
  ) : (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function HamburgerMenu({ onNavigate, tabId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("bookmarks");
  const menuRef = useRef(null);

  const bookmarks = useBookmarksStore((s) => s.items);
  const addBookmark = useBookmarksStore((s) => s.addBookmark);
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const isBookmarked = useBookmarksStore((s) => s.isBookmarked);

  const history = useHistoryStore((s) => s.items);
  const clearHistory = useHistoryStore((s) => s.clear);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleBookmarkToggle = (url, title, favicon) => {
    if (isBookmarked(url)) {
      const bookmark = bookmarks.find((b) => b.url === url);
      if (bookmark) removeBookmark(bookmark.id);
    } else {
      addBookmark(url, title, favicon);
    }
  };

  const getDomain = (url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const groupedHistory = history.reduce((acc, item) => {
    const date = new Date(item.timestamp).toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
          isOpen
            ? "bg-gray-200 text-gray-800"
            : "text-gray-600 hover:bg-gray-100 active:bg-gray-200",
        )}
        title="Menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-[9999] overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab("bookmarks")}
              className={clsx(
                "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === "bookmarks"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
              )}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                Bookmarks
              </span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={clsx(
                "flex-1 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === "history"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
              )}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History
              </span>
            </button>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {activeTab === "bookmarks" && (
              <div>
                {bookmarks.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    <p className="text-sm">No bookmarks yet</p>
                    <p className="text-xs mt-1">Star a page to save it here</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {bookmarks.map((bookmark) => (
                      <div
                        key={bookmark.id}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group"
                      >
                        <div className="w-6 h-6 bg-gray-200 rounded flex-shrink-0 overflow-hidden">
                          {bookmark.favicon ? (
                            <img src={bookmark.favicon} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                              {bookmark.title.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{bookmark.title}</p>
                          <p className="text-xs text-gray-400 truncate">{getDomain(bookmark.url)}</p>
                        </div>
                        <button
                          onClick={() => onNavigate(tabId, bookmark.url)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
                          title="Open"
                        >
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleBookmarkToggle(bookmark.url)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
                          title="Remove bookmark"
                        >
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "history" && (
              <div>
                {history.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm">No browsing history</p>
                    <p className="text-xs mt-1">Pages you visit will appear here</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {Object.entries(groupedHistory).map(([date, items]) => (
                      <div key={date}>
                        <div className="px-3 py-1 text-xs font-medium text-gray-400 bg-gray-50 sticky top-0">
                          {date}
                        </div>
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 group"
                          >
                            <div className="w-6 h-6 bg-gray-200 rounded flex-shrink-0 overflow-hidden">
                              {item.favicon ? (
                                <img src={item.favicon} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                                  {item.title.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 truncate">{item.title}</p>
                              <p className="text-xs text-gray-400 truncate">{getDomain(item.url)}</p>
                            </div>
                            <button
                              onClick={() => onNavigate(tabId, item.url)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 rounded transition-opacity"
                              title="Open"
                            >
                              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="border-t border-gray-200 mt-2">
                      <button
                        onClick={() => {
                          if (confirm("Clear all browsing history?")) {
                            clearHistory();
                          }
                        }}
                        className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Clear All History
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const addBookmark = useBookmarksStore((s) => s.addBookmark);
  const isBookmarked = useBookmarksStore((s) => s.isBookmarked);
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const bookmarks = useBookmarksStore((s) => s.items);

  const handleBookmarkToggle = () => {
    if (!activeTab?.url) return;

    if (isBookmarked(activeTab.url)) {
      const bookmark = bookmarks.find((b) => b.url === activeTab.url);
      if (bookmark) removeBookmark(bookmark.id);
    } else {
      addBookmark(activeTab.url, activeTab.title, activeTab.favicon);
    }
  };

  return (
    <div className="flex items-center h-12 px-2 bg-gray-50 border-b border-gray-200 gap-1 relative z-[9999]">
      <NavButton onClick={onBack} disabled={!activeTab?.canGoBack} title="Back (Alt+←)">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
      </NavButton>

      <NavButton onClick={onForward} disabled={!activeTab?.canGoForward} title="Forward (Alt+→)">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 5l7 7m0 0l-7 7m7-7H3"
          />
        </svg>
      </NavButton>

      <NavButton onClick={onReload} title="Refresh (Ctrl+R)">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </NavButton>

      {activeTab && (
        <AddressBar
          tabId={activeTab.id}
          currentUrl={activeTab.url}
          isLoading={activeTab.isLoading}
          onNavigate={onNavigate}
          onNewTab={onNewTab}
          onBookmarkToggle={handleBookmarkToggle}
          isBookmarked={activeTab.url ? isBookmarked(activeTab.url) : false}
          onMenuClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}

function AddressBar({ tabId, currentUrl, isLoading, onNavigate, onNewTab, onBookmarkToggle, isBookmarked }) {
  const [inputValue, setInputValue] = useState(currentUrl || "");
  const [isFocused, setIsFocused] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(currentUrl || "");
    }
  }, [currentUrl, isFocused]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = () => {
    let url = inputValue.trim();

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      if (url.includes(".") && !url.includes(" ")) {
        url = "https://" + url;
      } else {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      }
    }

    onNavigate(tabId, url);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "l") {
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "t") {
      e.preventDefault();
      onNewTab();
    }
  };

  const isSecure = currentUrl?.startsWith("https://");

  return (
    <div className="flex-1 mx-2 flex items-center gap-2">
      {/* Menu Button - Hamburger */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className={clsx(
            "w-9 h-9 flex items-center justify-center rounded-lg transition-colors relative z-[10000]",
            showMenu
              ? "bg-gray-200 text-gray-800"
              : "text-gray-600 hover:bg-gray-100 active:bg-gray-200",
          )}
          title="Menu (Bookmarks & History)"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {showMenu && (
          <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-[99999] overflow-hidden">
            {/* Tab Headers */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => {}}
                className="flex-1 px-4 py-3 text-sm font-medium text-blue-600 border-b-2 border-blue-600 bg-blue-50"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  Bookmarks
                </span>
              </button>
            </div>

            {/* Quick Access */}
            <div className="p-3 border-b border-gray-100">
              <p className="text-xs text-gray-400 mb-2">Quick Access</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onNavigate(tabId, "https://www.google.com");
                    setShowMenu(false);
                  }}
                  className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span className="text-sm">Home</span>
                </button>
                <button
                  onClick={onBookmarkToggle}
                  className={clsx(
                    "flex-1 flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
                    isBookmarked
                      ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100",
                  )}
                >
                  <BookmarkIcon filled={isBookmarked} />
                  <span className="text-sm">{isBookmarked ? "Unstar" : "Star"}</span>
                </button>
              </div>
            </div>

            {/* Bookmark This Page */}
            {currentUrl && (
              <div className="p-3 border-b border-gray-100">
                <button
                  onClick={() => {
                    onBookmarkToggle();
                    setShowMenu(false);
                  }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                    isBookmarked
                      ? "bg-red-50 text-red-600 hover:bg-red-100"
                      : "bg-blue-50 text-blue-600 hover:bg-blue-100",
                  )}
                >
                  <BookmarkIcon filled={isBookmarked} />
                  <span className="text-sm">
                    {isBookmarked ? "Remove from Bookmarks" : "Bookmark This Page"}
                  </span>
                </button>
              </div>
            )}

            {/* Links */}
            <div className="p-2">
              <a
                href="https://www.google.com"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(tabId, "https://www.google.com");
                  setShowMenu(false);
                }}
                className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-sm">Google</span>
              </a>
              <a
                href="https://youtube.com"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(tabId, "https://youtube.com");
                  setShowMenu(false);
                }}
                className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                <span className="text-sm">YouTube</span>
              </a>
              <a
                href="https://github.com"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(tabId, "https://github.com");
                  setShowMenu(false);
                }}
                className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">GitHub</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Address Bar */}
      <div className="flex-1">
        <div
          className={clsx(
            "flex items-center h-9 px-3 rounded-full bg-white border transition-all",
            isFocused
              ? "border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.2)]"
              : "border-gray-200 hover:border-gray-300",
          )}
        >
          <div className="flex-shrink-0 mr-2">
            {isSecure ? (
              <svg
                className="w-4 h-4 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search with Google or enter URL"
            className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400"
          />

          {isLoading && (
            <div className="flex-shrink-0 ml-2">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
