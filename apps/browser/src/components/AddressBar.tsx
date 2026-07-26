import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useTabStore } from "../stores/tabs";

export function AddressBar() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const navigate = useTabStore((s) => s.navigate);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [inputValue, setInputValue] = useState(activeTab?.url || "");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update input when URL changes externally
  useEffect(() => {
    if (!isFocused && activeTab) {
      setInputValue(activeTab.url);
    }
  }, [activeTab?.url, isFocused]);

  const handleSubmit = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && activeTabId) {
      let url = inputValue.trim();

      // Add protocol if missing
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        // Check if it's a search query or URL
        if (url.includes(".") && !url.includes(" ")) {
          url = "https://" + url;
        } else {
          // Treat as search query
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
      }

      navigate(activeTabId, url);
      inputRef.current?.blur();
    }
  };

  // Handle keyboard shortcut Ctrl+L
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex-1 mx-3">
      <div
        className={`
          flex items-center h-9 px-3 rounded-full
          bg-white border transition-all
          ${
            isFocused
              ? "border-[#4361ee] shadow-[0_0_0_2px_rgba(67,97,238,0.2)]"
              : "border-gray-200 hover:border-gray-300"
          }
        `}
      >
        {/* Security indicator */}
        <div className="flex-shrink-0 mr-2">
          {activeTab?.url.startsWith("https://") ? (
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

        {/* URL Input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleSubmit}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Search or enter URL"
          className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400"
        />

        {/* Loading indicator */}
        {activeTab?.isLoading && (
          <div className="flex-shrink-0 ml-2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#4361ee] rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
