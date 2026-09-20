import { useCallback, useEffect, useRef } from "react";
import {
  TabBar,
  NavigationBar,
  useKeyboardShortcuts,
  browser,
} from "./components";
import { useTabStore } from "./stores/tabs";
import { useSession } from "./hooks/useSession";
import { useHistoryStore } from "./stores/history";
import { StudentShareButton } from "./components/StudentShareButton";

function App() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const addTab = useTabStore((s) => s.addTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const tabs = useTabStore((s) => s.tabs);
  const navigate = useTabStore((s) => s.navigate);

  const { save } = useSession();

  const addToHistory = useHistoryStore((s) => s.addItem);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Track if initial WebView creation has happened
  const webViewInitialized = useRef(false);
  // Track last navigated URL + tab so tab-switch navigation fires even when the
  // target tab's URL equals the previously navigated URL (e.g. duplicate tab,
  // or switching back to a tab that shares the same URL as the last nav).
  const lastNavigatedTab = useRef({ url: null, tabId: null });

  useEffect(() => {
    if (activeTab && activeTab.url && activeTab.url.startsWith("http")) {
      addToHistory(activeTab.url, activeTab.title, activeTab.favicon || null);
    }
  }, [activeTab?.url, activeTab?.title, addToHistory, activeTab]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      save();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [save]);

  // Navigate on tab switch. Always call browser.navigate when switching tabs —
  // even if the target URL equals the last navigated URL, the WebView may be
  // showing a different tab's content (e.g. after duplicateTab or rapid switches).
  useEffect(() => {
    if (activeTabId && activeTab && activeTab.url) {
      // Navigate if this is a different tab OR a different URL than last navigated.
      const urlChanged = activeTab.url !== lastNavigatedTab.current.url;
      const tabChanged = activeTab.id !== lastNavigatedTab.current.tabId;
      if (urlChanged || tabChanged) {
        lastNavigatedTab.current = { url: activeTab.url, tabId: activeTab.id };
        browser.navigate(activeTab.url, activeTabId, "tab_switch").then(() => {
          browser.injectUrlTracker().catch(() => {});
        });
      }
    }
  }, [activeTabId, activeTab]);

  // ── overlay-listener: singleton per app-lifetime ──────────────────────────────────
  // [FIX] empty deps — registered once; all handlers use useTabStore.getState() for fresh state
  // [FIX] use `mounted` flag to prevent race-condition double-listener in React.StrictMode:
  //   StrictMode remounts effects (mount→unmount→mount), cleanup runs before async completes,
  //   so vars are null and unlisten() is never called. The flag prevents the setter from
  //   running after unmount, breaking the leak.
  useEffect(() => {
    let unlistenNavigate = null;
    let unlistenBookmarkToggle = null;
    let unlistenNewTab = null;
    let mounted = true;  // ← guard against async race condition

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        unlistenNavigate = await listen("overlay-navigate", (event) => {
          if (!mounted) return;
          const url = event.payload;
          if (!url) return;
          const { activeTabId } = useTabStore.getState();
          if (!activeTabId) return;
          browser.navigate(url, activeTabId, "overlay").then(() => {
            browser.injectUrlTracker().catch(() => {});
          });
        });

        unlistenBookmarkToggle = await listen("overlay-bookmark-toggle", () => {
          // no-op for now
        });

        unlistenNewTab = await listen("overlay-new-tab", (event) => {
          if (!mounted) return;
          const action = event.payload?.action;
          if (!action) return;
          const destUrl =
            action === "history" ? "brwsr://history" :
            action === "downloads" ? "brwsr://downloads" : null;
          if (!destUrl) return;

          const state = useTabStore.getState();
          const existing = state.tabs.find(t =>
            t.url === destUrl || t.history?.includes(destUrl)
          );
          if (existing) {
            state.setActiveTab(existing.id);
            return;
          }

          const newTabId = state.addTab();
          if (!newTabId) return;

          // Set the intended destination URL BEFORE setActiveTab triggers the tab-switch effect.
          // Without this, the effect would navigate the new tab to brwsr://ntp before
          // the intended History/Downloads navigation.
          state.updateTab(newTabId, {
            url: destUrl,
            title: action === "history" ? "History" : "Downloads",
          });

          state.setActiveTab(newTabId);
          browser.createTab(newTabId);
          browser.navigate(destUrl, newTabId, "overlay").then(() => {
            browser.injectUrlTracker().catch(() => {});
          });
        });
      } catch (err) {
        console.warn("[App] overlay-listener setup failed:", err);
      }
    })();

    return () => {
      mounted = false;  // ← stop any async setter from running after unmount
      unlistenNavigate?.();
      unlistenBookmarkToggle?.();
      unlistenNewTab?.();
    };
  }, []);  // ──────────────────────────────────────────────────────────────────────────────

  // ── URL-change listener: singleton, reads fresh Zustand state ─────────────────────────
  useEffect(() => {
    let unlisten = null;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("webview-url-changed", (event) => {
          const url = event.payload;
          if (!url || typeof url !== "string" || (!url.startsWith("http") && !url.startsWith("brwsr://"))) return;

          // Map physical localhost resource URLs back to logical brwsr:// URLs.
          // This decouples the physical WebView URL (dev server origin) from the logical
          // browser tab URL, allowing shared localStorage while preserving the browser's
          // logical URL state.
          let logicalUrl = url;
          if (url === "http://localhost:1421/src/history.html") {
            logicalUrl = "brwsr://history";
          } else if (url === "http://localhost:1421/src/downloads.html") {
            logicalUrl = "brwsr://downloads";
          }

          const state = useTabStore.getState();
          const { activeTabId, tabs } = state;
          if (!activeTabId) return;
          const tab = tabs.find(t => t.id === activeTabId);
          if (!tab || tab.url === logicalUrl) return;

          // Check if URL is already in history (back/forward navigation via native WebView)
          const existingIdx = tab.history.indexOf(logicalUrl);

          let updates = {
            url: logicalUrl,
            isLoading: false,
            favicon: (() => {
              try {
                return `https://www.google.com/s2/favicons?domain=${new URL(logicalUrl).hostname}&sz=32`;
              } catch { return tab.favicon; }
            })(),
          };

          if (existingIdx !== -1) {
            // Native back/forward: sync historyIndex to where we actually are
            updates.historyIndex = existingIdx;
            updates.canGoBack = existingIdx > 0;
            updates.canGoForward = existingIdx < tab.history.length - 1;
          } else {
            // New navigation from WebView (e.g. clicking a link): treat as new forward nav
            const newHistory = [...tab.history.slice(0, tab.historyIndex + 1), logicalUrl];
            updates.history = newHistory;
            updates.historyIndex = newHistory.length - 1;
            updates.canGoBack = true;
            updates.canGoForward = false;
          }

          state.updateTab(activeTabId, updates);
        });
      } catch (err) {
        console.warn("[App] webview-url-changed listener failed:", err);
      }
    })();
    return () => { unlisten?.(); };
  }, []);  // ──────────────────────────────────────────────────────────────────────────

  // ── history-navigate listener: tab switch to history page items ───────────────────
  // Listens for clicks on history items inside the browser WebView.
  // Navigates the current (active) tab to the clicked URL without creating a new tab.
  useEffect(() => {
    let unlisten = null;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");

        unlisten = await listen("history-navigate", (event) => {
          const url = event.payload;
          if (!url || typeof url !== "string") return;
          const state = useTabStore.getState();
          const { activeTabId } = state;
          if (!activeTabId) return;
          browser.navigate(url, activeTabId, "history-item").then(() => {
            browser.injectUrlTracker().catch(() => {});
          });
        });
      } catch (err) {
        console.warn("[App] history-navigate listener failed:", err);
      }
    })();
    return () => { unlisten?.(); };
  }, []);  // ──────────────────────────────────────────────────────────────────────────

  const handleTabClick = useCallback(
    (tabId) => {
      setActiveTab(tabId);
    },
    [setActiveTab],
  );

  const handleNewTab = useCallback(() => {
    console.info("[NEW_TAB_01] + UI handler entered");
    console.info("[NEW_TAB_01] timestamp:", Date.now());
    try {
      console.info("[NEW_TAB_02] frontend tab state update started");
      const newTabId = addTab();
      console.info("[NEW_TAB_02] frontend tab state update completed, newTabId:", newTabId);
      console.info("[NEW_TAB_02] timestamp:", Date.now());
      if (newTabId) {
        console.info("[NEW_TAB_03] about to call backend createTab");
        console.info("[NEW_TAB_03] timestamp:", Date.now());
        browser.createTab(newTabId);
        console.info("[NEW_TAB_03] backend createTab called");
        console.info("[NEW_TAB_03] timestamp:", Date.now());
      }
    } catch (err) {
      console.error("[NEW_TAB_XX] UNCAUGHT EXCEPTION in handleNewTab:", err);
      console.error("[NEW_TAB_XX] timestamp:", Date.now());
    }
  }, [addTab]);

  const handleCloseTab = useCallback(
    (tabId) => {
      const state = useTabStore.getState();
      const wasActive = state.activeTabId === tabId;

      browser.closeTab(tabId);

      removeTab(tabId);

      const newActiveTab = useTabStore.getState().getActiveTab();

      if (wasActive) {
        // Always navigate after closing the active tab, even when closing the last
        // tab (getActiveTab() returns undefined — create a replacement NTP tab).
        if (!newActiveTab) {
          const replacementId = useTabStore.getState().addTab();
          browser.createTab(replacementId).catch(() => {});
          // Update the nav-ref BEFORE the tab-switch effect runs so the effect
          // sees consistent state and does not double-navigate.
          lastNavigatedTab.current = { url: "brwsr://ntp", tabId: replacementId };
          browser.navigate("brwsr://ntp", replacementId, "tab_switch").then(() => {
            browser.injectUrlTracker().catch(() => {});
          });
        } else {
          // Navigate to the new active tab's URL (tab-switch effect would normally
          // handle this, but we call it directly so the navigate is guaranteed).
          browser.navigate(newActiveTab.url, newActiveTab.id, "tab_switch").then(() => {
            browser.injectUrlTracker().catch(() => {});
          });
        }
      }
    },
    [removeTab],
  );

  const handleNavigate = useCallback(
    (tabId, url) => {
      navigate(tabId, url);
      browser.navigate(url, tabId, "typed_url").then(() => {
        browser.injectUrlTracker().catch(() => {});
      });
    },
    [navigate],
  );

  const handleReload = useCallback(() => {
    browser.reload().then(() => {
      browser.injectUrlTracker().catch(() => {});
    });
  }, []);

  const handleBack = useCallback(() => {
    const { activeTabId } = useTabStore.getState();
    if (activeTabId) {
      useTabStore.getState().goBack(activeTabId);
    }
    browser.back().then(() => {
      browser.injectUrlTracker().catch(() => {});
    });
  }, []);

  const handleForward = useCallback(() => {
    const { activeTabId } = useTabStore.getState();
    if (activeTabId) {
      useTabStore.getState().goForward(activeTabId);
    }
    browser.forward().then(() => {
      browser.injectUrlTracker().catch(() => {});
    });
  }, []);

  useKeyboardShortcuts({
    onNewTab: handleNewTab,
    onCloseTab: handleCloseTab,
    onReload: handleReload,
    onGoBack: handleBack,
    onGoForward: handleForward,
  });

  // Diagnostic: Ctrl+Shift+D = run browser exclusion diagnostic
  useEffect(() => {
    const handleDiag = async (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        try {
          const { browserCommands } = await import("./components/browserCommands");
          console.info("[DIAG] Running browser exclusion diagnostic...");
          const result = await browserCommands.diagnoseBrowserExclusion();
          console.info("[DIAG] Result:", JSON.stringify(result, null, 2));
          alert("Diagnostic done. Check console logs for [COORD] and [TEST_A] output.");
        } catch (err) {
          console.error("[DIAG] Failed:", err);
          alert("Diagnostic failed: " + err);
        }
      }
      // Ctrl+Shift+R = restore full region
      if (e.ctrlKey && e.shiftKey && e.key === "R") {
        e.preventDefault();
        try {
          const { browserCommands } = await import("./components/browserCommands");
          const msg = await browserCommands.restoreBrowserFullRegion();
          console.info("[DIAG] Restored:", msg);
          alert("Full region restored: " + msg);
        } catch (err) {
          console.error("[DIAG] Restore failed:", err);
        }
      }
      // Ctrl+Shift+G = forensic browser geometry diagnostic
      if (e.ctrlKey && e.shiftKey && e.key === "G") {
        e.preventDefault();
        try {
          const { browserCommands } = await import("./components/browserCommands");
          console.info("[FORENSIC] Running browser geometry diagnostic...");
          const msg = await browserCommands.diagnoseBrowserGeometry();
          console.info("[FORENSIC] Result:", msg);
          alert("Geometry diagnostic complete.\nForensic log: %TEMP%\\eduos-browser-hwnd-diagnostic.log\n" + msg);
        } catch (err) {
          console.error("[FORENSIC] Geometry diagnostic failed:", err);
          alert("Geometry diagnostic failed: " + err);
        }
      }
      // Ctrl+Shift+N = non-overlap experiment (browser WRY repositioned then restored)
      if (e.ctrlKey && e.shiftKey && e.key === "N") {
        e.preventDefault();
        try {
          const { browserCommands } = await import("./components/browserCommands");
          console.info("[FORENSIC] Running non-overlap experiment...");
          const msg = await browserCommands.experimentBrowserNonoverlap();
          console.info("[FORENSIC] Result:", msg);
          alert("Non-overlap experiment complete.\nForensic log: %TEMP%\\eduos-browser-hwnd-diagnostic.log\n" + msg);
        } catch (err) {
          console.error("[FORENSIC] Non-overlap experiment failed:", err);
          alert("Non-overlap experiment failed: " + err);
        }
      }
      // Ctrl+Shift+P = hide native overlay window
      if (e.ctrlKey && e.shiftKey && e.key === "P") {
        e.preventDefault();
        try {
          const { browserCommands } = await import("./components/browserCommands");
          console.info("[OVERLAY] Hiding native overlay...");
          const msg = await browserCommands.hideOverlayWindow();
          console.info("[OVERLAY] Result:", msg);
        } catch (err) {
          console.error("[OVERLAY] Hide failed:", err);
        }
      }
      // Ctrl+Shift+I = forensic input/hit-test diagnostic
      if (e.ctrlKey && e.shiftKey && e.key === "I") {
        e.preventDefault();
        try {
          const { browserCommands } = await import("./components/browserCommands");
          console.info("[INPUT-DIAG] Running forensic input diagnostic...");
          const msg = await browserCommands.forensicInputDiagnostic();
          console.info("[INPUT-DIAG] Result:", msg);
          alert("Input diagnostic complete.\nCheck console [INPUT-DIAG] logs.\n" + msg);
        } catch (err) {
          console.error("[INPUT-DIAG] Failed:", err);
          alert("Input diagnostic failed: " + err);
        }
      }
      // Ctrl+Shift+O = show debug overlay (minimal experiment)
      if (e.ctrlKey && e.shiftKey && e.key === "O") {
        e.preventDefault();
        console.info("[OVERLAY-FRONTEND] CTRL_SHIFT_O_TRIGGERED");
        try {
          const { browserCommands } = await import("./components/browserCommands");
          console.info("[OVERLAY-FRONTEND] BEFORE_INVOKE");
          const msg = await browserCommands.showDebugOverlay();
          console.info("[OVERLAY-FRONTEND] AFTER_INVOKE");
          console.info("[OVERLAY-FRONTEND] Result:", msg);
          alert("Debug overlay triggered.\nLog: %TEMP%\\eduos-native-overlay.log\n" + msg);
        } catch (err) {
          console.error("[OVERLAY-FRONTEND] INVOKE_ERROR=", err);
          alert("Debug overlay failed: " + err);
        }
      }
      // Ctrl+Shift+D = decorations=false experiment (borderless window)
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        console.info("[OVERLAY-FRONTEND] CTRL_SHIFT_D_TRIGGERED");
        try {
          const { browserCommands } = await import("./components/browserCommands");
          console.info("[OVERLAY-FRONTEND] BEFORE_INVOKE");
          const msg = await browserCommands.showMinimalDecoratedFalse();
          console.info("[OVERLAY-FRONTEND] AFTER_INVOKE");
          console.info("[OVERLAY-FRONTEND] Result:", msg);
          alert("Decorated-false experiment.\nLog: %TEMP%\\eduos-native-overlay.log\n" + msg);
        } catch (err) {
          console.error("[OVERLAY-FRONTEND] INVOKE_ERROR=", err);
          alert("Decorated-false experiment failed: " + err);
        }
      }
      // Ctrl+Shift+M = minimal window threading experiment
      if (e.ctrlKey && e.shiftKey && e.key === "M") {
        e.preventDefault();
        try {
          const { browserCommands } = await import("./components/browserCommands");
          console.info("[MINWIN] Running minimal window experiment...");
          const msg = await browserCommands.showMinimalWindowExperiment();
          console.info("[MINWIN] Result:", msg);
          alert("Minimal window experiment triggered.\nLog: %TEMP%\\eduos-native-overlay.log\n" + msg);
        } catch (err) {
          console.error("[MINWIN] Failed:", err);
          alert("Minimal window experiment failed: " + err);
        }
      }
      // Ctrl+Shift+T = minimal borderless always-on-top experiment
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        try {
          const { browserCommands } = await import("./components/browserCommands");
          console.info("[TOPMOST] Running minimal borderless topmost experiment...");
          const msg = await browserCommands.showMinimalTopmost();
          console.info("[TOPMOST] Result:", msg);
          alert("Borderless topmost experiment triggered.\nLog: %TEMP%\\eduos-native-overlay.log\n" + msg);
        } catch (err) {
          console.error("[TOPMOST] Failed:", err);
          alert("Borderless topmost experiment failed: " + err);
        }
      }
    };
    window.addEventListener("keydown", handleDiag);
    return () => window.removeEventListener("keydown", handleDiag);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <TabBar onTabClick={handleTabClick} onNewTab={handleNewTab} onCloseTab={handleCloseTab} />

      <NavigationBar
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onNavigate={handleNavigate}
        onNewTab={handleNewTab}
      />

      <StudentShareButton />
    </div>
  );
}

export default App;
