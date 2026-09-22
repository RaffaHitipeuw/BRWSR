import { clsx } from "clsx";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTabStore } from "../stores/tabs";
import { useBookmarksStore } from "../stores/bookmarks";
import { parseUrl } from "../utils/url";

// ─── Coordinate System ───────────────────────────────────────────────────────
//
// React (getBoundingClientRect) → viewport-relative LOGICAL coords
//   origin (0,0) = top-left of browser viewport (inside the browser WRY)
//
// Viewport logical → PHYSICAL (for Win32 SetWindowPos):
//   physical = logical * scale_factor
//   scale_factor = physical / logical (typically 1.25 on 125% DPI)
//
// Tauri overlay window: positioned at absolute screen PHYSICAL coordinates
//   screen_x = main_window.left_physical + rect.left * scale
//   screen_y = main_window.top_physical  + UI_HEIGHT_physical + rect.top * scale
//
// UI_HEIGHT = 88 logical = 88 * scale physical pixels
// ─────────────────────────────────────────────────────────────────────────────

// Scale factor — determined empirically for this window config
// Can be made dynamic by querying Tauri window.scaleFactor() if needed
const SCALE = 1.25;

// ─── Native Overlay Integration ─────────────────────────────────────────────
// The bookmark menu is shown via a dedicated native overlay window,
// completely bypassing the sibling WebView2 z-order/airspace problem.
// A transparent click-capture div in the main React app handles
// "click outside to close" since the overlay is a separate native window.

/** Show the native overlay window with given viewport-relative rect (logical coords). */
async function showNativeOverlay(rect) {
    const viewportXPhys = Math.round(rect.left * SCALE);
    const viewportYPhys = Math.round(rect.top * SCALE);
    const widthPhys = Math.round(rect.width * SCALE);
    const heightPhys = Math.round(rect.height * SCALE);

    const args = { overlayType: 'bookmark_menu', viewportX: viewportXPhys, viewportY: viewportYPhys, width: widthPhys, height: heightPhys };
    console.log("[OVERLAY_TRACE][4] TAURI_INVOKE_ATTEMPT", { command: 'show_native_overlay', args });

    try {
        const { browserCommands } = await import('./browserCommands');
        const result = await browserCommands.showNativeOverlay(
            args.overlayType, args.viewportX, args.viewportY, args.width, args.height,
        );
        console.log("[OVERLAY_TRACE] IPC_SUCCESS", result);
        const state = useBookmarksStore.getState();
        const tabStore = useTabStore.getState();
        const activeTab = tabStore.tabs.find((t) => t.id === tabStore.activeTabId);
        const url = activeTab?.url || '';
        const isBookmarked = state.isBookmarked(url);
        localStorage.setItem('eduos-overlay-bookmark-state', JSON.stringify({ url, isBookmarked }));
        return result;
    } catch (err) {
        console.error("[OVERLAY_TRACE][4] TAURI_INVOKE_ERROR", err?.message || String(err));
        throw err;
    }
}

/** Hide the native overlay window. */
async function hideNativeOverlay() {
    try {
        const { browserCommands } = await import("./browserCommands");
        await browserCommands.hideNativeOverlay();
    } catch (error) {
        console.error("[OVERLAY_TRACE] hideNativeOverlay FAILED:", error);
    }
}

export function NavigationBar({
  onBack,
  onForward,
  onReload,
  onNavigate,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const inputRef = useRef(null);

  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Sync input with active tab URL — but only if input is NOT focused (user is typing)
  useEffect(() => {
    if (activeTab?.url && document.activeElement !== inputRef.current) {
      setUrlInput(activeTab.url);
    }
  }, [activeTab?.url]);

  const addBookmark = useBookmarksStore((s) => s.addBookmark);
  const isBookmarked = useBookmarksStore((s) => s.isBookmarked);
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const bookmarks = useBookmarksStore((s) => s.items);

  // Escape key → close overlay
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape" && showMenu) {
        setShowMenu(false);
        hideNativeOverlay();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showMenu]);

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

  const handleMenuNavigate = (url) => {
    if (url) {
      onNavigate(activeTab?.id, url);
    }
    setShowMenu(false);
    hideNativeOverlay();
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    const rawInput = urlInput.trim();
    if (rawInput && activeTabId) {
      const { url, type } = parseUrl(rawInput);
      console.log("[NAV][INPUT] raw=" + rawInput);
      console.log("[NAV][CLASSIFY] type=" + type);
      console.log("[NAV][TARGET] " + url);
      console.log("[NAV][DISPATCH] navigating=" + url);
      onNavigate(activeTabId, url);
    }
  };

  const handleInputFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  // Menu button click → show native overlay
  const handleMenuToggle = useCallback((e) => {
    console.log("[OVERLAY_TRACE][1] HAMBURGER_CLICKED");
    console.log("[OVERLAY_TRACE][2] HANDLE_MENU_TOGGLE_ENTERED", { showMenu, activeTabId });

    if (showMenu) {
      console.log("[OVERLAY_TRACE] CLOSING flow");
      setShowMenu(false);
      hideNativeOverlay();
    } else {
      console.log("[OVERLAY_TRACE] OPENING flow");
      setShowMenu(true);

      const rect = { left: 8, top: 60, width: 288, height: 350 };
      console.log("[OVERLAY_TRACE][3] SHOW_NATIVE_OVERLAY_CALLED", { rect });

      showNativeOverlay(rect).then((result) => {
        console.log("[OVERLAY_TRACE] FRONTEND_SUCCESS", result);
      }).catch((err) => {
        console.error("[OVERLAY_TRACE] FRONTEND_ERROR", err);
      });
    }
  }, [showMenu, activeTabId]);

  return (
    <>
      {/* Transparent click-capture overlay — closes native overlay when clicking outside the dropdown.
          Only rendered when the menu is open. pointerEvents:auto lets it receive clicks. */}
      {showMenu && (
        <div
          className="fixed inset-0"
          style={{ background: "transparent", zIndex: 99998, pointerEvents: "auto" }}
          onClick={() => {
            setShowMenu(false);
            hideNativeOverlay();
          }}
        />
      )}

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
          onClick={handleMenuToggle}
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
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="flex-1 text-sm text-gray-800 bg-transparent outline-none"
              />
              {activeTab?.isLoading && (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin ml-2" />
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

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
