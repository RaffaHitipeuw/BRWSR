// NavigationBar - Optimized with memoization

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { clsx } from 'clsx';
import { HistoryModal, DownloadsModal, SettingsModal, BookmarksModal, PasswordsModal } from '../modals';
import { useBookmarksStore } from '../stores/bookmarks';
import { useHistoryStore } from '../stores/history';
import { useSettingsStore } from '../stores/settings';
import { parseUrl, isSecureUrl } from '../utils/url';
import { debounce } from '../utils/performance';
import { getSuggestions, updateBookmarkSuggestions, updateHistorySuggestions } from '../services/searchSuggestion';
import { FindInPage } from './FindInPage';

const DEFAULT_HOME = 'https://www.google.com';

// ─── Memoized Sub-components ──────────────────────────────────────────────────

const NavButton = memo(function NavButton({ onClick, disabled, title, children, className }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx('w-8 h-8 flex items-center justify-center rounded transition-colors', className)}
    >
      {children}
    </button>
  );
});

const SVGIcon = {
  back: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  ),
  forward: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  reload: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  bookmark: (filled) => (
    <svg className="w-4 h-4" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  find: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  bookmarks: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  ),
  lock: (
    <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  unlock: (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
};

// ─── Main Component ───────────────────────────────────────────────────────────

function NavigationBarInner({
  onBack,
  onForward,
  onReload,
  onNavigate,
  onNewTab,
  activeTab,
  webviewContainerRef,
  activeTabId,
}) {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFindMode, setIsFindMode] = useState(false);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const suggestionsRef = useRef(null);

  const isBookmarked = useBookmarksStore((s) => s.isBookmarked);
  const toggleBookmark = useBookmarksStore((s) => s.toggleBookmark);
  const bookmarks = useBookmarksStore((s) => s.items);
  const history = useHistoryStore((s) => s.items);

  // Update suggestions data when bookmarks/history change
  useEffect(() => {
    updateBookmarkSuggestions(bookmarks);
    updateHistorySuggestions(history);
  }, [bookmarks, history]);

  // Update URL when tab changes
  useEffect(() => {
    if (activeTab && !isFocused) {
      setInputValue(activeTab.url || '');
    }
  }, [activeTab?.url, isFocused, activeTab]);

  // Close menus on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Get active webview
  const getActiveWebview = useCallback(() => {
    if (!webviewContainerRef?.current || !activeTabId) return null;
    const container = webviewContainerRef.current;
    const activeDiv = container.querySelector(`[data-tab-id="${activeTabId}"]`);
    return activeDiv?.querySelector('webview') || null;
  }, [webviewContainerRef, activeTabId]);

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce((value) => {
      if (value.length > 0) {
        const sug = getSuggestions(value, 'google');
        setSuggestions(sug);
        setShowSuggestions(sug.length > 0);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300),
    []
  );

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setInputValue(value);
    debouncedSearch(value);
  }, [debouncedSearch]);

  const handleSuggestionClick = useCallback((suggestion) => {
    setInputValue(suggestion.url);
    setShowSuggestions(false);
    setSuggestions([]);
    inputRef.current?.blur();
    onNavigate(activeTab?.id, suggestion.url);
  }, [activeTab?.id, onNavigate]);

  const handleSubmit = useCallback(() => {
    if (!activeTab) return;
    let url = inputValue.trim() || DEFAULT_HOME;
    const parsed = parseUrl(url);
    url = parsed.url;
    setShowSuggestions(false);
    setSuggestions([]);
    inputRef.current?.blur();
    onNavigate(activeTab.id, url);
  }, [activeTab, inputValue, onNavigate]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      if (showSuggestions && suggestions.length > 0) {
        handleSuggestionClick(suggestions[0]);
      } else {
        handleSubmit();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setIsFindMode(true);
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }, [showSuggestions, suggestions, handleSuggestionClick, handleSubmit]);

  const handleToggleBookmark = useCallback(() => {
    if (activeTab?.url) {
      toggleBookmark(activeTab.url, activeTab.title, activeTab.favicon);
    }
  }, [activeTab, toggleBookmark]);

  const openModal = useCallback((type) => {
    setShowMenu(false);
    setModalType(type);
  }, []);

  const currentUrl = activeTab?.url;
  const hasBookmark = currentUrl && isBookmarked(currentUrl);

  return (
    <>
      <div className="relative">
        {/* Navigation Bar */}
        <div className="flex items-center h-10 px-1 bg-gray-100 border-b border-gray-200 gap-0.5 flex-shrink-0">
          <NavButton onClick={onBack} disabled={!activeTab?.canGoBack} title="Back (Alt+←)"
            className={activeTab?.canGoBack ? 'text-gray-700 hover:bg-gray-200' : 'text-gray-400 cursor-not-allowed'}>
            {SVGIcon.back}
          </NavButton>

          <NavButton onClick={onForward} disabled={!activeTab?.canGoForward} title="Forward (Alt+→)"
            className={activeTab?.canGoForward ? 'text-gray-700 hover:bg-gray-200' : 'text-gray-400 cursor-not-allowed'}>
            {SVGIcon.forward}
          </NavButton>

          <NavButton onClick={onReload} title="Reload (Ctrl+R)"
            className="text-gray-700 hover:bg-gray-200">
            {SVGIcon.reload}
          </NavButton>

          <NavButton onClick={handleToggleBookmark} title="Bookmark this page"
            className={hasBookmark ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-500 hover:bg-gray-200'}>
            {SVGIcon.bookmark(hasBookmark)}
          </NavButton>

          <NavButton onClick={() => setIsFindMode(true)} title="Find (Ctrl+F)"
            className="text-gray-500 hover:bg-gray-200">
            {SVGIcon.find}
          </NavButton>

          {/* URL Bar */}
          <div className="flex-1 mx-1">
            <div className={clsx('flex items-center h-7 px-3 rounded-full border transition-all shadow-sm',
              isFocused ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400')}>
              <div className="flex-shrink-0 mr-1.5">
                {currentUrl && isSecureUrl(currentUrl) ? SVGIcon.lock : SVGIcon.unlock}
              </div>
              <input ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Search or enter URL"
                className="flex-1 bg-transparent outline-none text-xs text-gray-800 placeholder-gray-400" />
              {activeTab?.isLoading && (
                <div className="flex-shrink-0 ml-1.5">
                  <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

          <NavButton onClick={() => openModal('bookmarks')} title="Show Bookmarks"
            className="text-gray-500 hover:bg-gray-200">
            {SVGIcon.bookmarks}
          </NavButton>

          {/* Menu */}
          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowMenu(!showMenu)}
              className="w-8 h-8 flex items-center justify-center text-gray-700 hover:bg-gray-200 rounded transition-colors"
              title="Menu">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 10a2 2 0 100-4 2 2 0 000 4zm0 2a4 4 0 110-8 4 4 0 010 8zm0 2a6 6 0 100-12 6 6 0 000 12z" />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 text-sm">
                <MenuButton onClick={() => openModal('passwords')} icon="🔐" label="Passwords" />
                <MenuButton onClick={() => openModal('history')} icon="📜" label="History" />
                <MenuButton onClick={() => openModal('downloads')} icon="⬇️" label="Downloads" />
                <MenuButton onClick={() => openModal('settings')} icon="⚙️" label="Settings" />
              </div>
            )}
          </div>
        </div>

        {/* Search Suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div ref={suggestionsRef}
            className="absolute left-0 right-0 bg-white border-b shadow-lg z-40 max-h-80 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.url}-${index}`}
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-3">
                <span className="text-sm">{suggestion.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{suggestion.title}</p>
                  <p className="text-xs text-gray-500 truncate">{suggestion.url}</p>
                </div>
                <span className="text-xs text-gray-400 capitalize">{suggestion.type}</span>
              </button>
            ))}
          </div>
        )}

        {/* Find In Page */}
        {isFindMode && (
          <FindInPage
            activeWebview={getActiveWebview()}
            onClose={() => setIsFindMode(false)}
          />
        )}
      </div>

      {/* Modals */}
      {modalType === 'history' && <HistoryModal onClose={() => setModalType(null)} onNavigate={(url) => onNavigate(activeTab?.id, url)} />}
      {modalType === 'downloads' && <DownloadsModal onClose={() => setModalType(null)} />}
      {modalType === 'settings' && <SettingsModal onClose={() => setModalType(null)} />}
      {modalType === 'passwords' && <PasswordsModal onClose={() => setModalType(null)} />}
      {modalType === 'bookmarks' && (
        <BookmarksModal
          onClose={() => setModalType(null)}
          currentUrl={currentUrl}
          onNavigate={(url) => { onNavigate(activeTab?.id, url); }}
        />
      )}
    </>
  );
}

// Menu button helper
function MenuButton({ onClick, icon, label }) {
  return (
    <button onClick={onClick}
      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-3">
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// Export memoized component
export const NavigationBar = memo(NavigationBarInner);
