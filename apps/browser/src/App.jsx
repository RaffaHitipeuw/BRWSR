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
  const lastNavigatedUrl = useRef(null);

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

  // Navigate on tab switch only if URL is different from current WebView URL
  useEffect(() => {
    if (activeTabId && activeTab && activeTab.url) {
      // Only navigate if URL is different from last navigation
      if (activeTab.url !== lastNavigatedUrl.current) {
        lastNavigatedUrl.current = activeTab.url;
        browser.navigate(activeTab.url, activeTabId, "tab_switch");
      }
    }
  }, [activeTabId, activeTab]);

  // Listen for events from the native overlay window (bookmark/navigate actions)
  useEffect(() => {
    let unlistenNavigate = null;
    let unlistenBookmarkToggle = null;

    async function setupListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenNavigate = await listen("overlay-navigate", (event) => {
          const url = event.payload;
          console.info("[App] overlay-navigate:", url);
          if (activeTabId) {
            browser.navigate(url, activeTabId, "overlay");
          }
        });
        unlistenBookmarkToggle = await listen("overlay-bookmark-toggle", () => {
          console.info("[App] overlay-bookmark-toggle received");
          // Trigger a re-render by toggling the active tab state
          // The NavigationBar reads bookmark state directly from the store
          // so we just need to notify it changed
        });
      } catch (err) {
        console.warn("[App] Failed to setup overlay listeners:", err);
      }
    }

    setupListeners();
    return () => {
      unlistenNavigate?.();
      unlistenBookmarkToggle?.();
    };
  }, [activeTabId]);

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
      if (newActiveTab && wasActive) {
        browser.navigate(newActiveTab.url, newActiveTab.id, "tab_switch");
      }
    },
    [removeTab],
  );

  const handleNavigate = useCallback(
    (tabId, url) => {
      navigate(tabId, url);
      browser.navigate(url, tabId, "typed_url");
    },
    [navigate],
  );

  const handleReload = useCallback(() => {
    browser.reload();
  }, []);

  const handleBack = useCallback(() => {
    browser.back();
  }, []);

  const handleForward = useCallback(() => {
    browser.forward();
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
