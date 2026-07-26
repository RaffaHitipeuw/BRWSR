import { useCallback, useEffect, useState } from "react";
import {
  TabBar,
  NavigationBar,
  useBrowserShortcuts,
  ToastContainer,
  NotificationCenter,
  NotificationBell,
  AppLauncher,
  EDUOS_APPS,
  browser,
} from "./components";
import { useTabStore } from "./stores/tabs";

function App() {
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const addTab = useTabStore((s) => s.addTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const tabs = useTabStore((s) => s.tabs);

  const [showLauncher, setShowLauncher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Tab switching - also re-navigate the single shared content webview
  // to whatever URL that tab was last on, otherwise clicking a tab just
  // changes which pill is highlighted without changing what's on screen.
  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
      if (tab) {
        browser.navigate(tab.url);
      }
    },
    [setActiveTab],
  );

  // New tab - navigate browser to Google
  const handleNewTab = useCallback(() => {
    addTab();
    browser.navigate("https://www.google.com");
  }, [addTab]);

  // Close tab - after closing, the store auto-picks a new active tab;
  // make sure the shared content webview actually follows it.
  const handleCloseTab = useCallback(
    (tabId: string) => {
      removeTab(tabId);
      const newActiveTab = useTabStore.getState().getActiveTab();
      if (newActiveTab) {
        browser.navigate(newActiveTab.url);
      }
    },
    [removeTab],
  );

  // Navigate
  const handleNavigate = useCallback((tabId: string, url: string) => {
    useTabStore.getState().navigate(tabId, url);
    browser.navigate(url);
  }, []);

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
  useBrowserShortcuts(
    handleBack,
    handleForward,
    handleReload,
    handleNewTab,
    () => activeTabId && handleCloseTab(activeTabId),
  );

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
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    <div className="h-full flex flex-col bg-transparent">
      {/* Tab Bar */}
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
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0 3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
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
    </div>
  );
}

export default App;
