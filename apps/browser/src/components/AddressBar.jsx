import { useState, useRef, useEffect } from "react";
import { useTabStore } from "../stores/tabs";

export function AddressBar() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const navigate = useTabStore((s) => s.navigate);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [inputValue, setInputValue] = useState(activeTab?.url || "");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isFocused && activeTab) {
      setInputValue(activeTab.url);
    }
  }, [activeTab?.url, isFocused]);

  const handleSubmit = (e) => {
    if (e.key === "Enter" && activeTabId) {
      let url = inputValue.trim();

      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        if (url.includes(".") && !url.includes(" ")) {
          url = "https://" + url;
        } else {
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
      }

      navigate(activeTabId, url);
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
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

        {activeTab?.isLoading && (
          <div className="flex-shrink-0 ml-2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-[#4361ee] rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
