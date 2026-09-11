import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// Tailwind classes are applied via the bundled CSS from the main app
// The overlay HTML loads index.css which includes tailwind

// ─── Coordinate System ───────────────────────────────────────────────────────
//
// React (getBoundingClientRect) → viewport-relative LOGICAL coords
//   origin (0,0) = top-left of browser viewport
//   viewport top = main window top + UI_HEIGHT logical
//
// To get screen PHYSICAL coords:
//   screen_x = main_window.left_physical + rect.left * scale
//   screen_y = main_window.top_physical  + UI_HEIGHT_physical + rect.top * scale
//
// Tauri overlay (SetWindowPos) → PHYSICAL screen coords
//   window is positioned at absolute screen pixel position
//
// The Rust side receives: viewport_x, viewport_y, width, height (all PHYSICAL)
// and calculates: screen_x = main.left + viewport_x
//                 screen_y = main.top  + viewport_y
//
// UI_HEIGHT = 88 logical = 88 * scale physical
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook to communicate with the native overlay window via Tauri IPC.
 * Converts viewport-relative logical rect to physical coords before sending.
 */
function useNativeOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  const showOverlay = useCallback(async (rect) => {
    // rect is viewport-relative: { left, top, width, height } in LOGICAL pixels
    // Tauri command expects PHYSICAL pixels
    const SCALE = 1.25; // Must match useBrowserOverlay.ts
    const UI_HEIGHT_LOGICAL = 88;
    const UI_HEIGHT_PHYSICAL = Math.round(UI_HEIGHT_LOGICAL * SCALE);

    const physicalX = Math.round(rect.left * SCALE);
    const physicalY = Math.round((rect.top + UI_HEIGHT_LOGICAL) * SCALE);
    const physicalW = Math.round(rect.width * SCALE);
    const physicalH = Math.round(rect.height * SCALE);

    // These are the BROWSER-WRY-LOCAL physical coords.
    // Rust will add main window's screen offset to get absolute screen position.

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("show_native_overlay", {
        overlayType: "bookmark_menu",
        viewportX: physicalX,
        viewportY: physicalY,
        width: physicalW,
        height: physicalH,
      });
      setIsOpen(true);
      console.info("[OVERLAY] bookmark_menu shown at logical", rect, "→ physical", { physicalX, physicalY, physicalW, physicalH });
    } catch (err) {
      console.error("[OVERLAY] show_native_overlay failed:", err);
    }
  }, []);

  const hideOverlay = useCallback(async () => {
    if (!isOpen) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("hide_native_overlay");
      setIsOpen(false);
      console.info("[OVERLAY] hidden");
    } catch (err) {
      console.error("[OVERLAY] hide_native_overlay failed:", err);
    }
  }, [isOpen]);

  return { isOpen, showOverlay, hideOverlay };
}

// ─── Bookmark Dropdown Content ───────────────────────────────────────────────
// This is a copy of the NavigationBar menu content, adapted for the overlay.
// The overlay window renders this component when bookmark_menu is shown.

function BookmarkDropdown({ onNavigate, onToggleBookmark, urlIsBookmarked, currentUrl }) {
  const handleMenuClick = (url) => {
    if (url) {
      onNavigate(url);
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
      {/* Bookmark Toggle */}
      <div className="p-2">
        <button
          onClick={onToggleBookmark}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            urlIsBookmarked
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
          }`}
        >
          <svg
            className="w-5 h-5"
            fill={urlIsBookmarked ? "currentColor" : "none"}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span className="font-medium text-sm">
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
          <span className="text-gray-700 text-sm">Google</span>
        </button>
        <button
          onClick={() => handleMenuClick("https://youtube.com")}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span className="text-gray-700 text-sm">YouTube</span>
        </button>
        <button
          onClick={() => handleMenuClick("https://github.com")}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
          <span className="text-gray-700 text-sm">GitHub</span>
        </button>
      </div>
    </div>
  );
}

// ─── Overlay App ─────────────────────────────────────────────────────────────
// Receives geometry from main app via localStorage (written by main app before showing)
// and renders the bookmark dropdown content at those coordinates.
// The window itself is positioned and sized by Rust.

function OverlayApp() {
  const [geometry, setGeometry] = useState(null);
  const [bookmarkState, setBookmarkState] = useState({ url: "", isBookmarked: false });

  // Read geometry from localStorage (set by main app before showing overlay)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("eduos-overlay-geometry");
      if (raw) {
        const g = JSON.parse(raw);
        setGeometry(g);
        console.info("[OVERLAY] Received geometry:", g);
      }
      const bs = localStorage.getItem("eduos-overlay-bookmark-state");
      if (bs) {
        setBookmarkState(JSON.parse(bs));
      }
    } catch (e) {
      console.error("[OVERLAY] Failed to read localStorage:", e);
    }

    // Also listen for messages from main app
    const handler = (e) => {
      if (e.data && e.data.type === "OVERLAY_GEOMETRY") {
        setGeometry(e.data.geometry);
        console.info("[OVERLAY] Received geometry via postMessage:", e.data.geometry);
      }
      if (e.data && e.data.type === "OVERLAY_BOOKMARK_STATE") {
        setBookmarkState(e.data.bookmarkState);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleToggleBookmark = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("overlay_bookmark_toggle");
    } catch (err) {
      console.error("[OVERLAY] bookmark toggle failed:", err);
    }
  }, []);

  const handleNavigate = useCallback(async (url) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("overlay_navigate", { url });
    } catch (err) {
      console.error("[OVERLAY] navigate failed:", err);
    }
  }, []);

  // Determine background: transparent outside content, white for dropdown card
  return (
    <div
      style={{
        background: "transparent",
        width: "100vw",
        height: "100vh",
        margin: 0,
        padding: 0,
        overflow: "hidden",
      }}
    >
      {/* The dropdown card — positioned at top-left of the overlay window.
          The Rust side sizes and positions this window to match the dropdown geometry. */}
      <div
        style={{
          width: geometry ? geometry.width : 288,
          height: geometry ? geometry.height : 320,
          background: "transparent",
          pointerEvents: "auto",
        }}
      >
        {geometry && (
          <BookmarkDropdown
            onNavigate={handleNavigate}
            onToggleBookmark={handleToggleBookmark}
            urlIsBookmarked={bookmarkState.isBookmarked}
            currentUrl={bookmarkState.url}
          />
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
);
