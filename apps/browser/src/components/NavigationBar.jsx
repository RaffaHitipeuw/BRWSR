import { clsx } from "clsx";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTabStore } from "../stores/tabs";
import { useBookmarksStore } from "../stores/bookmarks";

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
const UI_HEIGHT_LOGICAL = 88;
const UI_HEIGHT_PHYSICAL = Math.round(UI_HEIGHT_LOGICAL * SCALE);

// ============================================================
// PHASE 5: TEMPORARY DEBUG MODE — binary test
// Set to true to use an obviously-visible test overlay.
// ============================================================
const DEBUG_OVERLAY_MODE = true;

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
          : "text-gray-300 hover:bg-gray-100 active:bg-gray-200"
      )}
    >
      {children}
    </button>
  );
}

// ─── Native Overlay Integration ─────────────────────────────────────────────
// The bookmark menu is shown via a dedicated native overlay window,
// completely bypassing the sibling WebView2 z-order/airspace problem.
// A transparent click-capture div in the main React app handles
// "click outside to close" since the overlay is a separate native window.

/** Show the native overlay window with given viewport-relative rect (logical coords). */
async function showNativeOverlay(rect) {
  // ── PHASE 1: FRONTEND TRACE ───────────────────────────────────────────────
  console.group("[OVERLAY:UI] showNativeOverlay() called");
  console.info("[OVERLAY:UI] CLICK RECEIVED: YES");
  console.info("[OVERLAY:UI] rect input:", JSON.stringify(rect));
  console.info("[OVERLAY:UI] window.devicePixelRatio:", window.devicePixelRatio);

  // Calculate viewport PHYSICAL coords
  const viewportXPhys = Math.round(rect.left * SCALE);
  const viewportYPhys = Math.round(rect.top * SCALE);
  const widthPhys = Math.round(rect.width * SCALE);
  const heightPhys = Math.round(rect.height * SCALE);

  console.info("[OVERLAY:UI] Arguments to IPC:");
  console.info(`  overlay_type: "bookmark_menu"`);
  console.info(`  viewport_x:   ${viewportXPhys}`);
  console.info(`  viewport_y:   ${viewportYPhys}`);
  console.info(`  width:        ${widthPhys}`);
  console.info(`  height:       ${heightPhys}`);

  // ── PHASE 2: IPC WRAPPER TRACE ───────────────────────────────────────────
  try {
    const { browserCommands } = await import("./browserCommands");
    console.info("[OVERLAY:UI] IPC INVOKED: YES");

    // ── DEBUG MODE: Force an obvious test position ────────────────────────
    let args;
    if (DEBUG_OVERLAY_MODE) {
      // Debug mode: use a large, centered, OBVIOUS position
      // This bypasses all geometry calculations to test the binary question:
      // "Can the overlay window appear at all?"
      args = {
        overlayType: "debug",
        viewportX: 100,   // screen offset from browser top-left
        viewportY: 100,  // screen offset from browser top-left
        width: 500,      // large obvious width
        height: 500,     // large obvious height
      };
      console.info("[OVERLAY:UI] DEBUG MODE: using obvious test position");
      console.info("[OVERLAY:UI] DEBUG ARGS:", JSON.stringify(args));
    } else {
      args = {
        overlayType: "bookmark_menu",
        viewportX: viewportXPhys,
        viewportY: viewportYPhys,
        width: widthPhys,
        height: heightPhys,
      };
    }

    const result = await browserCommands.showNativeOverlay(
      args.overlayType,
      args.viewportX,
      args.viewportY,
      args.width,
      args.height,
    );

    console.info("[OVERLAY:UI] COMMAND SUCCESS:", result);
    console.groupEnd();

    // Pass current bookmark state to the overlay window via localStorage
    const state = useBookmarksStore.getState();
    const tabStore = useTabStore.getState();
    const activeTab = tabStore.tabs.find((t) => t.id === tabStore.activeTabId);
    const url = activeTab?.url || "";
    const isBookmarked = state.isBookmarked(url);
    localStorage.setItem(
      "eduos-overlay-bookmark-state",
      JSON.stringify({ url, isBookmarked }),
    );
  } catch (error) {
    console.error("[OVERLAY:UI] COMMAND FAILED:", error);
    console.error("[OVERLAY:UI] Error name:", error?.name);
    console.error("[OVERLAY:UI] Error message:", error?.message);
    if (error && typeof error === "object") {
      console.error("[OVERLAY:UI] Error keys:", Object.keys(error));
      for (const key of Object.keys(error)) {
        console.error(`  ${key}:`, error[key]);
      }
    }
    console.groupEnd();
    // Do NOT silently swallow — rethrow so the error is visible
    throw error;
  }
}

/** Hide the native overlay window. */
async function hideNativeOverlay() {
  console.info("[OVERLAY:UI] hideNativeOverlay() called");
  try {
    const { browserCommands } = await import("./browserCommands");
    const result = await browserCommands.hideNativeOverlay();
    console.info("[OVERLAY:UI] hideNativeOverlay SUCCESS:", result);
  } catch (error) {
    console.error("[OVERLAY:UI] hideNativeOverlay FAILED:", error);
    throw error;
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

  // Escape key → close overlay
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape" && showMenu) {
        console.info("[OVERLAY:UI] Escape pressed, closing overlay");
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
    if (urlInput.trim() && activeTabId) {
      let url = urlInput.trim();

      if (url.includes(".") && !url.includes(" ")) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }
      } else {
        const encodedQuery = encodeURIComponent(url);
        url = `https://www.google.com/search?q=${encodedQuery}`;
      }

      onNavigate(activeTabId, url);
    }
  };

  const handleInputFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  // Menu button click → show native overlay
  const handleMenuToggle = useCallback(() => {
    console.info("[OVERLAY:UI] === MENU BUTTON CLICK ===");
    console.info("[OVERLAY:UI] showMenu currently:", showMenu);

    if (showMenu) {
      console.info("[OVERLAY:UI] Closing overlay (toggle off)");
      setShowMenu(false);
      hideNativeOverlay();
    } else {
      console.info("[OVERLAY:UI] Opening overlay (toggle on)");
      // Position the native overlay at the dropdown location in the viewport.
      // The dropdown card was: left-2, top-12 (navbar-relative), w-72 (288px), ~350px tall.
      // Navbar height = 48 logical px. Dropdown top in viewport coords = 48 + 12 = 60.
      setShowMenu(true);
      showNativeOverlay({
        left: 8,
        top: 60,
        width: 288,
        height: 350,
      });
    }
  }, [showMenu]);

  return (
    <>
      {/* Transparent click-capture overlay — closes native overlay when clicking outside the dropdown.
          Only rendered when the menu is open. pointerEvents:auto lets it receive clicks. */}
      {showMenu && (
        <div
          className="fixed inset-0"
          style={{ background: "transparent", zIndex: 99998, pointerEvents: "auto" }}
          onClick={() => {
            console.info("[OVERLAY:UI] Click-outside detected, closing overlay");
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
