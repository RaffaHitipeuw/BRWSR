import { useCallback, useEffect, useState } from "react";
import {
  TabBar,
  NavigationBar,
  useKeyboardShortcuts,
  ToastContainer,
  NotificationCenter,
  NotificationBell,
  AppLauncher,
  EDUOS_APPS,
  browser,
  Run1Panel,
} from "./components";
import { useTabStore } from "./stores/tabs";
import { useSession } from "./hooks/useSession";
import { useHistoryStore } from "./stores/history";

function App() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const addTab = useTabStore((s) => s.addTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const tabs = useTabStore((s) => s.tabs);
  const navigate = useTabStore((s) => s.navigate);

  const [showLauncher, setShowLauncher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showRun1, setShowRun1] = useState(false);

  // Session management
  const { save } = useSession();

  // Add to history when URL changes
  const addToHistory = useHistoryStore((s) => s.addItem);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Track history on navigation
  useEffect(() => {
    if (activeTab && activeTab.url && activeTab.url.startsWith("http")) {
      addToHistory(activeTab.url, activeTab.title, activeTab.favicon || null);
    }
  }, [activeTab?.url, activeTab?.title, addToHistory, activeTab]);

  // Save session before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      save();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [save]);

  // Navigate to active tab URL on mount and tab switch
  useEffect(() => {
    if (activeTabId && activeTab && activeTab.url) {
      browser.navigate(activeTab.url, activeTabId, "tab_switch");
    }
  }, [activeTabId, activeTab?.url, activeTab]);

  // Tab switching - just update active tab, navigation handled by useEffect
  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
    },
    [setActiveTab],
  );

  // New tab - tab already has default URL (Google)
  const handleNewTab = useCallback(() => {
    const newTabId = addTab();
    // Register new tab with backend
    if (newTabId) {
      browser.createTab(newTabId);
    }
  }, [addTab]);

  // Close tab - store auto-creates new tab if none left
  const handleCloseTab = useCallback(
    (tabId: string) => {
      const state = useTabStore.getState();
      const wasActive = state.activeTabId === tabId;

      // Close tab in backend
      browser.closeTab(tabId);

      removeTab(tabId);

      // Navigate to new active tab after close
      const newActiveTab = useTabStore.getState().getActiveTab();
      if (newActiveTab && wasActive) {
        browser.navigate(newActiveTab.url, newActiveTab.id, "tab_switch");
      }
    },
    [removeTab],
  );

  // Navigate
  const handleNavigate = useCallback(
    (tabId: string, url: string) => {
      navigate(tabId, url);
      browser.navigate(url, tabId, "typed_url");
    },
    [navigate],
  );

  // Reload
  const handleReload = useCallback(() => {
    browser.reload();
  }, []);

  // Back
  const handleBack = useCallback(() => {
    browser.back();
  }, []);

  // Forward
  const handleForward = useCallback(() => {
    browser.forward();
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewTab: handleNewTab,
    onCloseTab: handleCloseTab,
    onReload: handleReload,
    onGoBack: handleBack,
    onGoForward: handleForward,
  });

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowLauncher(true);
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "R") {
        e.preventDefault();
        setShowRun1(!showRun1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showRun1]);

  // Handle launcher app selection
  const handleSelectApp = useCallback(
    (app: { id: string; url?: string }) => {
      if (app.url && activeTabId) {
        handleNavigate(activeTabId, app.url);
      }
      setShowLauncher(false);
    },
    [activeTabId, handleNavigate],
  );

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Tab Bar - always on top */}
      <TabBar onTabClick={handleTabClick} onNewTab={handleNewTab} onCloseTab={handleCloseTab} />

      {/* Navigation Bar */}
      <NavigationBar
        onBack={handleBack}
        onForward={handleForward}
        onReload={handleReload}
        onNavigate={handleNavigate}
        onNewTab={handleNewTab}
      />

      {/* Floating Action Buttons */}
      <div className="absolute top-[96px] right-2 flex items-center gap-1.5 z-50">
        <NotificationBell onClick={() => setShowNotifications(true)} />

        {/* RUN 1 Benchmark Toggle */}
        <button
          onClick={() => setShowRun1(!showRun1)}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors backdrop-blur-sm text-xs font-mono ${
            showRun1
              ? "bg-green-600/80 text-white hover:bg-green-600"
              : "bg-black/50 text-white hover:bg-black/70"
          }`}
          title="RUN 1 Benchmark (Ctrl+Shift+R)"
        >
          R1
        </button>

        <button
          onClick={() => setShowLauncher(true)}
          className="w-8 h-8 flex items-center justify-center bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors backdrop-blur-sm"
          title="App Launcher (Ctrl+K)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9a9 9 0 01-9-9"
            />
          </svg>
        </button>
      </div>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Notification Center */}
      <NotificationCenter isOpen={showNotifications} onClose={() => setShowNotifications(false)} />

      {/* App Launcher */}
      <AppLauncher
        isOpen={showLauncher}
        onClose={() => setShowLauncher(false)}
        apps={EDUOS_APPS}
        onSelectApp={handleSelectApp}
      />

      {/* RUN 1 Benchmark Panel */}
      {showRun1 && <Run1Panel onClose={() => setShowRun1(false)} />}
    </div>
  );
}

export default App;
