import { clsx } from "clsx";
import { useState, useRef, useEffect } from "react";
import { useTabStore } from "../stores/tabs";

interface NavigationBarProps {
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onNavigate: (tabId: string, url: string) => void;
  onNewTab: () => void;
}

function NavButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
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

export function NavigationBar({
  onBack,
  onForward,
  onReload,
  onNavigate,
  onNewTab,
}: NavigationBarProps) {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex items-center h-12 px-2 bg-gray-50 border-b border-gray-200 gap-1">
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
        />
      )}
    </div>
  );
}

interface AddressBarProps {
  tabId: string;
  currentUrl: string;
  isLoading: boolean;
  onNavigate: (tabId: string, url: string) => void;
  onNewTab: () => void;
}

function AddressBar({ tabId, currentUrl, isLoading, onNavigate, onNewTab }: AddressBarProps) {
  const [inputValue, setInputValue] = useState(currentUrl);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(currentUrl);
    }
  }, [currentUrl, isFocused]);

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

  const isSecure = currentUrl.startsWith("https://");

  return (
    <div className="flex-1 mx-3">
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
  );
}
